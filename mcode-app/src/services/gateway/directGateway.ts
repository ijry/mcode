import type { CodegGateway, EventChannelConnection } from "./types"
import { toErrorMessage, toResponseErrorMessage } from "./error"
import { buildRemoteInstanceKey } from "@/services/realtime/instance-key"
import { decodeSocketPayload } from "./socketPayload"

function getBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "")
}

function getToken(): string {
  return uni.getStorageSync("mcode_direct_token") || ""
}

function isH5WebSocketRuntime() {
  // #ifdef H5
  return true
  // #endif
  return false
}

function encodeTokenProtocol(token: string) {
  const utf8 = new TextEncoder().encode(token.trim())
  let binary = ""
  utf8.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return `codeg-token.${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`
}

export class DirectGateway implements CodegGateway {
  readonly mode = "direct" as const

  constructor(private baseUrl: string) {}

  async pair(params: {
    relayUrl?: string
    code?: string
    secret?: string
    directBaseUrl?: string
    token?: string
  }): Promise<null> {
    if (params.directBaseUrl) {
      this.baseUrl = params.directBaseUrl
    }
    if (params.token) {
      uni.setStorageSync("mcode_direct_token", params.token)
    }
    return null
  }

  async call<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
    try {
      const res = await uni.request({
        url: `${getBaseUrl(this.baseUrl)}/api/${command}`,
        method: "POST",
        data: payload ?? {},
        header: {
          "content-type": "application/json",
          authorization: `Bearer ${getToken()}`,
        },
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
        `${getBaseUrl(this.baseUrl).replace(/^http/, "ws")}/ws/events`,
        ["codeg-events", encodeTokenProtocol(getToken())]
      )
      let opened = false
      const readyCallbacks = new Set<() => void>()
      ws.addEventListener("open", () => {
        opened = true
        readyCallbacks.forEach((callback) => {
          try {
            callback()
          } catch (error) {
            console.error("direct websocket ready callback failed", error)
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
        onEvent(decodeSocketPayload(event.data))
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

    const socketTask: any = uni.connectSocket({
      url: `${getBaseUrl(this.baseUrl).replace(/^http/, "ws")}/ws/events`,
      protocols: ["codeg-events", encodeTokenProtocol(getToken())],
      complete: () => {},
    })
    let opened = false
    const readyCallbacks = new Set<() => void>()
    socketTask.onOpen(() => {
      opened = true
      readyCallbacks.forEach((callback) => {
        try {
          callback()
        } catch (error) {
          console.error("direct socket ready callback failed", error)
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
      onEvent(decodeSocketPayload(msg.data))
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
    return
  }

  getRemoteInstanceDescriptor() {
    const baseUrl = getBaseUrl(this.baseUrl)
    const token = getToken()
    const principal = token ? `direct:${token.slice(0, 16)}` : "direct:anonymous"
    return {
      instanceKey: buildRemoteInstanceKey({
        mode: this.mode,
        baseUrl,
        principal,
      }),
      mode: this.mode,
      baseUrl,
      principal,
      authToken: token || undefined,
    }
  }
}
