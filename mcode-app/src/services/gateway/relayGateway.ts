import type { CodegGateway, EventChannelConnection, RelaySessionInfo } from "./types"
import { toErrorMessage, toResponseErrorMessage } from "./error"
import { buildRemoteInstanceKey } from "@/services/realtime/instance-key"

declare const plus: any

function getHeaders(session?: RelaySessionInfo | null): HeadersInit {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  }
  if (session?.accessToken) {
    headers.authorization = `Bearer ${session.accessToken}`
  }
  return headers
}

function isH5WebSocketRuntime() {
  return typeof WebSocket !== "undefined" && typeof plus === "undefined"
}

function encodeTokenProtocol(token: string) {
  const utf8 = new TextEncoder().encode(token.trim())
  let binary = ""
  utf8.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return `codeg-token.${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`
}

export class RelayGateway implements CodegGateway {
  readonly mode = "relay" as const

  constructor(
    private readonly relayUrl: string,
    private readonly session: RelaySessionInfo
  ) {}

  async pair(params: {
    relayUrl?: string
    code?: string
    secret?: string
    directBaseUrl?: string
    token?: string
  }): Promise<RelaySessionInfo | null> {
    const res = await uni.request({
      url: `${(params.relayUrl ?? this.relayUrl).replace(/\/$/, "")}/v1/pair`,
      method: "POST",
      data: {
        code: params.code,
        secret: params.secret,
      },
      header: { "content-type": "application/json" },
    })
    const raw = res.data as {
      accessToken?: string
      refreshToken?: string
      target?: { targetId?: string }
    }
    const data: RelaySessionInfo = {
      accessToken: raw.accessToken ?? "",
      refreshToken: raw.refreshToken,
      targetId: raw.target?.targetId,
    }
    this.session.accessToken = data.accessToken
    this.session.refreshToken = data.refreshToken
    this.session.targetId = data.targetId
    return data
  }

  async call<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
    try {
      const res = await uni.request({
        url: `${this.relayUrl.replace(/\/$/, "")}/v1/proxy/${command}`,
        method: "POST",
        data: payload ?? {},
        header: getHeaders(this.session),
      })
      const statusCode = Number((res as any).statusCode || 0)
      if (statusCode >= 400) {
        throw new Error(
          `${command}: ${toResponseErrorMessage(res.data, statusCode)}`
        )
      }
      if (res.data && typeof res.data === "object") {
        const body = res.data as Record<string, unknown>
        const maybeError = body.error
        if (typeof maybeError === "string" && maybeError.trim()) {
          throw new Error(`${command}: ${maybeError.trim()}`)
        }
      }
      return res.data as T
    } catch (error) {
      throw new Error(`${command}: ${toErrorMessage(error)}`)
    }
  }

  async connectEvents(onEvent: (event: unknown) => void): Promise<EventChannelConnection> {
    if (isH5WebSocketRuntime()) {
      const ws = new WebSocket(
        `${this.relayUrl.replace(/^http/, "ws").replace(/\/$/, "")}/v1/events`,
        ["codeg-events", encodeTokenProtocol(this.session.accessToken || "")]
      )
      let opened = false
      const readyCallbacks = new Set<() => void>()
      ws.addEventListener("open", () => {
        opened = true
        readyCallbacks.forEach((callback) => {
          try {
            callback()
          } catch (error) {
            console.error("relay websocket ready callback failed", error)
          }
        })
      })
      ws.addEventListener("close", () => {
        opened = false
      })
      ws.addEventListener("error", () => {
        opened = false
      })
      ws.addEventListener("message", (event) => {
        try {
          onEvent(JSON.parse(String(event.data)))
        } catch {
          onEvent(event.data)
        }
      })
      return {
        isOpen: () => opened && ws.readyState === WebSocket.OPEN,
        send: (frame: object) => {
          if (ws.readyState !== WebSocket.OPEN) return false
          ws.send(JSON.stringify(frame))
          return true
        },
        onReady: (callback: () => void) => {
          if (opened && ws.readyState === WebSocket.OPEN) {
            callback()
            return () => {}
          }
          readyCallbacks.add(callback)
          return () => readyCallbacks.delete(callback)
        },
        close: () => {
          readyCallbacks.clear()
          ws.close()
        },
      }
    }

    const socketTask = await uni.connectSocket({
      url: `${this.relayUrl.replace(/^http/, "ws").replace(/\/$/, "")}/v1/events`,
      header: getHeaders(this.session),
    })
    let opened = false
    const readyCallbacks = new Set<() => void>()
    socketTask.onOpen(() => {
      opened = true
      readyCallbacks.forEach((callback) => {
        try {
          callback()
        } catch (error) {
          console.error("relay socket ready callback failed", error)
        }
      })
    })
    socketTask.onClose(() => {
      opened = false
    })
    socketTask.onError(() => {
      opened = false
    })
    socketTask.onMessage((msg: { data: unknown }) => {
      try {
        onEvent(JSON.parse(String(msg.data)))
      } catch {
        onEvent(msg.data)
      }
    })

    return {
      isOpen: () => opened,
      send: (frame: object) => {
        if (!opened) return false
        socketTask.send({ data: JSON.stringify(frame) })
        return true
      },
      onReady: (callback: () => void) => {
        if (opened) {
          callback()
          return () => {}
        }
        readyCallbacks.add(callback)
        return () => readyCallbacks.delete(callback)
      },
      close: () => {
        readyCallbacks.clear()
        socketTask.close({})
      },
    }
  }

  async refreshAuth(): Promise<void> {
    const res = await uni.request({
      url: `${this.relayUrl.replace(/\/$/, "")}/v1/session/refresh`,
      method: "POST",
      data: { refreshToken: this.session.refreshToken },
      header: { "content-type": "application/json" },
    })
    const data = res.data as Partial<RelaySessionInfo>
    if (data.accessToken) {
      this.session.accessToken = data.accessToken
    }
    if (data.refreshToken) {
      this.session.refreshToken = data.refreshToken
    }
  }

  getRemoteInstanceDescriptor() {
    const baseUrl = this.relayUrl.replace(/\/$/, "")
    const principal =
      this.session.targetId ||
      this.session.refreshToken ||
      this.session.accessToken ||
      "relay:anonymous"
    return {
      instanceKey: buildRemoteInstanceKey({
        mode: this.mode,
        baseUrl,
        principal,
      }),
      mode: this.mode,
      baseUrl,
      principal,
      authToken: this.session.accessToken || undefined,
      refreshToken: this.session.refreshToken,
    }
  }
}
