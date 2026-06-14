import { createGateway } from "@/services/gateway"
import type { CodegGateway, GatewayMode, RelaySessionInfo } from "@/services/gateway"
import { getDirectToken } from "@/services/gateway/directTokenStore"
import { buildRemoteInstanceKey } from "@/services/realtime/instance-key"

export interface ConnectionContext {
  name: string
  mode: GatewayMode
  url: string
  directToken?: string
  pairCode?: string
  pairSecret?: string
  relaySession?: RelaySessionInfo | null
}

export interface ResolvedConnectionContext {
  connection: ConnectionContext
  gateway: CodegGateway
  instanceKey: string
}

export function normalizeBaseUrl(url: string) {
  return String(url || "").trim().replace(/\/+$/, "")
}

export function buildConnectionKey(input: Pick<ConnectionContext, "mode" | "url">) {
  return `${input.mode}::${normalizeBaseUrl(input.url)}`
}

export function encodeConnectionContext(connection: ConnectionContext) {
  return encodeURIComponent(JSON.stringify(sanitizeConnectionContext(connection)))
}

export function decodeConnectionContext(raw?: string | null): ConnectionContext | null {
  const input = String(raw || "").trim()
  if (!input) return null

  try {
    const parsed = JSON.parse(decodeURIComponent(input)) as Record<string, unknown>
    const mode = parsed.mode === "relay" ? "relay" : parsed.mode === "direct" ? "direct" : null
    const url = normalizeBaseUrl(String(parsed.url || ""))
    if (!mode || !url) return null

    return {
      name: String(parsed.name || "").trim() || "未命名连接",
      mode,
      url,
      directToken: pickString(parsed.directToken),
      pairCode: pickString(parsed.pairCode),
      pairSecret: pickString(parsed.pairSecret),
      relaySession: normalizeRelaySession(parsed.relaySession),
    }
  } catch {
    return null
  }
}

export async function resolveConnectionContext(
  connection: ConnectionContext
): Promise<ResolvedConnectionContext> {
  if (connection.mode === "direct") {
    const token = pickString(connection.directToken, getDirectToken(connection.url))
    if (!token) {
      throw new Error(`${connection.name} 缺少直连令牌`)
    }

    const gateway = createGateway({
      mode: "direct",
      directBaseUrl: connection.url,
    })
    await gateway.pair({
      directBaseUrl: connection.url,
      token,
    })

    const instanceKey = buildRemoteInstanceKey({
      mode: "direct",
      baseUrl: connection.url,
      principal: token.slice(0, 16) || "direct:anonymous",
    })

    return {
      connection: {
        ...connection,
        directToken: token,
      },
      gateway,
      instanceKey,
    }
  }

  let relaySession = normalizeRelaySession(connection.relaySession)
  if (!relaySession?.accessToken) {
    if (!connection.pairCode || !connection.pairSecret) {
      throw new Error(`${connection.name} 缺少中继配对信息`)
    }

    const pairGateway = createGateway({
      mode: "relay",
      relayUrl: connection.url,
      session: { accessToken: "" },
    })
    const session = await pairGateway.pair({
      relayUrl: connection.url,
      code: connection.pairCode,
      secret: connection.pairSecret,
    })
    if (!session?.accessToken) {
      throw new Error(`${connection.name} 中继会话无效`)
    }
    relaySession = session
  }

  const gateway = createGateway({
    mode: "relay",
    relayUrl: connection.url,
    session: relaySession,
  })
  const descriptor = gateway.getRemoteInstanceDescriptor()
  const instanceKey =
    descriptor.instanceKey ||
    buildRemoteInstanceKey({
      mode: "relay",
      baseUrl: connection.url,
      principal: relaySession?.targetId || relaySession?.refreshToken || "relay:anonymous",
    })

  return {
    connection: {
      ...connection,
      relaySession,
    },
    gateway,
    instanceKey,
  }
}

export function persistResolvedConnection(connection: ConnectionContext) {
  const savedConnections = readStoredConnections()
  const key = buildConnectionKey(connection)
  const index = savedConnections.findIndex((item) => buildConnectionKey(item) === key)
  if (index < 0) return

  savedConnections[index] = {
    ...savedConnections[index],
    directToken: pickString(connection.directToken, savedConnections[index].directToken),
    relaySession: connection.relaySession ?? savedConnections[index].relaySession ?? null,
  }
  uni.setStorageSync("mcode_connections", savedConnections)
}

export function readStoredConnections(): ConnectionContext[] {
  const raw = uni.getStorageSync("mcode_connections")
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => normalizeStoredConnection(item))
    .filter((item): item is ConnectionContext => Boolean(item))
}

function sanitizeConnectionContext(connection: ConnectionContext) {
  return {
    name: String(connection.name || "").trim(),
    mode: connection.mode,
    url: normalizeBaseUrl(connection.url),
    directToken: pickString(connection.directToken) || undefined,
    pairCode: pickString(connection.pairCode) || undefined,
    pairSecret: pickString(connection.pairSecret) || undefined,
    relaySession: normalizeRelaySession(connection.relaySession) || undefined,
  }
}

function normalizeStoredConnection(input: unknown): ConnectionContext | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  const mode = raw.mode === "relay" ? "relay" : raw.mode === "direct" ? "direct" : null
  const url = normalizeBaseUrl(String(raw.url || ""))
  if (!mode || !url) return null

  return {
    name: String(raw.name || "").trim() || "未命名连接",
    mode,
    url,
    directToken: pickString(raw.directToken),
    pairCode: pickString(raw.pairCode),
    pairSecret: pickString(raw.pairSecret),
    relaySession: normalizeRelaySession(raw.relaySession),
  }
}

function normalizeRelaySession(input: unknown): RelaySessionInfo | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  const accessToken = pickString(raw.accessToken)
  if (!accessToken) return null

  return {
    accessToken,
    refreshToken: pickString(raw.refreshToken) || undefined,
    targetId: pickString(raw.targetId) || undefined,
  }
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }
  return ""
}
