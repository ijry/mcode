import {
  buildConnectionKey,
  readStoredConnections,
  type ConnectionContextLike,
} from "@/services/connectionContext"

/**
 * `mcode_connected_map` 的**唯一**读写入口。
 *
 * ## 为什么必须收口
 *
 * 这个 map 原先在 4 个文件里各写了一遍，且**写方和读方用的不是同一个 key 函数**：
 *
 * - 写：`pages/connections/index.vue` → `buildConnectionRecordKey(conn)`
 * - 读：`pages/conversations/index.vue` / `pages/todos/index.vue` /
 *       `conversationTabBadgeService` → `buildConnectionKey(conn)`
 *
 * 两者对良构的 v2 记录恰好等价，但只要记录**不能通过 v2 归一化**就会分叉
 * （实测三种：`version` 不是 2、`targetAgent` 大小写不规范、缺 `directBaseUrl`）：
 *
 * ```
 * targetAgent: "CodeG"  →  record 键 "CodeG::direct::…"   ctx 键 ""
 * version: 1            →  record 键 "codeg::direct::…"   ctx 键 ""
 * ```
 *
 * 写进去的键读方永远匹配不上 —— 于是「已连接」状态静默丢失。更糟的是
 * `pages/conversations/index.vue` 会按自己的算法**重写整个 map**
 * （`pruneConnectedMapBySavedConnections`），把读不出来的条目当成无效条目剪掉，
 * 造成不可逆的丢失。
 *
 * 所以这里统一用 `buildConnectionKey`（先归一化再取键）：它对无法归一化的记录返回 `""`，
 * 而 `""` 一律被当作无效键忽略 —— 宁可不标记，也不要写一个谁都读不到的键。
 *
 * ## 语义
 *
 * 「曾经成功连上过」，而**不是**「用户在连接页点过连接按钮」。
 * 只能由一次真实请求的成功来置位（见 `conversationTabBadgeService`）。
 * 详见 `docs/mcode-architecture-notes/2026-08-22-01-00-tab-badge-connected-map-reachability.md`。
 */

const STORAGE_KEY = "mcode_connected_map"

export type ConnectedMap = Record<string, boolean>

export function readConnectedMap(): ConnectedMap {
  const raw = uni.getStorageSync(STORAGE_KEY)
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const next: ConnectedMap = {}
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    if (key && Boolean(value)) {
      next[key] = true
    }
  })
  return next
}

function writeConnectedMap(next: ConnectedMap) {
  uni.setStorageSync(STORAGE_KEY, next)
}

export function isConnectionConnected(connection: ConnectionContextLike): boolean {
  const key = buildConnectionKey(connection)
  if (!key) return false
  return Boolean(readConnectedMap()[key])
}

/**
 * 过滤出「已连上过」的连接。读方一律走这里，别自己拼 map 查询。
 */
export function filterConnectedConnections<T extends ConnectionContextLike>(
  connections: T[]
): T[] {
  const connectedMap = readConnectedMap()
  return connections.filter((conn) => {
    const key = buildConnectionKey(conn)
    return Boolean(key && connectedMap[key])
  })
}

export function getConnectedConnections() {
  return filterConnectedConnections(readStoredConnections())
}

/**
 * 置位。`buildConnectionKey` 返回空串（记录无法归一化）时**什么都不做** ——
 * 写一个读方匹配不上的键比不写更糟。
 */
export function markConnectionConnected(connection: ConnectionContextLike) {
  const key = buildConnectionKey(connection)
  if (!key) return
  const connectedMap = readConnectedMap()
  if (connectedMap[key]) return
  writeConnectedMap({ ...connectedMap, [key]: true })
}

export function markConnectionDisconnected(connection: ConnectionContextLike) {
  const key = buildConnectionKey(connection)
  if (!key) return
  const connectedMap = readConnectedMap()
  if (!connectedMap[key]) return
  delete connectedMap[key]
  writeConnectedMap(connectedMap)
}

/**
 * 整体替换（「连接」页维护自己那份响应式副本时用）。
 *
 * 键必须由调用方用 `buildConnectionKey` 生成 —— 传进来的键会被原样保留，
 * 这里只丢掉空键和假值。
 */
export function replaceConnectedMap(next: ConnectedMap) {
  const sanitized: ConnectedMap = {}
  Object.entries(next || {}).forEach(([key, value]) => {
    if (key && Boolean(value)) {
      sanitized[key] = true
    }
  })
  writeConnectedMap(sanitized)
}

/**
 * 按「当前仍存在的连接」剪掉陈旧条目。
 *
 * 原先这段逻辑长在 `pages/conversations/index.vue` 里，用的却是和写方不同的 key 函数 ——
 * 一旦算出不同的键，健在的条目会被误判成陈旧并剪掉。收口到这里之后，剪枝与置位
 * 用的是同一个 `buildConnectionKey`，不会再自相矛盾。
 */
export function pruneConnectedMap(savedConnections: ConnectionContextLike[]): ConnectedMap {
  const validKeys = new Set(
    savedConnections.map((conn) => buildConnectionKey(conn)).filter(Boolean)
  )
  const current = readConnectedMap()
  const next: ConnectedMap = {}
  Object.entries(current).forEach(([key, value]) => {
    if (validKeys.has(key) && Boolean(value)) {
      next[key] = true
    }
  })
  if (JSON.stringify(next) !== JSON.stringify(current)) {
    writeConnectedMap(next)
  }
  return next
}
