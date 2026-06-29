import type { PairTargetMetadata, RelaySessionInfo } from "@/services/gateway"
import {
  toConnectionRuntimeContext,
  type ConnectionRuntimeContext,
  type DriverResolvedConnectionContext,
} from "@/agents/shared/driverTypes"
import { resolveConnectionDriver } from "@/services/gateway/connectionDriverRegistry"
import {
  buildConnectionRecordKey,
  normalizeConnectionBaseUrl,
  normalizeConnectionRecordV2,
  normalizePairTargetProfile,
  type ConnectionRecordV2,
  type ConnectionTargetAgent,
} from "./connectionSchema"
import { assertPairTargetAgentMatchesSelection } from "./connectionPairValidation"

export type ConnectionContext = ConnectionRuntimeContext

export type ConnectionContextLike = ConnectionContext | ConnectionRecordV2

export type ResolvedConnectionContext = DriverResolvedConnectionContext

export function normalizeBaseUrl(url: string) {
  return normalizeConnectionBaseUrl(url)
}

export function buildConnectionKey(input: ConnectionContextLike) {
  const normalized = normalizeConnectionContext(input)
  return normalized ? buildConnectionRecordKey(normalized) : ""
}

export function connectionKeyMatches(input: ConnectionContextLike, lookupKey: string) {
  const normalizedLookup = String(lookupKey || "").trim()
  if (!normalizedLookup) return false
  return buildConnectionKey(input) === normalizedLookup
}

export function isConnectionMarkedConnected(
  input: ConnectionContextLike,
  connectedMap: Record<string, unknown> | null | undefined
) {
  return Boolean(connectedMap?.[buildConnectionKey(input)])
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

  const sourceKey = buildConnectionRecordKey(normalized)
  const driver = resolveConnectionDriver(normalized)
  const resolved = await driver.connect(normalized)
  persistResolvedConnection(resolved.connection, sourceKey)
  return resolved
}

export function persistResolvedConnection(connection: ConnectionContextLike, lookupKey?: string) {
  const normalized = normalizeConnectionContext(connection)
  if (!normalized) return

  const savedConnections = readStoredConnections()
  const candidateKeys = Array.from(
    new Set([String(lookupKey || "").trim(), buildConnectionRecordKey(normalized)].filter(Boolean))
  )
  const index = savedConnections.findIndex((item) =>
    candidateKeys.includes(buildConnectionRecordKey(item))
  )
  if (index < 0) return

  savedConnections[index] = sanitizeConnectionContext({
    ...savedConnections[index],
    ...normalized,
  })
  uni.setStorageSync("mcode_connections", savedConnections.map((item) => sanitizeConnectionContext(item)))
}

export function applyPairMetadata(
  connection: ConnectionContextLike,
  session: RelaySessionInfo | null,
  target: PairTargetMetadata | null
): ConnectionContext {
  const normalized = normalizeConnectionContext(connection)
  if (!normalized) {
    throw new Error("连接信息无效")
  }

  const normalizedTarget = normalizePairTargetProfile({
    ...(session || {}),
    ...(target || {}),
  })
  const pairedTargetAgent = normalizedTarget?.targetAgent || normalizeTargetAgent(session?.targetAgent)
  if (session && !pairedTargetAgent) {
    assertPairTargetAgentMatchesSelection({}, normalized.targetAgent)
  }
  if (pairedTargetAgent) {
    assertPairTargetAgentMatchesSelection({ targetAgent: pairedTargetAgent }, normalized.targetAgent)
  }
  const targetProfile = normalizedTarget || normalized.targetProfile || null
  const gatewaySession = session
    ? {
        ...session,
        ...(targetProfile?.targetId ? { targetId: targetProfile.targetId } : {}),
        ...(targetProfile?.targetAgent ? { targetAgent: targetProfile.targetAgent } : {}),
        ...(targetProfile?.displayName ? { displayName: targetProfile.displayName } : {}),
        ...(targetProfile?.capabilities ? { capabilities: targetProfile.capabilities } : {}),
        ...(targetProfile?.protocolVersion ? { protocolVersion: targetProfile.protocolVersion } : {}),
      }
    : normalized.gatewaySession || null

  return toConnectionContext({
    ...normalized,
    ...(gatewaySession ? { gatewaySession } : {}),
    ...(targetProfile ? { targetProfile } : {}),
  })
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

function sanitizeConnectionContext(connection: ConnectionContextLike) {
  const normalized = normalizeConnectionContext(connection)
  if (!normalized) {
    throw new Error("连接信息无效")
  }
  return normalized
}

function normalizeConnectionRecordInput(input: unknown): ConnectionRecordV2 | null {
  if (!input || typeof input !== "object") return null
  return normalizeConnectionRecordV2({
    version: 2,
    ...(input as Record<string, unknown>),
  })
}

function toConnectionContext(record: ConnectionRecordV2): ConnectionContext {
  return toConnectionRuntimeContext(record)
}

function normalizeTargetAgent(value: unknown): ConnectionTargetAgent | null {
  return value === "codeg" || value === "opencode" || value === "mcode-desktop"
    ? value
    : null
}
