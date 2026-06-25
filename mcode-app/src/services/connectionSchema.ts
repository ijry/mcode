import type { RelaySessionInfo } from "@/services/gateway"

export type ConnectionTargetAgent = "codeg" | "opencode" | "mcode-desktop"
export type ConnectionRouteMode = "direct" | "gateway"
export type ConnectionGatewayProvider = "official" | "custom"
export type LegacyGatewayMode = "direct" | "relay"

export interface ConnectionTargetProfile {
  targetAgent: ConnectionTargetAgent
  targetId?: string
  displayName?: string
  capabilities?: string[]
  protocolVersion?: string
}

export interface ConnectionRecordV2 {
  version: 2
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

export interface LegacyRouteCompatFields {
  mode: LegacyGatewayMode
  url: string
  relaySession?: RelaySessionInfo
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

  if (!accessToken && !refreshToken && !targetId) return null

  return {
    accessToken,
    ...(refreshToken ? { refreshToken } : {}),
    ...(targetId ? { targetId } : {}),
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
  const gatewaySession = normalizeRelaySessionInfo(input.gatewaySession ?? input.relaySession)
  const targetProfile = normalizePairTargetProfile(input.targetProfile)

  if (routeMode === "direct") {
    if (!directBaseUrl) return null
    return {
      version: 2,
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

export function migrateConnectionRecord(input: unknown): ConnectionRecordV2 | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>

  if (Number(raw.version) === 2 || raw.targetAgent || raw.routeMode) {
    return normalizeConnectionRecordV2({
      version: 2,
      ...raw,
    })
  }

  const mode = raw.mode === "relay" ? "relay" : raw.mode === "direct" ? "direct" : null
  const url = normalizeConnectionBaseUrl(pickString(raw.url))
  if (!mode || !url) return null

  if (mode === "direct") {
    return normalizeConnectionRecordV2({
      version: 2,
      name: raw.name,
      targetAgent: "codeg",
      routeMode: "direct",
      directBaseUrl: url,
      directToken: raw.directToken,
    })
  }

  return normalizeConnectionRecordV2({
    version: 2,
    name: raw.name,
    targetAgent: "codeg",
    routeMode: "gateway",
    gatewayProvider: "official",
    gatewayBaseUrl: url,
    pairCode: raw.pairCode,
    pairSecret: raw.pairSecret,
    gatewaySession: raw.relaySession,
  })
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

export function deriveLegacyRouteCompat(record: ConnectionRecordV2): LegacyRouteCompatFields {
  if (record.routeMode === "direct") {
    return {
      mode: "direct",
      url: normalizeConnectionBaseUrl(record.directBaseUrl || ""),
    }
  }

  return {
    mode: "relay",
    url: normalizeConnectionBaseUrl(record.gatewayBaseUrl || ""),
    ...(record.gatewaySession ? { relaySession: record.gatewaySession } : {}),
  }
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
