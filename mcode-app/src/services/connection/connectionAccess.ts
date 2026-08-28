import { useAuthStore } from "@/stores/auth"
import { getDirectToken } from "@/services/gateway/directTokenStore"
import { filterConnectedConnections } from "@/services/connection/connectedMapStore"
import {
  buildConnectionKey,
  readStoredConnections,
  resolveConnectionContext,
  type ConnectionContext,
} from "@/services/connectionContext"
import {
  buildConnectionAuthMode,
  findConnectedConnectionByKey as lookupConnectedConnectionByKey,
} from "@/services/connection/connectionLookup"
import type { CodegGateway } from "@/services/gateway"

/**
 * 「按连接键拿到一条可用连接 / 一个网关 / 把 auth 切过去」这三件事的**唯一实现**。
 *
 * 与 `connectionLookup` 的分工：那个模块回答**判断**（哪个 baseUrl、该切哪个模式、在给定
 * 列表里怎么找），刻意不碰 uni 存储也不碰 pinia，所以能裸测；这个模块把那些判断**接到真实
 * 数据源上**（读存储、写 auth store）。拆成两层是为了让判断仍然可测。
 *
 * 为什么需要它：`pages/conversations/index.vue` 与 `pages/todos/index.vue` 各有一份逐字相同
 * 的薄封装。抽 `CreateConversationSheet` 子组件时，子组件也要这三件事 —— 而
 * `connectionLookup` 的模块注释已经预告了后果：「子组件要么多接 4 个函数型 props，要么再
 * 复制第四份」。两条都不可接受，所以先收口。
 */

/** 「已连接」的那些连接。每次都重读存储 —— 连接状态会被别的页面改。 */
export function listConnectedConnections(): ConnectionContext[] {
  return filterConnectedConnections(readStoredConnections())
}

/**
 * 在「已连接」的连接里按 canonical key 找一条。
 *
 * 空 key 返回 undefined（见 `connectionLookup.findConnectedConnectionByKey` 的说明：拿空串
 * 去查会匹配上第一条同样算不出键的记录，那是个随机连接，比查不到更糟）。
 */
export function findConnectedConnection(key: string): ConnectionContext | undefined {
  return lookupConnectedConnectionByKey(key, listConnectedConnections, buildConnectionKey)
}

/**
 * 解析连接并拿到网关。
 *
 * **会就地改写传入的 connection**（`Object.assign`）：driver 在连接过程中可能补全 id /
 * sessionId / baseUrl，调用方手里那份必须跟着更新，否则下一次用它算出来的连接键是旧的。
 */
export async function openConnectionGateway(
  connection: ConnectionContext
): Promise<CodegGateway> {
  const resolved = await resolveConnectionContext(connection)
  Object.assign(connection, resolved.connection)
  return resolved.gateway
}

/**
 * 把全局 auth 切到这条连接上。
 *
 * 判断在 `connectionLookup.buildConnectionAuthMode`（可裸测），这里只负责写 store。
 * **返回 null 时什么都不做** —— 缺凭据却切了 baseUrl 会让后续请求全部 401，而原来那套
 * 可用凭据已经被覆盖。
 */
export function applyConnectionAuth(connection: ConnectionContext) {
  const authMode = buildConnectionAuthMode(connection, getDirectToken)
  if (!authMode) return
  const auth = useAuthStore()
  if (authMode.mode === "direct") {
    auth.setDirectMode(authMode.baseUrl, authMode.token)
    return
  }
  auth.setRelayMode(authMode.baseUrl, authMode.session)
}

/**
 * 把网关返回的「列表或包着列表的对象」摊平成数组。
 *
 * 只认 `data` 一种包装。**不认 `items`** —— 那是分页响应的形状，会话列表页对它有专门的
 * `normalizeOpenedTabsResponse`（要读 `version` 字段）。在这里一并接管会让那条路悄悄绕过
 * 版本号。`pages/todos/index.vue` 的同名函数多一条 `items` 分支，因此**没有**并进来。
 */
export function normalizeGatewayList(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === "object" && Array.isArray((raw as any).data)) {
    return (raw as any).data
  }
  return []
}
