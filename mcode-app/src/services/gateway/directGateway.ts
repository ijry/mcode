import type { CodegGateway, EventChannelConnection } from "./types"
import { toErrorMessage, toResponseErrorMessage } from "./error"
import { getDirectToken, normalizeDirectBaseUrl, setDirectToken } from "./directTokenStore"
import { buildRemoteInstanceKey } from "@/services/realtime/instance-key"
import { decodeSocketPayload } from "./socketPayload"
import { buildWebSocketProtocols } from "./wsProtocol"

const COMMAND_TIMEOUT_MS: Record<string, number> = {
  acp_describe_agent_options: 70_000,
}

function getBaseUrl(baseUrl: string): string {
  return normalizeDirectBaseUrl(baseUrl)
}

function isH5WebSocketRuntime() {
  // #ifdef H5
  return true
  // #endif
  return false
}

export class DirectGateway implements CodegGateway {
  readonly mode = "direct" as const

  constructor(private baseUrl: string) {
    this.baseUrl = getBaseUrl(baseUrl)
  }

  private getToken() {
    return getDirectToken(this.baseUrl)
  }

  async pair(params: {
    relayUrl?: string
    code?: string
    secret?: string
    directBaseUrl?: string
    token?: string
  }): Promise<null> {
    if (params.directBaseUrl) {
      this.baseUrl = getBaseUrl(params.directBaseUrl)
    }
    if (typeof params.token === "string") {
      setDirectToken(this.baseUrl, params.token)
    }
    return null
  }

  async call<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
    try {
      const res = await uni.request({
        url: `${getBaseUrl(this.baseUrl)}/api/${command}`,
        method: "POST",
        data: payload ?? {},
        timeout: COMMAND_TIMEOUT_MS[command],
        header: {
          "content-type": "application/json",
          authorization: `Bearer ${this.getToken()}`,
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
        buildWebSocketProtocols(this.getToken())
      )
      let opened = false
      const readyCallbacks = new Set<() => void>()
      const closeCallbacks = new Set<() => void>()
      const errorCallbacks = new Set<() => void>()
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
        closeCallbacks.forEach((callback) => {
          try {
            callback()
          } catch (error) {
            console.error("direct websocket close callback failed", error)
          }
        })
      })
      ws.addEventListener("error", () => {
        opened = false
        errorCallbacks.forEach((callback) => {
          try {
            callback()
          } catch (error) {
            console.error("direct websocket error callback failed", error)
          }
        })
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
        onClose: (callback: () => void) => {
          closeCallbacks.add(callback)
          return () => closeCallbacks.delete(callback)
        },
        onError: (callback: () => void) => {
          errorCallbacks.add(callback)
          return () => errorCallbacks.delete(callback)
        },
        close: () => {
          readyCallbacks.clear()
          closeCallbacks.clear()
          errorCallbacks.clear()
          ws.close()
        },
      }
    }

    const socketTask: any = uni.connectSocket({
      url: `${getBaseUrl(this.baseUrl).replace(/^http/, "ws")}/ws/events`,
      protocols: buildWebSocketProtocols(this.getToken()),
      complete: () => {},
    })
    let opened = false
    const readyCallbacks = new Set<() => void>()
    const closeCallbacks = new Set<() => void>()
    const errorCallbacks = new Set<() => void>()
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
      closeCallbacks.forEach((callback) => {
        try {
          callback()
        } catch (error) {
          console.error("direct socket close callback failed", error)
        }
      })
    })
    socketTask.onError(() => {
      opened = false
      errorCallbacks.forEach((callback) => {
        try {
          callback()
        } catch (error) {
          console.error("direct socket error callback failed", error)
        }
      })
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
      onClose: (callback: () => void) => {
        closeCallbacks.add(callback)
        return () => closeCallbacks.delete(callback)
      },
      onError: (callback: () => void) => {
        errorCallbacks.add(callback)
        return () => errorCallbacks.delete(callback)
      },
      close: () => {
        readyCallbacks.clear()
        closeCallbacks.clear()
        errorCallbacks.clear()
        socketTask.close({})
      },
    }
  }

  async refreshAuth(): Promise<void> {
    return
  }

  getRemoteInstanceDescriptor() {
    const baseUrl = getBaseUrl(this.baseUrl)
    const token = this.getToken()
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
