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

let opened = false
let transactionDepth = 0
let sqlJs: SqlJsStatic | null = null
let h5Db: Database | null = null

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
  const stored = readStoredH5Database()
  h5Db = stored ? new sqlJs.Database(stored) : new sqlJs.Database()
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

async function persistH5Database() {
  if (!h5Db) return
  if (transactionDepth > 0) return
  const bytes = h5Db.export()
  uni.setStorageSync(H5_DB_STORAGE_KEY, bytesToBase64(bytes))
}

function readStoredH5Database() {
  const raw = uni.getStorageSync(H5_DB_STORAGE_KEY)
  if (!raw || typeof raw !== "string") return null
  try {
    return base64ToBytes(raw)
  } catch {
    return null
  }
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

function bytesToBase64(bytes: Uint8Array) {
  let binary = ""
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
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
    await persistH5Database()
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
        await persistH5Database()
      }
    }
  },
}
