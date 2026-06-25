import type { RemoteInstanceDescriptor } from "@/services/realtime/types"

export type GatewayMode = "relay" | "direct"

export interface PairTargetMetadata {
  targetId?: string
  targetAgent?: "codeg" | "opencode" | "mcode-desktop"
  displayName?: string
  capabilities?: string[]
  protocolVersion?: string
}

export interface RelaySessionInfo {
  accessToken: string
  refreshToken?: string
  targetId?: string
  targetAgent?: string
  displayName?: string
  capabilities?: string[]
  protocolVersion?: string
}

export interface PairParams {
  relayUrl?: string
  code?: string
  secret?: string
  directBaseUrl?: string
  token?: string
}

export interface CodegGateway {
  readonly mode: GatewayMode
  pair(params: PairParams): Promise<RelaySessionInfo | null>
  call<T>(command: string, payload?: Record<string, unknown>): Promise<T>
  connectEvents(onEvent: (event: unknown) => void): Promise<EventChannelConnection>
  refreshAuth(): Promise<void>
  getRemoteInstanceDescriptor(): RemoteInstanceDescriptor
}

export interface EventChannelConnection {
  isOpen(): boolean
  send(frame: object): boolean
  onReady(callback: () => void): () => void
  onClose(callback: () => void): () => void
  onError(callback: () => void): () => void
  close(): void
}

export interface TargetProfile {
  id: string
  name: string
  mode: GatewayMode
  relayUrl?: string | null
  directBaseUrl?: string | null
  token?: string | null
  session?: RelaySessionInfo | null
}
