import type { RelaySessionInfo } from "@/services/gateway"
import {
  deriveLegacyRouteCompat,
  migrateConnectionRecord,
  normalizeConnectionRecordV2,
  normalizeRelaySessionInfo,
  normalizeV2ConfigCodePayload,
  type ConnectionGatewayProvider,
  type ConnectionRecordV2,
  type ConnectionRouteMode,
  type ConnectionTargetAgent,
  type ConnectionTargetProfile,
} from "@/services/connectionSchema"

export type ConfigCodeConnectionMode = "direct" | "relay"

export interface LegacyConfigCodeConnection {
  name: string
  mode: ConfigCodeConnectionMode
  url: string
  directToken?: string
  pairCode?: string
  pairSecret?: string
  relaySession?: RelaySessionInfo
}

export type ConfigCodeConnection = ConnectionRecordV2 | LegacyConfigCodeConnection
export type ParsedConfigCodeConnection = ConnectionRecordV2 & ReturnType<typeof deriveLegacyRouteCompat>

export interface ConfigCodePayload {
  version: 1
  name: string
  mode: ConfigCodeConnectionMode
  directBaseUrl?: string
  directToken?: string
  relayUrl?: string
  pairCode?: string
  pairSecret?: string
  relaySession?: {
    accessToken: string
    refreshToken?: string
    targetId?: string
  }
}

export interface ConfigCodePayloadV2 {
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
  gatewaySession?: RelaySessionInfo
  targetProfile?: ConnectionTargetProfile
}

export function buildConnectionConfigCode(connection: ConfigCodeConnection): string {
  return encodeBase64Url(JSON.stringify(buildConnectionConfigPayload(connection)))
}

export function decodeConnectionConfigCode(code: string): ConfigCodePayload | ConfigCodePayloadV2 {
  return JSON.parse(decodeBase64Url(code)) as ConfigCodePayload | ConfigCodePayloadV2
}

export function parseConnectionConfigCodeToConnection(code: string): ParsedConfigCodeConnection {
  const payload = decodeConnectionConfigCode(code)
  const version = Number((payload as { version?: number }).version || 1)
  const record =
    version === 2
      ? normalizeV2ConfigCodePayload(payload as unknown as Record<string, unknown>)
      : migrateConnectionRecord(projectConfigCodePayloadToLegacyConnection(payload as ConfigCodePayload))

  if (!record) {
    throw new Error("不支持的配置码内容")
  }
  assertConfigCodeCredentials(record)
  return {
    ...record,
    ...deriveLegacyRouteCompat(record),
  }
}

function buildConnectionConfigPayload(connection: ConfigCodeConnection): ConfigCodePayloadV2 {
  const normalized = normalizeConfigCodeConnection(connection)
  if (!normalized) {
    throw new Error("不支持的连接配置")
  }

  const gatewaySession = normalizeRelaySession(normalized.gatewaySession || undefined)

  if (normalized.routeMode === "direct") {
    if (!normalized.directBaseUrl) throw new Error("直连配置缺少地址")
    if (!normalized.directToken) throw new Error("直连配置缺少 token")
  } else {
    if (!normalized.gatewayBaseUrl && normalized.gatewayProvider === "custom") {
      throw new Error("网关配置缺少地址")
    }
    if (!gatewaySession && !(normalized.pairCode && normalized.pairSecret)) {
      throw new Error("网关配置缺少会话或配对信息")
    }
  }

  return {
    version: 2,
    name: normalized.name,
    targetAgent: normalized.targetAgent,
    routeMode: normalized.routeMode,
    ...(normalized.directBaseUrl ? { directBaseUrl: normalized.directBaseUrl } : {}),
    ...(normalized.directToken ? { directToken: normalized.directToken } : {}),
    ...(normalized.gatewayProvider ? { gatewayProvider: normalized.gatewayProvider } : {}),
    ...(normalized.gatewayBaseUrl ? { gatewayBaseUrl: normalized.gatewayBaseUrl } : {}),
    ...(normalized.pairCode ? { pairCode: normalized.pairCode } : {}),
    ...(normalized.pairSecret ? { pairSecret: normalized.pairSecret } : {}),
    ...(gatewaySession ? { gatewaySession } : {}),
    ...(normalized.targetProfile ? { targetProfile: normalized.targetProfile } : {}),
  }
}

function normalizeRelaySession(session: RelaySessionInfo | undefined): ConfigCodePayload["relaySession"] {
  const accessToken = session?.accessToken?.trim() || ""
  if (!accessToken) return undefined
  return {
    accessToken,
    ...(session?.refreshToken?.trim() ? { refreshToken: session.refreshToken.trim() } : {}),
    ...(session?.targetId?.trim() ? { targetId: session.targetId.trim() } : {}),
  }
}

function normalizeUrl(value: string): string {
  return String(value || "").trim().replace(/\/+$/, "")
}

function projectConfigCodePayloadToLegacyConnection(payload: ConfigCodePayload): LegacyConfigCodeConnection {
  if (payload.version !== 1) throw new Error("不支持的配置码版本")

  const name = String(payload.name || "").trim() || "MCode"

  if (payload.mode === "direct") {
    const url = normalizeUrl(payload.directBaseUrl || "")
    const directToken = String(payload.directToken || "").trim()
    if (!url) throw new Error("配置码缺少直连地址")
    if (!directToken) throw new Error("配置码缺少直连 token")
    return {
      name,
      mode: "direct",
      url,
      directToken,
    }
  }

  if (payload.mode === "relay") {
    const url = normalizeUrl(payload.relayUrl || "")
    const pairCode = String(payload.pairCode || "").trim()
    const pairSecret = String(payload.pairSecret || "").trim()
    const relaySession = normalizeImportedRelaySession(payload.relaySession)
    if (!url) throw new Error("配置码缺少网关地址")
    if (!relaySession && (!pairCode || !pairSecret)) {
      throw new Error("配置码缺少网关凭据")
    }
    return {
      name,
      mode: "relay",
      url,
      ...(pairCode ? { pairCode } : {}),
      ...(pairSecret ? { pairSecret } : {}),
      ...(relaySession ? { relaySession } : {}),
    }
  }

  throw new Error("不支持的连接模式")
}

function normalizeImportedRelaySession(
  session: ConfigCodePayload["relaySession"] | undefined
): RelaySessionInfo | undefined {
  return normalizeRelaySessionInfo(session) || undefined
}

function encodeBase64Url(text: string): string {
  const base64 = encodeBase64Utf8(text)
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function decodeBase64Url(code: string): string {
  const normalized = code.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
  return decodeBase64Utf8(padded)
}

function encodeBase64Utf8(text: string): string {
  const bufferCtor = getBufferCtor()
  if (bufferCtor) {
    return bufferCtor.from(text, "utf8").toString("base64")
  }
  return btoa(unescape(encodeURIComponent(text)))
}

function decodeBase64Utf8(base64: string): string {
  const bufferCtor = getBufferCtor()
  if (bufferCtor) {
    return bufferCtor.from(base64, "base64").toString("utf8")
  }
  return decodeURIComponent(escape(atob(base64)))
}

function getBufferCtor():
  | {
      from(value: string, encoding: "utf8" | "base64"): { toString(encoding: "base64" | "utf8"): string }
    }
  | undefined {
  const maybeBuffer = (globalThis as { Buffer?: unknown }).Buffer
  if (!maybeBuffer || typeof maybeBuffer !== "function" || !("from" in maybeBuffer)) return undefined
  return maybeBuffer as unknown as {
    from(value: string, encoding: "utf8" | "base64"): { toString(encoding: "base64" | "utf8"): string }
  }
}

function normalizeConfigCodeConnection(connection: ConfigCodeConnection): ConnectionRecordV2 | null {
  if (!connection || typeof connection !== "object") return null
  const raw = connection as unknown as Record<string, unknown>

  const v2 = normalizeConnectionRecordV2({
    version: 2,
    ...raw,
    gatewaySession: raw.gatewaySession ?? raw.relaySession,
  })
  if (v2) return v2

  return migrateConnectionRecord({
    name: raw.name,
    mode: raw.mode,
    url: raw.url,
    directToken: raw.directToken,
    pairCode: raw.pairCode,
    pairSecret: raw.pairSecret,
    relaySession: raw.relaySession,
  })
}

function assertConfigCodeCredentials(record: ConnectionRecordV2) {
  if (record.routeMode === "direct") {
    if (!record.directBaseUrl) throw new Error("配置码缺少直连地址")
    if (!record.directToken) throw new Error("配置码缺少直连 token")
    return
  }

  if (record.gatewaySession?.accessToken) return
  if (record.pairCode && record.pairSecret) return
  throw new Error("配置码缺少网关凭据")
}
