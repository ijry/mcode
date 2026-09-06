/**
 * Every host process a controller can be paired with.
 *
 * `dsh` is a DeepSeek Harness desktop running the `dsh-plugin-mobile-bridge`
 * plugin. It is its own entry rather than a capability of `mcode-desktop`
 * because it is a different process speaking a different protocol — the same
 * reason `codeg` and `opencode` are separate. What it is NOT is a per-CLI
 * target: the CLIs `mcode-desktop` proxies stay behind `mcode-desktop`.
 *
 * The array is the single source of truth. Relay validates `targetAgent` in
 * three places (pair offers, target upsert, snapshot restore), and before this
 * list existed each one carried its own copy of the union — which is exactly how
 * a new value gets accepted by two of them and silently dropped by the third.
 */
export const TARGET_AGENTS = ["codeg", "opencode", "mcode-desktop", "dsh"] as const

export type TargetAgent = (typeof TARGET_AGENTS)[number]

/** Narrow an unknown value to a {@link TargetAgent}. */
export function isTargetAgent(value: unknown): value is TargetAgent {
  return typeof value === "string" && (TARGET_AGENTS as readonly string[]).includes(value)
}


export interface TargetMetadata {
  targetId: string
  tenantId: string
  targetAgent: TargetAgent
  displayName: string | null
  capabilities: string[]
  protocolVersion: string
  localServices: LocalServiceMetadata[]
}

export type LocalServiceProtocol = "http" | "tcp"

export interface LocalServiceMetadata {
  name: string
  host: "127.0.0.1"
  port: number
  protocol: LocalServiceProtocol
  enabled: boolean
}

export interface ClientIdentity {
  clientId: string
  sessionId: string
  targetId: string
  deviceName: string | null
}

export interface DesktopUpstreamHello {
  type: "desktop_hello"
  targetId: string
  tenantId?: string | null
  targetName?: string | null
  displayName?: string | null
  targetAgent: TargetAgent
  capabilities?: string[]
  protocolVersion: string
  localServices?: LocalServiceMetadata[]
}

export interface RelayEventFrame {
  eventId: number
  channel: string
  payload: unknown
  controllerId?: string | null
  localEventId?: number | null
}

export interface ReplayMetadata {
  replayWindowStart: number | null
  lastEventId: number
  replayAvailable: boolean
}

export interface ReplayQueryResult extends ReplayMetadata {
  frames: RelayEventFrame[]
  replayMiss: boolean
  requestedLastEventId: number
}

export type RelayFailureCode =
  | "target_offline"
  | "desktop_replaced"
  | "session_revoked"
  | "request_timeout"
  | "gateway_shutdown"

export interface TunnelHttpRequest {
  port: number
  method: string
  path: string
  query?: Record<string, unknown>
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}

export interface TunnelHttpResponse {
  status: number
  headers?: Record<string, string>
  body?: unknown
}

export interface TunnelTcpConnectFrame {
  type: "tcp_connect"
  streamId: string
  port: number
}

export interface TunnelTcpDataFrame {
  type: "tcp_data"
  streamId: string
  dataBase64: string
}

export interface TunnelTcpCloseFrame {
  type: "tcp_close"
  streamId: string
}

export interface TunnelTcpErrorFrame {
  type: "tcp_error"
  streamId: string
  error: string
}

export type TunnelTcpFrame =
  | TunnelTcpConnectFrame
  | TunnelTcpDataFrame
  | TunnelTcpCloseFrame
  | TunnelTcpErrorFrame
