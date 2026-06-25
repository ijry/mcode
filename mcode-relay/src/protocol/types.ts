export type TargetAgent = "codeg" | "opencode" | "mcode-desktop"

export interface TargetMetadata {
  targetId: string
  targetAgent: TargetAgent
  displayName: string | null
  capabilities: string[]
  protocolVersion: string
}

export interface DesktopUpstreamHello {
  type: "desktop_hello"
  targetId: string
  targetName?: string | null
  displayName?: string | null
  targetAgent?: TargetAgent
  capabilities?: string[]
  protocolVersion?: string
}

export interface RelayEventFrame {
  eventId: number
  channel: string
  payload: unknown
  controllerId?: string | null
}

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
