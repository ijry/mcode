import type { RelaySessionInfo } from "@/services/gateway"
import { normalizeConnectionBaseUrl } from "@/services/connectionSchema"

/**
 * 连接查找与鉴权模式解析。
 *
 * 抽出来的理由：`connectionBaseUrl` / `findConnectedConnectionByKey` /
 * `createConnectionGateway` / `syncAuthToConnection` 这几个在
 * `pages/conversations/index.vue`、`pages/todos/index.vue`、`pages/connections/index.vue`
 * 里各有一份**逐字相同**的副本。它们是「新建会话」这条链路的底座，抽 CreateConversationSheet
 * 子组件时必须先有一个共用实现，否则子组件要么多接 4 个函数型 props，要么再复制第四份。
 *
 * 这里刻意**不碰 pinia**：`syncAuthToConnection` 的原实现直接调 `useAuthStore()`，那让它
 * 没法裸测。改成 `buildConnectionAuthMode` 只**描述**该切到哪个模式，由调用方去写 store。
 */

/** 只取本模块需要的字段，避免把页面的 `ConnectionItem` 类型拖进 services。 */
export interface ConnectionLike {
  routeMode?: "direct" | "gateway"
  directBaseUrl?: string
  directToken?: string
  gatewayBaseUrl?: string
  gatewaySession?: RelaySessionInfo | null
}

export type ConnectionAuthMode =
  | { mode: "direct"; baseUrl: string; token: string }
  | { mode: "relay"; baseUrl: string; session: RelaySessionInfo }

/**
 * 按 routeMode 取该连接的 base url，并**去掉尾部斜杠**。
 *
 * 归一化复用 `normalizeConnectionBaseUrl`（连接记录落库时用的同一个函数）—— 两处不同源的话，
 * 「同一台机器」会算出两个键：baseUrl 参与连接键与 direct token 的存储键，症状是 token
 * 突然找不到。
 *
 * 模式对不上时返回空串，**不跨模式兜底**：direct 记录缺 `directBaseUrl` 时若退回去读
 * `gatewayBaseUrl`，请求就发到网关地址上了。
 */
export function connectionBaseUrl(connection: ConnectionLike): string {
  const raw =
    connection.routeMode === "direct" ? connection.directBaseUrl : connection.gatewayBaseUrl
  return normalizeConnectionBaseUrl(raw || "")
}

/**
 * 描述该连接对应的鉴权模式；缺少凭据时返回 `null`。
 *
 * **返回 null 时调用方必须什么都不做。** 没有凭据却把 baseUrl 切过去，会让后续所有请求
 * 401 —— 而原来那套可用凭据已经被覆盖掉了。原实现用的是提前 `return`，语义相同，这里把它
 * 变成可测的返回值。
 *
 * `readStoredDirectToken` 由调用方注入（它读 uni 存储），这样本模块保持纯净。
 */
export function buildConnectionAuthMode(
  connection: ConnectionLike,
  readStoredDirectToken: (baseUrl: string) => string
): ConnectionAuthMode | null {
  const baseUrl = connectionBaseUrl(connection)
  if (connection.routeMode === "direct") {
    const token = connection.directToken || readStoredDirectToken(baseUrl)
    if (!token) return null
    return { mode: "direct", baseUrl, token }
  }
  const session = connection.gatewaySession
  if (!session?.accessToken) return null
  return { mode: "relay", baseUrl, session }
}

/**
 * 在「已连接」的连接里按 canonical key 找一条。
 *
 * 连接列表与键计算都由调用方注入：前者原实现每次调用都全量读一遍 uni 存储（这个查询在
 * 会话列表页被调十几次），注入之后调用方可以缓存；后者让本模块不必依赖
 * `connectionSchema`。
 *
 * **空 key 一律返回 undefined。** `buildConnectionKey` 对无法归一化的记录返回空串，
 * 拿空串去查会匹配上第一条同样算不出键的记录 —— 那是个随机连接，比查不到更糟。
 */
export function findConnectedConnectionByKey<T extends ConnectionLike>(
  key: string,
  listConnected: () => T[],
  toKey: (connection: T) => string
): T | undefined {
  const target = String(key || "").trim()
  if (!target) return undefined
  return listConnected().find((connection) => toKey(connection) === target)
}
