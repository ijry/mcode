import type { RemoteInstanceDescriptor } from "@/services/realtime/types"

export type GatewayMode = "relay" | "direct"

export interface PairTargetMetadata {
  targetId?: string
  targetAgent?: "codeg" | "opencode" | "mcode-desktop"
  displayName?: string
  capabilities?: string[]
  protocolVersion?: string
}

export type LocalServiceProtocol = "http" | "tcp"

export interface LocalServiceMetadata {
  name: string
  host: "127.0.0.1"
  port: number
  protocol: LocalServiceProtocol
  enabled: boolean
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

export interface EventRecoveryOptions {
  lastEventId?: number | null
}

export interface RelayReadyFrame {
  type: "ready"
  replayWindowStart?: number | null
  lastEventId?: number | null
  replayAvailable?: boolean
}

export interface RelayRecoveryMissFrame {
  type: "replay_miss"
  requestedLastEventId?: number | null
  replayWindowStart?: number | null
  lastEventId?: number | null
}

export interface RelayWrappedEventFrame {
  eventId: number
  channel: string
  payload: unknown
  controllerId?: string | null
  localEventId?: number | null
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
  listTargetServices?(): Promise<LocalServiceMetadata[]>
  connectEvents(
    onEvent: (event: unknown) => void,
    options?: EventRecoveryOptions
  ): Promise<EventChannelConnection>
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
