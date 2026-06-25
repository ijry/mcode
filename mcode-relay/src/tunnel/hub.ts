import { randomUUID } from "node:crypto"
import WebSocket from "ws"
import { ReplayBuffer } from "../protocol/replayBuffer.js"
import type { RelayEventFrame, TunnelHttpRequest, TunnelHttpResponse } from "../protocol/types.js"

export interface DesktopConnection {
  socket: WebSocket
  targetId: string
  targetName: string | null
  connectedAt: number
  lastSeenAt: number
}

interface PendingProxyRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: NodeJS.Timeout
}

interface PendingTunnelRequest {
  resolve: (value: TunnelHttpResponse) => void
  reject: (reason: Error) => void
  timer: NodeJS.Timeout
}

const DEFAULT_REPLAY_WINDOW = 200

export class RelayHub {
  private readonly desktops = new Map<string, DesktopConnection>()
  private readonly mobileSubscribers = new Map<string, Set<WebSocket>>()
  private readonly pendingProxy = new Map<string, PendingProxyRequest>()
  private readonly pendingTunnel = new Map<string, PendingTunnelRequest>()
  private readonly replayBuffers = new Map<string, ReplayBuffer>()
  private readonly eventSequences = new Map<string, number>()

  registerDesktop(targetId: string, socket: WebSocket, targetName: string | null): DesktopConnection {
    const existing = this.desktops.get(targetId)
    if (existing && existing.socket !== socket) {
      try {
        existing.socket.close()
      } catch {
        // ignore
      }
    }
    const connection: DesktopConnection = {
      socket,
      targetId,
      targetName,
      connectedAt: Date.now(),
      lastSeenAt: Date.now(),
    }
    this.desktops.set(targetId, connection)
    return connection
  }

  unregisterDesktop(socket: WebSocket): void {
    for (const [targetId, connection] of this.desktops.entries()) {
      if (connection.socket === socket) {
        this.desktops.delete(targetId)
      }
    }
  }

  isDesktopOnline(targetId: string): boolean {
    return this.desktops.has(targetId)
  }

  getDesktop(targetId: string): DesktopConnection | null {
    return this.desktops.get(targetId) ?? null
  }

  touchDesktop(targetId: string): void {
    const connection = this.desktops.get(targetId)
    if (!connection) return
    connection.lastSeenAt = Date.now()
    this.desktops.set(targetId, connection)
  }

  setTargetName(targetId: string, targetName: string | null): void {
    const connection = this.desktops.get(targetId)
    if (!connection) return
    connection.targetName = targetName
    this.desktops.set(targetId, connection)
  }

  attachMobileSubscriber(targetId: string, socket: WebSocket, lastEventId = 0): void {
    const set = this.mobileSubscribers.get(targetId) ?? new Set<WebSocket>()
    set.add(socket)
    this.mobileSubscribers.set(targetId, set)

    for (const frame of this.getReplayFrames(targetId, lastEventId)) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(frame))
      }
    }

    socket.on("close", () => {
      this.detachMobileSubscriber(targetId, socket)
    })
  }

  detachMobileSubscriber(targetId: string, socket: WebSocket): void {
    const set = this.mobileSubscribers.get(targetId)
    if (!set) return
    set.delete(socket)
    if (set.size === 0) {
      this.mobileSubscribers.delete(targetId)
    }
  }

  broadcastEvent(targetId: string, event: unknown): RelayEventFrame {
    const frame = this.createEventFrame(targetId, event)
    this.getReplayBuffer(targetId).push(frame)
    const payload = JSON.stringify(frame)
    const subscribers = this.mobileSubscribers.get(targetId)
    if (subscribers) {
      for (const socket of subscribers) {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(payload)
        }
      }
    }
    return frame
  }

  async sendProxyRequest(
    targetId: string,
    command: string,
    payload: unknown,
    timeoutMs = 10_000
  ): Promise<unknown> {
    const desktop = this.desktops.get(targetId)
    if (!desktop || desktop.socket.readyState !== WebSocket.OPEN) {
      throw new Error("target offline")
    }

    const requestId = randomUUID()
    const body = JSON.stringify({
      type: "proxy_request",
      requestId,
      command,
      payload,
    })

    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingProxy.delete(requestId)
        reject(new Error("proxy request timeout"))
      }, timeoutMs)

      this.pendingProxy.set(requestId, { resolve, reject, timer })

      try {
        desktop.socket.send(body)
      } catch (error) {
        clearTimeout(timer)
        this.pendingProxy.delete(requestId)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  handleDesktopProxyResponse(message: {
    requestId: string
    ok: boolean
    status?: number
    body?: unknown
    error?: string | null
  }): void {
    const pending = this.pendingProxy.get(message.requestId)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pendingProxy.delete(message.requestId)
    if (message.ok) {
      pending.resolve({
        status: message.status ?? 200,
        body: message.body ?? null,
      })
      return
    }
    pending.reject(new Error(message.error ?? "proxy request failed"))
  }

  async sendTunnelRequest(
    targetId: string,
    request: TunnelHttpRequest,
    timeoutMs = 30_000
  ): Promise<TunnelHttpResponse> {
    const desktop = this.desktops.get(targetId)
    if (!desktop || desktop.socket.readyState !== WebSocket.OPEN) {
      throw new Error("target offline")
    }

    const requestId = randomUUID()
    const body = JSON.stringify({
      type: "tunnel_request",
      requestId,
      request,
    })

    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingTunnel.delete(requestId)
        reject(new Error("tunnel request timeout"))
      }, timeoutMs)

      this.pendingTunnel.set(requestId, { resolve, reject, timer })

      try {
        desktop.socket.send(body)
      } catch (error) {
        clearTimeout(timer)
        this.pendingTunnel.delete(requestId)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  handleDesktopTunnelResponse(message: {
    requestId: string
    ok: boolean
    status?: number
    headers?: Record<string, string>
    body?: unknown
    error?: string | null
  }): void {
    const pending = this.pendingTunnel.get(message.requestId)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pendingTunnel.delete(message.requestId)
    if (message.ok) {
      pending.resolve({
        status: message.status ?? 200,
        headers: message.headers ?? {},
        body: message.body ?? null,
      })
      return
    }
    pending.reject(new Error(message.error ?? "tunnel request failed"))
  }

  getReplayFrames(targetId: string, lastEventId = 0): RelayEventFrame[] {
    return this.getReplayBuffer(targetId).after(lastEventId)
  }

  private getReplayBuffer(targetId: string): ReplayBuffer {
    const existing = this.replayBuffers.get(targetId)
    if (existing) return existing
    const created = new ReplayBuffer(DEFAULT_REPLAY_WINDOW)
    this.replayBuffers.set(targetId, created)
    return created
  }

  private createEventFrame(targetId: string, event: unknown): RelayEventFrame {
    const nextEventId = (this.eventSequences.get(targetId) ?? 0) + 1
    this.eventSequences.set(targetId, nextEventId)
    const normalized = normalizeEventPayload(event)
    return {
      eventId: nextEventId,
      channel: normalized.channel,
      payload: normalized.payload,
      ...(normalized.controllerId ? { controllerId: normalized.controllerId } : {}),
    }
  }
}

function normalizeEventPayload(event: unknown): {
  channel: string
  payload: unknown
  controllerId?: string | null
} {
  if (event && typeof event === "object") {
    const record = event as Record<string, unknown>
    const channel = typeof record.channel === "string" ? record.channel.trim() : ""
    if (channel) {
      return {
        channel,
        payload: "payload" in record ? record.payload : event,
        controllerId:
          typeof record.controllerId === "string" && record.controllerId.trim()
            ? record.controllerId.trim()
            : null,
      }
    }
  }

  return {
    channel: "acp://event",
    payload: event,
  }
}
