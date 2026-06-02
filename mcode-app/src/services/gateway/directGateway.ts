import type { CodegGateway } from "./types"

function getBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "")
}

function getToken(): string {
  return uni.getStorageSync("mcode_direct_token") || ""
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
      const body = res.data as any
      const message =
        (body && typeof body === "object" && String(body.error || body.message || "").trim()) ||
        `HTTP ${statusCode}`
      throw new Error(`${command}: ${message}`)
    }
    if (res.data && typeof res.data === "object") {
      const maybeError = (res.data as Record<string, unknown>).error
      if (typeof maybeError === "string" && maybeError.trim()) {
        throw new Error(`${command}: ${maybeError.trim()}`)
      }
    }
    return res.data as T
  }

  async connectEvents(onEvent: (event: unknown) => void): Promise<() => void> {
    const socketTask = await uni.connectSocket({
      url: `${getBaseUrl(this.baseUrl).replace(/^http/, "ws")}/ws/events?token=${encodeURIComponent(getToken())}`,
    })
    socketTask.onMessage((msg: { data: unknown }) => {
      try {
        onEvent(JSON.parse(String(msg.data)))
      } catch {
        onEvent(msg.data)
      }
    })
    return async () => {
      socketTask.close({})
    }
  }

  async refreshAuth(): Promise<void> {
    return
  }
}
