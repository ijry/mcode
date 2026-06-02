import type { CodegGateway, RelaySessionInfo } from "./types"

function getHeaders(session?: RelaySessionInfo | null): HeadersInit {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  }
  if (session?.accessToken) {
    headers.authorization = `Bearer ${session.accessToken}`
  }
  return headers
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
    const res = await uni.request({
      url: `${this.relayUrl.replace(/\/$/, "")}/v1/proxy/${command}`,
      method: "POST",
      data: payload ?? {},
      header: getHeaders(this.session),
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
      url: `${this.relayUrl.replace(/^http/, "ws").replace(/\/$/, "")}/v1/events`,
      header: getHeaders(this.session),
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
}
