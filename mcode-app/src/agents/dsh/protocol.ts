/**
 * DSH 手机桥的线上契约。
 *
 * 这是 `dsh-plugin-mobile-bridge/src/shared/protocol.js` 的镜像 —— 两个仓库，
 * 一份协议。之所以是抄一份而不是抽包：桥必须零依赖（它以本地 tarball 形式随
 * 桌面外壳分发，由 pnpm 从文件安装，多一个依赖就把「首启装插件」变成一次可能
 * 失败的联网操作），所以它不能依赖这里；而 mcode-app 是 uni-app 构建，也不该为
 * 一组常量去依赖一个 npm 包。
 *
 * 这份镜像的守卫是 tests/agents/dsh/protocol.spec.ts：字段名和错误码一旦漂移，
 * 表现是「连上了但什么都收不到」，那是最难查的一类故障。
 *
 * @module agents/dsh/protocol
 */

/** 桥的协议版本。`/hello` 会回这个值。 */
export const DSH_PROTOCOL_VERSION = "1"

/** 所有桥接口的前缀。配对地址就是 `http://host:port` + 这个前缀。 */
export const DSH_ROUTE_PREFIX = "/dsh-mobile-bridge"

/** MCode 连接词汇里的目标类型。 */
export const DSH_TARGET_AGENT = "dsh"

/** WebSocket 事件流路径（相对前缀）。 */
export const DSH_EVENTS_WS_PATH = "/ws"

/** SSE 事件流路径（相对前缀）。浏览器与 curl 用，App 端用 WebSocket。 */
export const DSH_EVENTS_SSE_PATH = "/events"

/** WebSocket 握手协商的子协议名。 */
export const DSH_STREAM_PROTOCOL = "dshm-events"

/** 浏览器没法给 WebSocket 设头，所以令牌走子协议：这是它的前缀。 */
export const DSH_TOKEN_PROTOCOL_PREFIX = "dshm-token."

/** 桥宣称的能力键。客户端读这个，而不是比协议版本。 */
export const DSH_CAPABILITY = {
  sessions: "dsh.bridge.sessions",
  events: "dsh.bridge.events",
  answers: "dsh.bridge.answers",
  workspaces: "dsh.bridge.workspaces",
  models: "dsh.bridge.models",
  images: "dsh.bridge.images",
} as const

/** 桥的错误码。`dsh_error` 会另外带上 dsh 自己的 `dshCode`。 */
export const DSH_ERR = {
  invalidInput: "invalid_input",
  unauthorized: "unauthorized",
  forbidden: "forbidden",
  notFound: "not_found",
  pairingFailed: "pairing_failed",
  rateLimited: "rate_limited",
  unavailable: "unavailable",
  dshError: "dsh_error",
  internal: "internal",
} as const

export type DshErrorCode = (typeof DSH_ERR)[keyof typeof DSH_ERR]

/** 客户端能给出的两种审批结论。其余两种（cancelled/unavailable）是宿主侧结果。 */
export const DSH_APPROVAL_OUTCOME = { allow: "allowed-once", deny: "rejected" } as const

/** 事件帧类型。与桥的 `FRAME` 一一对应。 */
export const DSH_FRAME = {
  hello: "hello",
  sessionAdded: "session/added",
  sessionRemoved: "session/removed",
  sessionStatus: "session/status",
  sessionTitle: "session/title",
  messageStart: "message/start",
  messageDelta: "message/delta",
  messageEnd: "message/end",
  toolCall: "tool/call",
  toolResult: "tool/result",
  approvalRequested: "approval/requested",
  approvalResolved: "approval/resolved",
  questionRequested: "question/requested",
  questionResolved: "question/resolved",
  turnEnd: "turn/end",
  error: "error",
} as const

export type DshFrameType = (typeof DSH_FRAME)[keyof typeof DSH_FRAME]

/** 桥的统一信封。 */
export type DshEnvelope<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: DshErrorCode | string; message: string; dshCode?: string } }

/** `GET /hello` 的返回。不含任何密钥，配对前就能读。 */
export interface DshHello {
  protocolVersion: string
  targetAgent: string
  targetId: string
  displayName: string
  capabilities: string[]
  dshVersion: string | null
  devices: number
  requiresPairing: boolean
}

/** `POST /pair` 与 `POST /session/refresh` 的返回。形状与 relay 的一致。 */
export interface DshPairResponse {
  accessToken: string
  refreshToken?: string
  target: {
    targetId: string
    targetAgent: string
    displayName: string
    capabilities: string[]
    protocolVersion: string
    online: boolean
  }
}

/** 会话列表里的一行。 */
export interface DshSessionRow {
  sessionId: string
  title: string | null
  updatedAt: number
  running: boolean
  blank: boolean
  cwd?: string
  parentSessionId?: string
  origin?: string
}

/** 一条已完成的消息。桥已经把 dsh 的事件溯源折叠过了。 */
export interface DshMessage {
  messageId: string
  role: "user" | "assistant" | "tool"
  seq: number
  at: number
  text: string
  reasoning?: string
  images?: number
  toolCalls?: Array<{ callId: string; name: string; arguments: string }>
  toolResult?: { callId: string; ok: boolean; error?: string }
  origin?: string
  plugin?: string
  summary?: string
  interrupted?: true
}

/** 一帧事件。`data` 的形状随 `type` 变，见桥的 README。 */
export interface DshFrame {
  type: DshFrameType | string
  sessionId?: string
  [key: string]: unknown
}

/** WebSocket 载体的信封；SSE 用 `id:` 字段表达同一个东西。 */
export interface DshWsEnvelope {
  eventId: number
  event: string
  data: DshFrame
}

/** 把桥地址规范成 `http(s)://host[:port]/prefix`，去掉尾斜杠、查询与片段。 */
export function normalizeDshBaseUrl(url: unknown): string {
  const raw = String(url ?? "").trim()
  if (raw === "") return ""
  if (!/^https?:\/\//i.test(raw)) return ""
  return raw.replace(/[?#].*$/, "").replace(/\/+$/, "")
}

/**
 * 补上路由前缀。
 *
 * 用户手抄隧道地址时经常只填到域名（教程里也确实给了两种写法），所以这里容错：
 * 已经带前缀就原样返回，没带就补上。判断的是结尾而不是包含 —— 一个恰好把前缀
 * 写在中间的反代路径不该被当成已经补过。
 */
export function withDshRoutePrefix(baseUrl: string): string {
  const normalized = normalizeDshBaseUrl(baseUrl)
  if (normalized === "") return ""
  return normalized.endsWith(DSH_ROUTE_PREFIX) ? normalized : `${normalized}${DSH_ROUTE_PREFIX}`
}

/** 事件流的 WebSocket 地址。 */
export function buildDshEventsWsUrl(
  baseUrl: string,
  options: { sessionId?: string | null; lastEventId?: number | null } = {}
): string {
  const base = withDshRoutePrefix(baseUrl).replace(/^http/i, "ws")
  const params = new URLSearchParams()
  if (options.sessionId) params.set("sessionId", options.sessionId)
  if (options.lastEventId && options.lastEventId > 0) {
    params.set("lastEventId", String(options.lastEventId))
  }
  const query = params.toString()
  return `${base}${DSH_EVENTS_WS_PATH}${query ? `?${query}` : ""}`
}

/** base64 字母表；手写一遍是因为 `btoa` 在 uni-app 的部分平台上并不存在。 */
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

/**
 * 令牌走子协议时的那一项：`dshm-token.<base64url(token)>`。
 *
 * 之所以要编码：子协议名的合法字符集很窄，而令牌是 base64url 加下划线连字符，
 * 直接塞进去会被某些运行时拒掉握手。
 */
export function buildDshTokenProtocol(token: string): string {
  const bytes = new TextEncoder().encode(String(token ?? ""))
  let out = ""
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    const left = bytes.length - i
    out += B64[(chunk >> 18) & 63] + B64[(chunk >> 12) & 63]
    if (left > 1) out += B64[(chunk >> 6) & 63]
    if (left > 2) out += B64[chunk & 63]
  }
  return DSH_TOKEN_PROTOCOL_PREFIX + out.replace(/\+/g, "-").replace(/\//g, "_")
}

