import { createGateway } from "@/services/gateway"
import type { CodegGateway, GatewayMode, RelaySessionInfo } from "@/services/gateway"
import { getDirectToken } from "@/services/gateway/directTokenStore"
import { buildRemoteInstanceKey } from "@/services/realtime/instance-key"
import {
  buildConnectionRecordKey,
  deriveLegacyRouteCompat,
  migrateConnectionRecord,
  normalizeConnectionBaseUrl,
  normalizeConnectionRecordV2,
  normalizeRelaySessionInfo,
  type ConnectionRecordV2,
} from "./connectionSchema"

export interface LegacyConnectionContextInput {
  name: string
  mode: GatewayMode
  url: string
  directToken?: string
  pairCode?: string
  pairSecret?: string
  relaySession?: RelaySessionInfo | null
}

export interface ConnectionContext extends ConnectionRecordV2 {
  mode: GatewayMode
  url: string
  relaySession?: RelaySessionInfo
}

export type ConnectionContextLike = ConnectionContext | ConnectionRecordV2 | LegacyConnectionContextInput

export interface ResolvedConnectionContext {
  connection: ConnectionContext
  gateway: CodegGateway
  instanceKey: string
}

export function normalizeBaseUrl(url: string) {
  return normalizeConnectionBaseUrl(url)
}

export function buildConnectionKey(input: ConnectionContextLike) {
  const normalized = normalizeConnectionContext(input)
  return normalized ? buildConnectionRecordKey(normalized) : ""
}

export function encodeConnectionContext(connection: ConnectionContextLike) {
  return encodeURIComponent(JSON.stringify(sanitizeConnectionContext(connection)))
}

export function decodeConnectionContext(raw?: string | null): ConnectionContext | null {
  const input = String(raw || "").trim()
  if (!input) return null

  try {
    return normalizeConnectionContext(JSON.parse(decodeURIComponent(input)))
  } catch {
    return null
  }
}

export async function resolveConnectionContext(
  connection: ConnectionContextLike
): Promise<ResolvedConnectionContext> {
  const normalized = normalizeConnectionContext(connection)
  if (!normalized) {
    throw new Error("连接信息无效")
  }

  if (normalized.routeMode === "direct") {
    const token = pickString(normalized.directToken, getDirectToken(normalized.directBaseUrl || ""))
    if (!token) {
      throw new Error(`${normalized.name} 缺少直连令牌`)
    }

    const gateway = createGateway({
      mode: "direct",
      directBaseUrl: normalized.directBaseUrl,
    })
    await gateway.pair({
      directBaseUrl: normalized.directBaseUrl,
      token,
    })

    const instanceKey = buildRemoteInstanceKey({
      mode: "direct",
      baseUrl: normalized.directBaseUrl || "",
      principal: token.slice(0, 16) || "direct:anonymous",
    })

    return {
      connection: toConnectionContext({
        ...normalized,
        directToken: token,
      }),
      gateway,
      instanceKey,
    }
  }

  let gatewaySession = normalizeRelaySessionInfo(normalized.gatewaySession ?? normalized.relaySession)
  if (!gatewaySession?.accessToken) {
    if (!normalized.pairCode || !normalized.pairSecret) {
      throw new Error(`${normalized.name} 缺少中继配对信息`)
    }

    const pairGateway = createGateway({
      mode: "relay",
      relayUrl: normalized.gatewayBaseUrl || normalized.url,
      session: { accessToken: "" },
    })
    const session = await pairGateway.pair({
      relayUrl: normalized.gatewayBaseUrl || normalized.url,
      code: normalized.pairCode,
      secret: normalized.pairSecret,
    })
    if (!session?.accessToken) {
      throw new Error(`${normalized.name} 中继会话无效`)
    }
    gatewaySession = session
  }

  const gateway = createGateway({
    mode: "relay",
    relayUrl: normalized.gatewayBaseUrl || normalized.url,
    session: gatewaySession,
  })
  const descriptor = gateway.getRemoteInstanceDescriptor()
  const instanceKey =
    descriptor.instanceKey ||
    buildRemoteInstanceKey({
      mode: "relay",
      baseUrl: normalized.gatewayBaseUrl || normalized.url,
      principal: gatewaySession?.targetId || gatewaySession?.refreshToken || "relay:anonymous",
    })

  return {
    connection: toConnectionContext({
      ...normalized,
      gatewaySession,
    }),
    gateway,
    instanceKey,
  }
}

export function persistResolvedConnection(connection: ConnectionContextLike) {
  const normalized = normalizeConnectionContext(connection)
  if (!normalized) return

  const savedConnections = readStoredConnections()
  const key = buildConnectionRecordKey(normalized)
  const index = savedConnections.findIndex((item) => buildConnectionRecordKey(item) === key)
  if (index < 0) return

  savedConnections[index] = sanitizeConnectionContext({
    ...savedConnections[index],
    ...normalized,
  })
  uni.setStorageSync("mcode_connections", savedConnections.map((item) => sanitizeConnectionContext(item)))
}

export function readStoredConnections(): ConnectionContext[] {
  const raw = uni.getStorageSync("mcode_connections")
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => normalizeConnectionContext(item))
    .filter((item): item is ConnectionContext => Boolean(item))
}

function normalizeConnectionContext(input: unknown): ConnectionContext | null {
  const record = normalizeConnectionRecordInput(input)
  return record ? toConnectionContext(record) : null
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }
  return ""
}

function sanitizeConnectionContext(connection: ConnectionContextLike) {
  const normalized = normalizeConnectionContext(connection)
  if (!normalized) {
    throw new Error("连接信息无效")
  }
  return normalized
}

function normalizeConnectionRecordInput(input: unknown): ConnectionRecordV2 | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>

  const normalizedV2 = normalizeConnectionRecordV2({
    version: 2,
    ...raw,
    gatewaySession: raw.gatewaySession ?? raw.relaySession,
  })
  if (normalizedV2) return normalizedV2

  return migrateConnectionRecord(raw)
}

function toConnectionContext(record: ConnectionRecordV2): ConnectionContext {
  return {
    ...record,
    ...deriveLegacyRouteCompat(record),
  }
}
