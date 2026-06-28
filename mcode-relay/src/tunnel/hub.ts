import { randomUUID } from "node:crypto"
import WebSocket from "ws"
import { ReplayBuffer } from "../protocol/replayBuffer.js"
import type { ReplayStore } from "../protocol/replayStore.js"
import type {
  ClientIdentity,
  RelayFailureCode,
  RelayEventFrame,
  ReplayQueryResult,
  TunnelHttpRequest,
  TunnelHttpResponse,
} from "../protocol/types.js"

export interface DesktopConnection {
  socket: WebSocket
  targetId: string
  targetName: string | null
  connectedAt: number
  lastSeenAt: number
}

interface PendingProxyRequest {
  targetId: string
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: NodeJS.Timeout
}

interface PendingTunnelRequest {
  targetId: string
  resolve: (value: TunnelHttpResponse) => void
  reject: (reason: Error) => void
  timer: NodeJS.Timeout
}

interface ActiveTcpStream {
  streamId: string
  targetId: string
  port: number
  mobileSocket: WebSocket
}

const DEFAULT_REPLAY_WINDOW = 1000

interface RelayHubOptions {
  replayWindowSize?: number
  replayStore?: ReplayStore | null
}

export class RelayRequestError extends Error {
  constructor(
    public readonly code: RelayFailureCode,
    message: string
  ) {
    super(message)
    this.name = "RelayRequestError"
  }
}

export class RelayHub {
  private readonly desktops = new Map<string, DesktopConnection>()
  private readonly mobileSubscribers = new Map<string, Map<WebSocket, ClientIdentity>>()
  private readonly pendingProxy = new Map<string, PendingProxyRequest>()
  private readonly pendingTunnel = new Map<string, PendingTunnelRequest>()
  private readonly tcpStreams = new Map<string, ActiveTcpStream>()
  private readonly replayBuffers = new Map<string, ReplayBuffer>()
  private readonly eventSequences = new Map<string, number>()
  private readonly replayWindowSize: number

  constructor(private readonly options: RelayHubOptions = {}) {
    this.replayWindowSize = options.replayWindowSize ?? DEFAULT_REPLAY_WINDOW
  }

  registerDesktop(targetId: string, socket: WebSocket, targetName: string | null): DesktopConnection {
    const existing = this.desktops.get(targetId)
    if (existing && existing.socket !== socket) {
      this.failPendingForTarget(
        targetId,
        new RelayRequestError("desktop_replaced", "desktop upstream replaced")
      )
      this.closeTcpStreamsForTarget(targetId, "desktop upstream replaced")
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
        this.failPendingForTarget(
          targetId,
          new RelayRequestError("target_offline", "desktop upstream disconnected")
        )
        this.closeTcpStreamsForTarget(targetId, "desktop upstream disconnected")
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

  attachMobileSubscriber(
    targetId: string,
    socket: WebSocket,
    lastEventId = 0,
    client: ClientIdentity = {
      clientId: "unknown",
      sessionId: "unknown",
      targetId,
      deviceName: null,
    }
  ): ReplayQueryResult {
    const subscribers = this.mobileSubscribers.get(targetId) ?? new Map<WebSocket, ClientIdentity>()
    subscribers.set(socket, client)
    this.mobileSubscribers.set(targetId, subscribers)

    const replay = this.getReplayBuffer(targetId).queryAfter(lastEventId)
    for (const frame of replay.frames) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(frame))
      }
    }

    socket.on("close", () => {
      this.detachMobileSubscriber(targetId, socket)
    })
    return replay
  }

  detachMobileSubscriber(targetId: string, socket: WebSocket): void {
    const subscribers = this.mobileSubscribers.get(targetId)
    if (!subscribers) return
    subscribers.delete(socket)
    if (subscribers.size === 0) {
      this.mobileSubscribers.delete(targetId)
    }
  }

  broadcastEvent(targetId: string, event: unknown, localEventId?: number): RelayEventFrame {
    const frame = this.createEventFrame(targetId, event, localEventId)
    const replayBuffer = this.getReplayBuffer(targetId)
    replayBuffer.push(frame)
    this.options.replayStore?.saveTarget(targetId, {
      eventSequence: this.eventSequences.get(targetId) ?? frame.eventId,
      frames: replayBuffer.snapshot(),
    })
    const payload = JSON.stringify(frame)
    const subscribers = this.mobileSubscribers.get(targetId)
    if (subscribers) {
      for (const socket of subscribers.keys()) {
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
    timeoutMs = 10_000,
    client?: ClientIdentity
  ): Promise<unknown> {
    const desktop = this.desktops.get(targetId)
    if (!desktop || desktop.socket.readyState !== WebSocket.OPEN) {
      throw new RelayRequestError("target_offline", "target offline")
    }

    const requestId = randomUUID()
    const body = JSON.stringify({
      type: "proxy_request",
      requestId,
      command,
      payload,
      ...(client ? { clientId: client.clientId, client } : {}),
    })

    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingProxy.delete(requestId)
        reject(new RelayRequestError("request_timeout", "proxy request timeout"))
      }, timeoutMs)

      this.pendingProxy.set(requestId, { targetId, resolve, reject, timer })

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
      throw new RelayRequestError("target_offline", "target offline")
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
        reject(new RelayRequestError("request_timeout", "tunnel request timeout"))
      }, timeoutMs)

      this.pendingTunnel.set(requestId, { targetId, resolve, reject, timer })

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

  openTcpStream(targetId: string, port: number, mobileSocket: WebSocket): string {
    const desktop = this.desktops.get(targetId)
    if (!desktop || desktop.socket.readyState !== WebSocket.OPEN) {
      throw new RelayRequestError("target_offline", "target offline")
    }

    const streamId = randomUUID()
    this.tcpStreams.set(streamId, {
      streamId,
      targetId,
      port,
      mobileSocket,
    })

    mobileSocket.on("close", () => {
      this.closeTcpStream(streamId)
    })
    mobileSocket.on("error", () => {
      this.closeTcpStream(streamId)
    })

    try {
      desktop.socket.send(
        JSON.stringify({
          type: "tcp_connect",
          streamId,
          port,
        })
      )
    } catch (error) {
      this.tcpStreams.delete(streamId)
      throw error instanceof Error ? error : new Error(String(error))
    }

    return streamId
  }

  sendTcpData(streamId: string, data: Buffer): void {
    const stream = this.tcpStreams.get(streamId)
    if (!stream) {
      throw new Error("tcp stream not found")
    }
    const desktop = this.desktops.get(stream.targetId)
    if (!desktop || desktop.socket.readyState !== WebSocket.OPEN) {
      this.failTcpStream(streamId, "target offline")
      throw new RelayRequestError("target_offline", "target offline")
    }

    desktop.socket.send(
      JSON.stringify({
        type: "tcp_data",
        streamId,
        dataBase64: data.toString("base64"),
      })
    )
  }

  closeTcpStream(streamId: string): void {
    const stream = this.tcpStreams.get(streamId)
    if (!stream) return
    this.tcpStreams.delete(streamId)

    const desktop = this.desktops.get(stream.targetId)
    if (desktop?.socket.readyState === WebSocket.OPEN) {
      desktop.socket.send(
        JSON.stringify({
          type: "tcp_close",
          streamId,
        })
      )
    }
  }

  handleDesktopTcpData(message: { streamId: string; dataBase64: string }): void {
    const stream = this.tcpStreams.get(message.streamId)
    if (!stream || stream.mobileSocket.readyState !== WebSocket.OPEN) return
    stream.mobileSocket.send(Buffer.from(message.dataBase64, "base64"))
  }

  handleDesktopTcpClose(message: { streamId: string }): void {
    this.closeTcpStreamFromDesktop(message.streamId)
  }

  handleDesktopTcpError(message: { streamId: string; error?: string | null }): void {
    this.failTcpStream(message.streamId, message.error || "tcp stream failed")
  }

  getReplayFrames(targetId: string, lastEventId = 0): RelayEventFrame[] {
    return this.getReplayBuffer(targetId).after(lastEventId)
  }

  private getReplayBuffer(targetId: string): ReplayBuffer {
    const existing = this.replayBuffers.get(targetId)
    if (existing) return existing
    const created = new ReplayBuffer(this.replayWindowSize)
    const restored = this.options.replayStore?.getTarget(targetId)
    if (restored) {
      created.restore(restored.frames)
      this.eventSequences.set(targetId, restored.eventSequence)
    }
    this.replayBuffers.set(targetId, created)
    return created
  }

  private createEventFrame(targetId: string, event: unknown, localEventId?: number): RelayEventFrame {
    const nextEventId = (this.eventSequences.get(targetId) ?? 0) + 1
    this.eventSequences.set(targetId, nextEventId)
    const normalized = normalizeEventPayload(event)
    return {
      eventId: nextEventId,
      channel: normalized.channel,
      payload: normalized.payload,
      ...(normalized.controllerId ? { controllerId: normalized.controllerId } : {}),
      ...(localEventId !== undefined ? { localEventId } : {}),
    }
  }

  private closeTcpStreamFromDesktop(streamId: string): void {
    const stream = this.tcpStreams.get(streamId)
    if (!stream) return
    this.tcpStreams.delete(streamId)
    if (stream.mobileSocket.readyState === WebSocket.OPEN) {
      stream.mobileSocket.close()
    }
  }

  private failTcpStream(streamId: string, error: string): void {
    const stream = this.tcpStreams.get(streamId)
    if (!stream) return
    this.tcpStreams.delete(streamId)
    if (stream.mobileSocket.readyState === WebSocket.OPEN) {
      stream.mobileSocket.send(JSON.stringify({ type: "error", streamId, error }))
      stream.mobileSocket.close()
    }
  }

  private closeTcpStreamsForTarget(targetId: string, error: string): void {
    for (const [streamId, stream] of this.tcpStreams.entries()) {
      if (stream.targetId === targetId) {
        this.failTcpStream(streamId, error)
      }
    }
  }

  private failPendingForTarget(targetId: string, error: RelayRequestError): void {
    for (const [requestId, pending] of this.pendingProxy.entries()) {
      if (pending.targetId === targetId) {
        clearTimeout(pending.timer)
        this.pendingProxy.delete(requestId)
        pending.reject(error)
      }
    }
    for (const [requestId, pending] of this.pendingTunnel.entries()) {
      if (pending.targetId === targetId) {
        clearTimeout(pending.timer)
        this.pendingTunnel.delete(requestId)
        pending.reject(error)
      }
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
