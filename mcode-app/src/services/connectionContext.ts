import type { GatewayMode, RelaySessionInfo } from "@/services/gateway"
import {
  toConnectionRuntimeContext,
  type ConnectionRuntimeContext,
  type DriverResolvedConnectionContext,
} from "@/agents/shared/driverTypes"
import { resolveConnectionDriver } from "@/services/gateway/connectionDriverRegistry"
import {
  buildConnectionRecordKey,
  migrateConnectionRecord,
  normalizeConnectionBaseUrl,
  normalizeConnectionRecordV2,
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

export type ConnectionContext = ConnectionRuntimeContext

export type ConnectionContextLike = ConnectionContext | ConnectionRecordV2 | LegacyConnectionContextInput

export type ResolvedConnectionContext = DriverResolvedConnectionContext

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
  return toConnectionRuntimeContext(record)
}
