import type {
  CodegGateway,
  EventChannelConnection,
  EventRecoveryOptions,
  LocalServiceMetadata,
  PairTargetMetadata,
  RelaySessionInfo,
} from "./types"
import { toErrorMessage, toResponseErrorMessage } from "./error"
import { buildRemoteInstanceKey } from "@/services/realtime/instance-key"
import { decodeSocketPayload } from "./socketPayload"
import { buildWebSocketProtocols } from "./wsProtocol"
import { buildRelayEventsUrl } from "./relayRecovery"
import { getRelayClientId } from "./relayClientIdentity"

const COMMAND_TIMEOUT_MS: Record<string, number> = {
  acp_describe_agent_options: 70_000,
  acp_download_agent_binary: 600_000,
  acp_install_uv_tool: 600_000,
  acp_prepare_npx_agent: 600_000,
  acp_uninstall_agent: 180_000,
}

function getHeaders(session?: RelaySessionInfo | null): HeadersInit {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-mcode-client-id": getRelayClientId(),
  }
  if (session?.accessToken) {
    headers.authorization = `Bearer ${session.accessToken}`
  }
  return headers
}

function isH5WebSocketRuntime() {
  // #ifdef H5
  return true
  // #endif
  return false
}

function normalizePairTargetMetadata(input: unknown): PairTargetMetadata {
  if (!input || typeof input !== "object") return {}
  const raw = input as Record<string, unknown>
  const capabilities = Array.isArray(raw.capabilities)
    ? raw.capabilities
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : undefined

  return {
    ...(typeof raw.targetId === "string" && raw.targetId.trim() ? { targetId: raw.targetId.trim() } : {}),
    ...(raw.targetAgent === "codeg" || raw.targetAgent === "opencode" || raw.targetAgent === "mcode-desktop"
      ? { targetAgent: raw.targetAgent }
      : {}),
    ...(typeof raw.displayName === "string" && raw.displayName.trim()
      ? { displayName: raw.displayName.trim() }
      : {}),
    ...(capabilities?.length ? { capabilities: Array.from(new Set(capabilities)) } : {}),
    ...(typeof raw.protocolVersion === "string" && raw.protocolVersion.trim()
      ? { protocolVersion: raw.protocolVersion.trim() }
      : {}),
  }
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
      target?: unknown
    }
    const target = normalizePairTargetMetadata(raw.target)
    const data: RelaySessionInfo = {
      accessToken: raw.accessToken ?? "",
      refreshToken: raw.refreshToken,
      ...target,
    }
    this.session.accessToken = data.accessToken
    this.session.refreshToken = data.refreshToken
    this.session.targetId = data.targetId
    this.session.targetAgent = data.targetAgent
    this.session.displayName = data.displayName
    this.session.capabilities = data.capabilities
    this.session.protocolVersion = data.protocolVersion
    return data
  }

  async call<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
    try {
      const res = await uni.request({
        url: `${this.relayUrl.replace(/\/$/, "")}/v1/proxy/${command}`,
        method: "POST",
        data: payload ?? {},
        timeout: COMMAND_TIMEOUT_MS[command],
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

  async listTargetServices(): Promise<LocalServiceMetadata[]> {
    const res = await uni.request({
      url: `${this.relayUrl.replace(/\/$/, "")}/v1/target-services`,
      method: "GET",
      header: getHeaders(this.session),
    })
    const statusCode = Number((res as any).statusCode || 0)
    if (statusCode >= 400) {
      throw new Error(`target-services: ${toResponseErrorMessage(res.data, statusCode)}`)
    }
    const raw = res.data as { services?: unknown }
    return normalizeLocalServices(raw.services)
  }

  async connectEvents(
    onEvent: (event: unknown) => void,
    options: EventRecoveryOptions = {}
  ): Promise<EventChannelConnection> {
    const eventsUrl = buildRelayEventsUrl(
      this.relayUrl,
      options.lastEventId,
      getRelayClientId()
    )
    if (isH5WebSocketRuntime()) {
      const ws = new WebSocket(
        eventsUrl,
        buildWebSocketProtocols(this.session.accessToken || "")
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
            console.error("relay websocket ready callback failed", error)
          }
        })
      })
      ws.addEventListener("close", () => {
        opened = false
        closeCallbacks.forEach((callback) => {
          try {
            callback()
          } catch (error) {
            console.error("relay websocket close callback failed", error)
          }
        })
      })
      ws.addEventListener("error", () => {
        opened = false
        errorCallbacks.forEach((callback) => {
          try {
            callback()
          } catch (error) {
            console.error("relay websocket error callback failed", error)
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
      url: eventsUrl,
      header: getHeaders(this.session),
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
          console.error("relay socket ready callback failed", error)
        }
      })
    })
    socketTask.onClose(() => {
      opened = false
      closeCallbacks.forEach((callback) => {
        try {
          callback()
        } catch (error) {
          console.error("relay socket close callback failed", error)
        }
      })
    })
    socketTask.onError(() => {
      opened = false
      errorCallbacks.forEach((callback) => {
        try {
          callback()
        } catch (error) {
          console.error("relay socket error callback failed", error)
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
    const res = await uni.request({
      url: `${this.relayUrl.replace(/\/$/, "")}/v1/session/refresh`,
      method: "POST",
      data: { refreshToken: this.session.refreshToken },
      header: { "content-type": "application/json" },
    })
    const raw = res.data as Partial<RelaySessionInfo> & { target?: unknown }
    const data: Partial<RelaySessionInfo> = {
      ...raw,
      ...normalizePairTargetMetadata(raw.target),
    }
    if (data.accessToken) {
      this.session.accessToken = data.accessToken
    }
    if (data.refreshToken) {
      this.session.refreshToken = data.refreshToken
    }
    if (data.targetId) {
      this.session.targetId = data.targetId
    }
    if (data.targetAgent) {
      this.session.targetAgent = data.targetAgent
    }
    if (data.displayName) {
      this.session.displayName = data.displayName
    }
    if (data.capabilities) {
      this.session.capabilities = data.capabilities
    }
    if (data.protocolVersion) {
      this.session.protocolVersion = data.protocolVersion
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

function normalizeLocalServices(input: unknown): LocalServiceMetadata[] {
  if (!Array.isArray(input)) return []
  const services: LocalServiceMetadata[] = []
  const seenPorts = new Set<number>()
  for (const item of input) {
    if (!item || typeof item !== "object") continue
    const raw = item as Record<string, unknown>
    const name = String(raw.name || "").trim()
    const host = String(raw.host || "").trim()
    const port = Number(raw.port)
    if (!name || host !== "127.0.0.1") continue
    if (!Number.isInteger(port) || port <= 0 || port > 65535 || seenPorts.has(port)) continue
    seenPorts.add(port)
    services.push({
      name,
      host: "127.0.0.1",
      port,
      protocol: raw.protocol === "tcp" ? "tcp" : "http",
      enabled: Boolean(raw.enabled),
    })
  }
  return services
}
