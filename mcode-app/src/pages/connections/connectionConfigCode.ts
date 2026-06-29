import type { RelaySessionInfo } from "@/services/gateway"
import {
  normalizeConnectionRecordV2,
  normalizeV2ConfigCodePayload,
  type ConnectionGatewayProvider,
  type ConnectionRecordV2,
  type ConnectionRouteMode,
  type ConnectionTargetAgent,
  type ConnectionTargetProfile,
} from "@/services/connectionSchema"

export type ConfigCodeConnection = ConnectionRecordV2
export type ParsedConfigCodeConnection = ConnectionRecordV2

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

export function decodeConnectionConfigCode(code: string): ConfigCodePayloadV2 {
  return JSON.parse(decodeBase64Url(code)) as ConfigCodePayloadV2
}

export function parseConnectionConfigCodeToConnection(code: string): ParsedConfigCodeConnection {
  const payload = decodeConnectionConfigCode(code)
  const record = normalizeV2ConfigCodePayload(payload as unknown as Record<string, unknown>)
  assertConfigCodeCredentials(record)
  return record
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

function normalizeRelaySession(session: RelaySessionInfo | undefined): ConfigCodePayloadV2["gatewaySession"] {
  const accessToken = session?.accessToken?.trim() || ""
  if (!accessToken) return undefined
  return {
    accessToken,
    ...(session?.refreshToken?.trim() ? { refreshToken: session.refreshToken.trim() } : {}),
    ...(session?.targetId?.trim() ? { targetId: session.targetId.trim() } : {}),
  }
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
  return normalizeConnectionRecordV2({
    version: 2,
    ...(connection as unknown as Record<string, unknown>),
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
