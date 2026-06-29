import { buildRemoteInstanceKey } from "@/services/realtime/instance-key"
import type { RemoteInstanceDescriptor } from "@/services/realtime/types"
import {
  buildConnectionRecordKey,
  normalizeConnectionRecordV2,
  normalizeRelaySessionInfo,
  type ConnectionRecordV2,
  type ConnectionTargetAgent,
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

export type StoredConnectionItem = Omit<ConnectionRecordV2, "gatewaySession"> & {
  gatewaySession?: StoredRelaySessionInfo | null
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
  })
  if (v2) {
    const gatewaySession = normalizeStoredRelaySession(v2.gatewaySession)
    return {
      ...v2,
      directToken: v2.directToken || undefined,
      pairCode: v2.pairCode || undefined,
      pairSecret: v2.pairSecret || undefined,
      gatewaySession: gatewaySession || undefined,
    }
  }
  return null
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
  conn: Partial<Pick<StoredConnectionItem, "targetAgent" | "targetProfile" | "gatewaySession">> | null | undefined
): ConnectionTargetAgent {
  return normalizeTargetAgent(conn?.targetAgent) ||
    normalizeTargetAgent(conn?.targetProfile?.targetAgent) ||
    normalizeTargetAgent(conn?.gatewaySession?.targetAgent) ||
    "codeg"
}

export function buildDescriptorFromStoredConnection(
  conn: StoredConnectionItem,
  directTokenFallback?: string
): RemoteInstanceDescriptor | null {
  const baseUrl = normalizeConnectionUrl(
    conn.routeMode === "direct" ? conn.directBaseUrl || "" : conn.gatewayBaseUrl || ""
  )
  if (!baseUrl) return null

  if (conn.routeMode === "direct") {
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

  const accessToken = firstString(conn.gatewaySession?.accessToken)
  const refreshToken = firstString(conn.gatewaySession?.refreshToken) || undefined
  const targetId = firstString(conn.gatewaySession?.targetId)
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
  return [buildStoredConnectionPrimaryKey(conn)].filter(Boolean)
}

function buildStoredConnectionPrimaryKey(conn: StoredConnectionItem): string {
  return buildConnectionRecordKey(conn)
}

function normalizeTargetAgent(value: unknown): ConnectionTargetAgent | null {
  if (value === "codeg" || value === "opencode" || value === "mcode-desktop") {
    return value
  }
  return null
}
