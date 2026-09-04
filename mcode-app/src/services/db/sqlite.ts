import initSqlJs, { type Database, type SqlJsStatic } from "sql.js"
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url"

declare const plus: any

export interface SqliteDriver {
  open(): Promise<void>
  execute(sql: string, params?: unknown[]): Promise<void>
  query<T>(sql: string, params?: unknown[]): Promise<T[]>
  transaction<T>(run: () => Promise<T>): Promise<T>
}

const APP_DB_NAME = "mcode_runtime"
const APP_DB_PATH = "_doc/mcode-runtime.db"
const H5_DB_STORAGE_KEY = "mcode_runtime_sqlite_base64"
const H5_IDB_NAME = "mcode_runtime_storage"
const H5_IDB_VERSION = 1
const H5_IDB_STORE = "sqlite_blobs"
const H5_IDB_KEY = "runtime"

let opened = false
let transactionDepth = 0
let sqlJs: SqlJsStatic | null = null
let h5Db: Database | null = null
let h5StorageDbPromise: Promise<IDBDatabase> | null = null
let h5PersistQueue = Promise.resolve()

function isAppPlusRuntime() {
  return typeof plus !== "undefined" && Boolean(plus?.sqlite)
}

async function ensureOpen() {
  if (opened) return
  if (isAppPlusRuntime()) {
    await openAppDatabase()
  } else {
    await openH5Database()
  }
  opened = true
}

async function openAppDatabase() {
  await new Promise<void>((resolve, reject) => {
    plus.sqlite.openDatabase({
      name: APP_DB_NAME,
      path: APP_DB_PATH,
      success: () => resolve(),
      fail: (error: unknown) => reject(normalizeSqliteError(error)),
    })
  })
}

async function openH5Database() {
  if (!sqlJs) {
    sqlJs = await initSqlJs({
      locateFile: () => sqlWasmUrl,
    })
  }
  clearLegacyH5Storage()
  const stored = await readStoredH5Database()
  h5Db = stored ? new sqlJs.Database(stored) : new sqlJs.Database()
  installH5PersistOnPageHide()
}

/**
 * 落盘改成防抖之后，「页面被关掉」这条路径必须自己兜住 —— 否则最后 400ms 内的写会丢。
 * `pagehide` 覆盖关标签/前后退/切后台，`visibilitychange` 兜住移动端 Safari 不发
 * `pagehide` 的情况。两者都只注册一次。
 */
let h5PersistOnPageHideInstalled = false

function installH5PersistOnPageHide() {
  if (h5PersistOnPageHideInstalled) return
  if (typeof window === "undefined" || typeof document === "undefined") return
  h5PersistOnPageHideInstalled = true
  const flush = () => {
    void flushH5Database().catch(() => {})
  }
  window.addEventListener("pagehide", flush)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush()
  })
}

function getH5Database() {
  if (!h5Db) {
    throw new Error("H5 sqlite database is not opened")
  }
  return h5Db
}

async function executeAppSql(sql: string) {
  await new Promise<void>((resolve, reject) => {
    plus.sqlite.executeSql({
      name: APP_DB_NAME,
      sql,
      success: () => resolve(),
      fail: (error: unknown) => reject(normalizeSqliteError(error)),
    })
  })
}

async function queryAppSql<T>(sql: string) {
  return await new Promise<T[]>((resolve, reject) => {
    plus.sqlite.selectSql({
      name: APP_DB_NAME,
      sql,
      success: (rows: T[]) => resolve(Array.isArray(rows) ? rows : []),
      fail: (error: unknown) => reject(normalizeSqliteError(error)),
    })
  })
}

/**
 * H5 侧的落盘。
 *
 * `h5Db.export()` 会**物化整个数据库**，之后还要经 `new Uint8Array` /
 * `buffer.slice` / IndexedDB structured clone 各拷一遍。原实现在**每条 `execute`**
 * 之后都无条件跑一次（只在事务内被抑制），于是：
 *
 * - 每个 `status_changed`（每次工具调用都翻转）→ 摘要镜像 → 一次整库重写；
 * - 每 800ms 打字防抖的草稿落盘 → 一次整库重写；
 * - 冷启动 13 条 DDL（见 migrations）→ 13 次整库重写。
 *
 * 现在改成「脏标记 + 尾防抖」：写只置脏，真正的导出按静默期合并成一次。
 * `flushH5Database()` 给必须落地的时刻用（事务结束、页面隐藏/卸载）。
 */
const H5_PERSIST_DEBOUNCE_MS = 400
let h5Dirty = false
let h5PersistTimer: ReturnType<typeof setTimeout> | null = null

function markH5Dirty() {
  if (!h5Db) return
  h5Dirty = true
  if (transactionDepth > 0) return
  scheduleH5Persist()
}

function scheduleH5Persist() {
  if (h5PersistTimer) return
  h5PersistTimer = setTimeout(() => {
    h5PersistTimer = null
    void flushH5Database().catch((error) => {
      console.warn("sqlite persist failed", error)
    })
  }, H5_PERSIST_DEBOUNCE_MS)
}

/**
 * 立刻把当前数据库落盘。写路径不该直接调它 —— 调 `markH5Dirty()`。
 */
export async function flushH5Database() {
  if (h5PersistTimer) {
    clearTimeout(h5PersistTimer)
    h5PersistTimer = null
  }
  if (!h5Db || !h5Dirty) return
  if (transactionDepth > 0) {
    // 事务里导出的是未提交的中间态，没有意义。重新排一次，别把这次脏状态丢在这里
    // （`transaction()` 的 finally 也会冲，这只是双保险）。
    scheduleH5Persist()
    return
  }
  h5Dirty = false
  const bytes = new Uint8Array(h5Db.export())
  h5PersistQueue = h5PersistQueue
    .catch(() => {})
    .then(() => writeStoredH5Database(bytes))
  await h5PersistQueue
}

function readStoredH5Database() {
  return readStoredH5DatabaseFromIndexedDb()
}

function normalizeParams(params?: unknown[]) {
  return (params || []).map((value) => normalizeParamValue(value))
}

function normalizeParamValue(value: unknown) {
  if (value === undefined) return null
  if (value === null) return null
  if (typeof value === "boolean") return value ? 1 : 0
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string") return value
  return JSON.stringify(value)
}

function expandSql(sql: string, params?: unknown[]) {
  if (!params?.length) return sql
  let index = 0
  return sql.replace(/\?/g, () => serializeSqlValue(params[index++]))
}

function serializeSqlValue(value: unknown) {
  const normalized = normalizeParamValue(value)
  if (normalized === null) return "NULL"
  if (typeof normalized === "number") return String(normalized)
  return `'${String(normalized).replace(/'/g, "''")}'`
}

function normalizeSqliteError(error: unknown) {
  if (error instanceof Error) return error
  if (error && typeof error === "object") {
    const payload = error as Record<string, unknown>
    const message = payload.message || payload.msg || payload.code
    if (message) return new Error(String(message))
  }
  return new Error(String(error || "sqlite operation failed"))
}

function getIndexedDb() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is unavailable in H5 runtime")
  }
  return indexedDB
}

function getH5StorageDb() {
  if (!h5StorageDbPromise) {
    h5StorageDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = getIndexedDb().open(H5_IDB_NAME, H5_IDB_VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(H5_IDB_STORE)) {
          database.createObjectStore(H5_IDB_STORE)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(normalizeSqliteError(request.error))
      request.onblocked = () => reject(new Error("IndexedDB open blocked"))
    })
  }
  return h5StorageDbPromise
}

function clearLegacyH5Storage() {
  try {
    uni.removeStorageSync(H5_DB_STORAGE_KEY)
  } catch {}
}

async function readStoredH5DatabaseFromIndexedDb() {
  const database = await getH5StorageDb()
  return await new Promise<Uint8Array | null>((resolve, reject) => {
    const transaction = database.transaction(H5_IDB_STORE, "readonly")
    const store = transaction.objectStore(H5_IDB_STORE)
    const request = store.get(H5_IDB_KEY)

    request.onsuccess = () => {
      const result = request.result
      if (result instanceof ArrayBuffer) {
        resolve(new Uint8Array(result))
        return
      }
      if (ArrayBuffer.isView(result)) {
        const view = result as ArrayBufferView
        resolve(
          new Uint8Array(
            view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
          )
        )
        return
      }
      resolve(null)
    }
    request.onerror = () => reject(normalizeSqliteError(request.error))
    transaction.onabort = () => reject(normalizeSqliteError(transaction.error))
  })
}

async function writeStoredH5Database(bytes: Uint8Array) {
  const database = await getH5StorageDb()
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  )
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(H5_IDB_STORE, "readwrite")
    const store = transaction.objectStore(H5_IDB_STORE)
    store.put(buffer, H5_IDB_KEY)

    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(normalizeSqliteError(transaction.error))
    transaction.onerror = () => reject(normalizeSqliteError(transaction.error))
  })
}

export const sqliteDriver: SqliteDriver = {
  async open() {
    await ensureOpen()
  },

  async execute(sql: string, params?: unknown[]) {
    await ensureOpen()
    if (isAppPlusRuntime()) {
      await executeAppSql(expandSql(sql, params))
      return
    }

    const database = getH5Database()
    database.run(sql, normalizeParams(params))
    markH5Dirty()
  },

  async query<T>(sql: string, params?: unknown[]) {
    await ensureOpen()
    if (isAppPlusRuntime()) {
      return await queryAppSql<T>(expandSql(sql, params))
    }

    const database = getH5Database()
    const statement = database.prepare(sql)
    try {
      statement.bind(normalizeParams(params))
      const rows: T[] = []
      while (statement.step()) {
        rows.push(statement.getAsObject() as T)
      }
      return rows
    } finally {
      statement.free()
    }
  },

  async transaction<T>(run: () => Promise<T>) {
    await ensureOpen()
    transactionDepth += 1
    await this.execute("BEGIN IMMEDIATE")
    try {
      const result = await run()
      await this.execute("COMMIT")
      return result
    } catch (error) {
      await this.execute("ROLLBACK").catch(() => {})
      throw error
    } finally {
      transactionDepth = Math.max(0, transactionDepth - 1)
      if (!isAppPlusRuntime()) {
        // 事务是「一批语句」的天然边界，这里直接冲盘而不是再等一个防抖窗口 ——
        // 大批量写（replaceCompletedTurns 一次上千条语句）之后立刻落地更安全。
        await flushH5Database()
      }
    }
  },
}
