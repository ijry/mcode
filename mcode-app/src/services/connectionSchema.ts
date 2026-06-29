import type { RelaySessionInfo } from "@/services/gateway"

export type ConnectionTargetAgent = "codeg" | "opencode" | "mcode-desktop"
export type ConnectionRouteMode = "direct" | "gateway"
export type ConnectionGatewayProvider = "official" | "custom"

export interface ConnectionTargetProfile {
  targetAgent: ConnectionTargetAgent
  targetId?: string
  displayName?: string
  capabilities?: string[]
  protocolVersion?: string
}

export interface ConnectionRecordV2 {
  version: 2
  id?: string
  name: string
  targetAgent: ConnectionTargetAgent
  routeMode: ConnectionRouteMode
  directBaseUrl?: string
  directToken?: string
  gatewayProvider?: ConnectionGatewayProvider
  gatewayBaseUrl?: string
  pairCode?: string
  pairSecret?: string
  gatewaySession?: RelaySessionInfo | null
  targetProfile?: ConnectionTargetProfile | null
}

const TARGET_AGENTS = new Set<ConnectionTargetAgent>(["codeg", "opencode", "mcode-desktop"])
const ROUTE_MODES = new Set<ConnectionRouteMode>(["direct", "gateway"])
const GATEWAY_PROVIDERS = new Set<ConnectionGatewayProvider>(["official", "custom"])

export function normalizeConnectionBaseUrl(url: string) {
  return String(url || "").trim().replace(/\/+$/, "")
}

export function normalizeRelaySessionInfo(input: unknown): RelaySessionInfo | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  const accessToken = pickString(raw.accessToken)
  const refreshToken = pickString(raw.refreshToken) || undefined
  const targetId = pickString(raw.targetId) || undefined
  const targetAgent = pickString(raw.targetAgent) || undefined
  const displayName = pickString(raw.displayName) || undefined
  const capabilities = Array.isArray(raw.capabilities)
    ? raw.capabilities
        .map((item) => pickString(item))
        .filter((item): item is string => Boolean(item))
    : undefined
  const protocolVersion = pickString(raw.protocolVersion) || undefined

  if (!accessToken && !refreshToken && !targetId) return null

  return {
    accessToken,
    ...(refreshToken ? { refreshToken } : {}),
    ...(targetId ? { targetId } : {}),
    ...(targetAgent ? { targetAgent } : {}),
    ...(displayName ? { displayName } : {}),
    ...(capabilities?.length ? { capabilities: Array.from(new Set(capabilities)) } : {}),
    ...(protocolVersion ? { protocolVersion } : {}),
  }
}

export function normalizePairTargetProfile(input: unknown): ConnectionTargetProfile | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  const targetAgent = normalizeTargetAgent(raw.targetAgent)
  if (!targetAgent) return null

  const capabilities = Array.isArray(raw.capabilities)
    ? raw.capabilities
        .map((item) => pickString(item))
        .filter((item): item is string => Boolean(item))
    : undefined

  return {
    targetAgent,
    ...(pickString(raw.targetId) ? { targetId: pickString(raw.targetId) } : {}),
    ...(pickString(raw.displayName) ? { displayName: pickString(raw.displayName) } : {}),
    ...(capabilities?.length ? { capabilities: Array.from(new Set(capabilities)) } : {}),
    ...(pickString(raw.protocolVersion) ? { protocolVersion: pickString(raw.protocolVersion) } : {}),
  }
}

export function normalizeConnectionRecordV2(input: Record<string, unknown>): ConnectionRecordV2 | null {
  if (Number(input.version) !== 2) return null

  const id = normalizeConnectionId(input.id)
  const targetAgent = normalizeTargetAgent(input.targetAgent)
  const routeMode = normalizeRouteMode(input.routeMode)
  if (!targetAgent || !routeMode) return null

  const name = pickString(input.name) || "MCode"
  const directBaseUrl = normalizeConnectionBaseUrl(pickString(input.directBaseUrl))
  const directToken = pickString(input.directToken) || undefined
  const gatewayProvider = normalizeGatewayProvider(input.gatewayProvider) || undefined
  const gatewayBaseUrl = normalizeConnectionBaseUrl(pickString(input.gatewayBaseUrl))
  const pairCode = pickString(input.pairCode) || undefined
  const pairSecret = pickString(input.pairSecret) || undefined
  const gatewaySession = normalizeRelaySessionInfo(input.gatewaySession)
  const targetProfile = normalizePairTargetProfile(input.targetProfile)

  if (routeMode === "direct") {
    if (!directBaseUrl) return null
    return {
      version: 2,
      ...(id ? { id } : {}),
      name,
      targetAgent,
      routeMode,
      directBaseUrl,
      ...(directToken ? { directToken } : {}),
      ...(targetProfile ? { targetProfile } : {}),
    }
  }

  if (gatewayProvider === "custom" && !gatewayBaseUrl) return null

  return {
    version: 2,
    ...(id ? { id } : {}),
    name,
    targetAgent,
    routeMode,
    gatewayProvider: gatewayProvider || "official",
    ...(gatewayBaseUrl ? { gatewayBaseUrl } : {}),
    ...(pairCode ? { pairCode } : {}),
    ...(pairSecret ? { pairSecret } : {}),
    ...(gatewaySession ? { gatewaySession } : {}),
    ...(targetProfile ? { targetProfile } : {}),
  }
}

export function normalizeConnectionId(value: unknown): string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(value.trim())
    ? value.trim()
    : ""
}

export function createConnectionRecordId(seed?: string): string {
  const suffix = randomIdSuffix()
  const normalizedSeed = String(seed || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
  return ["conn", normalizedSeed, suffix].filter(Boolean).join("_")
}

export function ensureConnectionRecordId<T extends ConnectionRecordV2>(
  record: T,
  seed?: string
): T & { id: string } {
  const existing = normalizeConnectionId(record.id)
  return {
    ...record,
    id: existing || createConnectionRecordId(seed || buildConnectionRecordKey(record)),
  }
}

export function buildConnectionRecordKey(
  record: Pick<
    ConnectionRecordV2,
    "targetAgent" | "routeMode" | "directBaseUrl" | "gatewayBaseUrl" | "gatewayProvider"
  >
) {
  const directBaseUrl = normalizeConnectionBaseUrl(pickString(record.directBaseUrl))
  const gatewayBaseUrl = normalizeConnectionBaseUrl(pickString(record.gatewayBaseUrl))
  const gatewayProvider = record.gatewayProvider || "official"
  const routeIdentity =
    record.routeMode === "direct"
      ? directBaseUrl
      : gatewayBaseUrl || `provider:${gatewayProvider}`

  return `${record.targetAgent}::${record.routeMode}::${routeIdentity}`
}

export function normalizeV2ConfigCodePayload(input: Record<string, unknown>): ConnectionRecordV2 {
  const normalized = normalizeConnectionRecordV2({
    version: 2,
    ...input,
  })
  if (!normalized) {
    throw new Error("不支持的配置码内容")
  }
  return normalized
}

function normalizeTargetAgent(value: unknown): ConnectionTargetAgent | null {
  return typeof value === "string" && TARGET_AGENTS.has(value as ConnectionTargetAgent)
    ? (value as ConnectionTargetAgent)
    : null
}

function normalizeRouteMode(value: unknown): ConnectionRouteMode | null {
  return typeof value === "string" && ROUTE_MODES.has(value as ConnectionRouteMode)
    ? (value as ConnectionRouteMode)
    : null
}

function normalizeGatewayProvider(value: unknown): ConnectionGatewayProvider | null {
  return typeof value === "string" && GATEWAY_PROVIDERS.has(value as ConnectionGatewayProvider)
    ? (value as ConnectionGatewayProvider)
    : null
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }
  return ""
}

function randomIdSuffix() {
  const crypto = (globalThis as { crypto?: { getRandomValues?: (array: Uint32Array) => Uint32Array } }).crypto
  if (crypto?.getRandomValues) {
    const values = crypto.getRandomValues(new Uint32Array(2))
    return Array.from(values)
      .map((value) => value.toString(36))
      .join("")
      .slice(0, 16)
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}
