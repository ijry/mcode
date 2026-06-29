import { buildRemoteInstanceKey } from "@/services/realtime/instance-key"
import type { RemoteInstanceDescriptor } from "@/services/realtime/types"
import {
  buildConnectionRecordKey,
  deriveLegacyRouteCompat,
  normalizeConnectionRecordV2,
  normalizeRelaySessionInfo,
  type ConnectionGatewayProvider,
  type ConnectionRouteMode,
  type ConnectionTargetAgent,
  type ConnectionTargetProfile,
} from "@/services/connectionSchema"
import { firstString } from "./detailDataNormalization"

export interface StoredRelaySessionInfo {
  accessToken?: string
  refreshToken?: string
  targetId?: string
  targetAgent?: string
  displayName?: string
  capabilities?: string[]
  protocolVersion?: string
}

export interface StoredConnectionItem {
  mode: "direct" | "relay"
  url: string
  version?: 2
  name?: string
  targetAgent?: ConnectionTargetAgent
  routeMode?: ConnectionRouteMode
  directBaseUrl?: string
  directToken?: string
  gatewayProvider?: ConnectionGatewayProvider
  gatewayBaseUrl?: string
  pairCode?: string
  pairSecret?: string
  gatewaySession?: StoredRelaySessionInfo | null
  targetProfile?: ConnectionTargetProfile | null
  relaySession?: StoredRelaySessionInfo
}

export function buildConnectionKey(mode: "direct" | "relay", url: string): string {
  return `${mode}::${normalizeConnectionUrl(url)}`
}

export function normalizeConnectionUrl(url: string): string {
  return String(url || "").trim().replace(/\/+$/, "")
}

export function normalizeStoredConnectionLike(input: unknown): StoredConnectionItem | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, any>

  const v2 = normalizeConnectionRecordV2({
    version: 2,
    ...raw,
    gatewaySession: raw.gatewaySession ?? raw.relaySession,
  })
  if (v2) {
    const compat = deriveLegacyRouteCompat(v2)
    const relaySession = normalizeStoredRelaySession(v2.gatewaySession ?? raw.relaySession)
    return {
      ...v2,
      ...compat,
      directToken: v2.directToken || undefined,
      pairCode: v2.pairCode || undefined,
      pairSecret: v2.pairSecret || undefined,
      gatewaySession: relaySession || v2.gatewaySession || undefined,
      relaySession,
    }
  }

  const mode = raw.mode === "relay" ? "relay" : raw.mode === "direct" ? "direct" : null
  const url = normalizeConnectionUrl(String(raw.url || ""))
  if (!mode || !url) return null

  const relaySession = normalizeStoredRelaySession(raw.relaySession)
  return {
    mode,
    url,
    directToken: firstString(raw.directToken) || undefined,
    pairCode: firstString(raw.pairCode) || undefined,
    pairSecret: firstString(raw.pairSecret) || undefined,
    relaySession,
  }
}

function normalizeStoredRelaySession(input: unknown): StoredRelaySessionInfo | undefined {
  const normalized = normalizeRelaySessionInfo(input)
  if (!normalized) return undefined
  return {
    accessToken: firstString(normalized.accessToken) || undefined,
    refreshToken: firstString(normalized.refreshToken) || undefined,
    targetId: firstString(normalized.targetId) || undefined,
    targetAgent: firstString(normalized.targetAgent) || undefined,
    displayName: firstString(normalized.displayName) || undefined,
    capabilities: Array.isArray(normalized.capabilities) && normalized.capabilities.length
      ? normalized.capabilities
      : undefined,
    protocolVersion: firstString(normalized.protocolVersion) || undefined,
  }
}

export function findStoredConnectionByKey(
  input: unknown,
  connKey: string
): StoredConnectionItem | null {
  if (!Array.isArray(input)) return null
  const targetKey = String(connKey || "").trim()
  const connections = input
    .map((item) => normalizeStoredConnectionLike(item))
    .filter((item): item is StoredConnectionItem => Boolean(item))

  for (const connection of connections) {
    if (buildStoredConnectionPrimaryKey(connection) === targetKey) {
      return connection
    }
  }

  for (const connection of connections) {
    if (buildStoredConnectionKeyCandidates(connection).includes(targetKey)) {
      return connection
    }
  }
  return null
}

export function resolveStoredConnectionTargetAgent(
  conn: Pick<StoredConnectionItem, "targetAgent" | "targetProfile" | "gatewaySession" | "relaySession"> | null | undefined
): ConnectionTargetAgent {
  return normalizeTargetAgent(conn?.targetAgent) ||
    normalizeTargetAgent(conn?.targetProfile?.targetAgent) ||
    normalizeTargetAgent(conn?.gatewaySession?.targetAgent) ||
    normalizeTargetAgent(conn?.relaySession?.targetAgent) ||
    "codeg"
}

export function buildDescriptorFromStoredConnection(
  conn: StoredConnectionItem,
  directTokenFallback?: string
): RemoteInstanceDescriptor | null {
  const baseUrl = normalizeConnectionUrl(conn.url)
  if (!baseUrl) return null

  if (conn.mode === "direct") {
    const token = firstString(conn.directToken, directTokenFallback)
    const principal = token ? `direct:${token.slice(0, 16)}` : "direct:anonymous"
    return {
      instanceKey: buildRemoteInstanceKey({
        mode: "direct",
        baseUrl,
        principal,
      }),
      mode: "direct",
      baseUrl,
      principal,
      authToken: token || undefined,
    }
  }

  const accessToken = firstString(conn.relaySession?.accessToken)
  const refreshToken = firstString(conn.relaySession?.refreshToken) || undefined
  const targetId = firstString(conn.relaySession?.targetId)
  const principal = targetId || refreshToken || accessToken || "relay:anonymous"
  return {
    instanceKey: buildRemoteInstanceKey({
      mode: "relay",
      baseUrl,
      principal,
    }),
    mode: "relay",
    baseUrl,
    principal,
    authToken: accessToken || undefined,
    refreshToken,
  }
}

function buildStoredConnectionKeyCandidates(conn: StoredConnectionItem): string[] {
  return Array.from(new Set([
    buildStoredConnectionPrimaryKey(conn),
    buildConnectionKey(conn.mode, conn.url),
  ].filter(Boolean)))
}

function buildStoredConnectionPrimaryKey(conn: StoredConnectionItem): string {
  if (conn.targetAgent && conn.routeMode) {
    return buildConnectionRecordKey({
      targetAgent: conn.targetAgent,
      routeMode: conn.routeMode,
      directBaseUrl: conn.directBaseUrl || (conn.mode === "direct" ? conn.url : ""),
      gatewayBaseUrl: conn.gatewayBaseUrl || (conn.mode === "relay" ? conn.url : ""),
      gatewayProvider: conn.gatewayProvider,
    })
  }
  return buildConnectionKey(conn.mode, conn.url)
}

function normalizeTargetAgent(value: unknown): ConnectionTargetAgent | null {
  if (value === "codeg" || value === "opencode" || value === "mcode-desktop") {
    return value
  }
  return null
}
