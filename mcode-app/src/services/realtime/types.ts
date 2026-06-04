export type RemoteMode = "direct" | "relay"

export interface RemoteInstanceDescriptor {
  instanceKey: string
  mode: RemoteMode
  baseUrl: string
  principal: string
  authToken?: string
  refreshToken?: string
}

export interface AttachOptions {
  sinceSeq?: number
}

export interface AttachHandlers {
  onSnapshot: (snapshot: unknown, eventSeq: number) => void
  onReplay: (events: unknown[], highWaterSeq: number) => void
  onEvent: (event: unknown) => void
  onDetached: (reason: string, detail: { lastAppliedSeq?: number | null }) => void
}

export interface EventStreamSubscription {
  subscriptionId: string
  detach: () => void
}

export interface RealtimeTransportHost {
  isOpen(): boolean
  sendFrame(frame: object): boolean
  onReady(callback: () => void): () => void
}

export type ServerAttachFrame =
  | {
      type: "snapshot"
      subscription_id: string
      connection_id: string
      snapshot: unknown
      event_seq: number
    }
  | {
      type: "replay"
      subscription_id: string
      connection_id: string
      events: unknown[]
      high_water_seq: number
    }
  | {
      type: "event"
      subscription_id: string
      envelope: unknown
    }
  | {
      type: "detached"
      subscription_id: string
      reason: string
    }
  | {
      type: "pong"
    }

export interface RealtimeTransport {
  readonly descriptor: RemoteInstanceDescriptor
  attach(
    connectionId: string,
    options: AttachOptions,
    handlers: AttachHandlers
  ): EventStreamSubscription
  handleServerFrame(frame: unknown): void
  destroy(): void
}
