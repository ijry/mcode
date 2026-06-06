import type {
  AttachHandlers,
  AttachOptions,
  EventStreamSubscription,
  RealtimeTransport,
  RealtimeTransportHost,
  RemoteInstanceDescriptor,
  ServerAttachFrame,
} from "./types"

interface ActiveSubscription {
  connectionId: string
  lastAppliedSeq?: number
  handlers: AttachHandlers
}

function createSubscriptionId() {
  return `sub-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const closedHost: RealtimeTransportHost = {
  isOpen: () => false,
  sendFrame: () => false,
  onReady: () => () => {},
}

export class InstanceEventStream implements RealtimeTransport {
  readonly descriptor: RemoteInstanceDescriptor

  private readonly subscriptions = new Map<string, ActiveSubscription>()
  private host: RealtimeTransportHost
  private unbindReady: () => void

  constructor(
    descriptor: RemoteInstanceDescriptor,
    host: RealtimeTransportHost = closedHost
  ) {
    this.descriptor = descriptor
    this.host = host
    this.unbindReady = this.host.onReady(() => this.reattachAll())
  }

  attach(
    connectionId: string,
    options: AttachOptions,
    handlers: AttachHandlers
  ): EventStreamSubscription {
    const subscriptionId = createSubscriptionId()
    this.subscriptions.set(subscriptionId, {
      connectionId,
      lastAppliedSeq: options.sinceSeq,
      handlers,
    })
    if (this.host.isOpen()) {
      this.sendAttach(subscriptionId)
    }
    return {
      subscriptionId,
      detach: () => this.detach(subscriptionId),
    }
  }

  handleServerFrame(frame: unknown) {
    if (!isAttachFrame(frame) || frame.type === "pong") return
    const active = this.subscriptions.get(frame.subscription_id)
    if (!active) return

    switch (frame.type) {
      case "snapshot":
        active.lastAppliedSeq = frame.event_seq
        safeInvoke(() => active.handlers.onSnapshot(frame.snapshot, frame.event_seq))
        break
      case "replay":
        active.lastAppliedSeq = frame.high_water_seq
        safeInvoke(() => active.handlers.onReplay(frame.events, frame.high_water_seq))
        break
      case "event":
        if (typeof (frame.envelope as { seq?: unknown } | undefined)?.seq === "number") {
          active.lastAppliedSeq = Number((frame.envelope as { seq: number }).seq)
        }
        safeInvoke(() => active.handlers.onEvent(frame.envelope))
        break
      case "detached":
        console.warn("[realtime] subscription detached", {
          instanceKey: this.descriptor.instanceKey,
          baseUrl: this.descriptor.baseUrl,
          principal: this.descriptor.principal,
          connectionId: active.connectionId,
          subscriptionId: frame.subscription_id,
          reason: frame.reason,
          lastAppliedSeq: active.lastAppliedSeq ?? null,
        })
        this.subscriptions.delete(frame.subscription_id)
        safeInvoke(() =>
          active.handlers.onDetached(frame.reason, {
            lastAppliedSeq: active.lastAppliedSeq ?? null,
          })
        )
        break
    }
  }

  destroy() {
    this.unbindReady()
    this.host = closedHost
    this.subscriptions.clear()
  }

  rebindHost(host: RealtimeTransportHost) {
    this.unbindReady()
    this.host = host
    this.unbindReady = this.host.onReady(() => this.reattachAll())
    if (this.host.isOpen()) {
      this.reattachAll()
    }
  }

  private detach(subscriptionId: string) {
    if (!this.subscriptions.delete(subscriptionId)) return
    if (this.host.isOpen()) {
      this.host.sendFrame({
        action: "detach",
        subscription_id: subscriptionId,
      })
    }
  }

  private sendAttach(subscriptionId: string) {
    const active = this.subscriptions.get(subscriptionId)
    if (!active) return
    this.host.sendFrame({
      action: "attach",
      subscription_id: subscriptionId,
      connection_id: active.connectionId,
      since_seq: active.lastAppliedSeq,
    })
  }

  private reattachAll() {
    for (const subscriptionId of this.subscriptions.keys()) {
      this.sendAttach(subscriptionId)
    }
  }
}

function isAttachFrame(frame: unknown): frame is ServerAttachFrame {
  if (!frame || typeof frame !== "object") return false
  const type = (frame as { type?: unknown }).type
  return (
    type === "snapshot" ||
    type === "replay" ||
    type === "event" ||
    type === "detached" ||
    type === "pong"
  )
}

function safeInvoke(run: () => void) {
  try {
    run()
  } catch (error) {
    console.error("[InstanceEventStream] handler failed", error)
  }
}
