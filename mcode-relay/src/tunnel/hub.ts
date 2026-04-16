import { randomUUID } from "node:crypto"
import WebSocket from "ws"

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

export class RelayHub {
  private readonly desktops = new Map<string, DesktopConnection>()
  private readonly mobileSubscribers = new Map<string, Set<WebSocket>>()
  private readonly pendingProxy = new Map<string, PendingProxyRequest>()

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

  attachMobileSubscriber(targetId: string, socket: WebSocket): void {
    const set = this.mobileSubscribers.get(targetId) ?? new Set<WebSocket>()
    set.add(socket)
    this.mobileSubscribers.set(targetId, set)

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

  broadcastEvent(targetId: string, event: unknown): void {
    const payload = JSON.stringify(event)
    const subscribers = this.mobileSubscribers.get(targetId)
    if (!subscribers) return
    for (const socket of subscribers) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload)
      }
    }
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
}
