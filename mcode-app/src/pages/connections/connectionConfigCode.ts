import type { RelaySessionInfo } from "@/services/gateway"

export type ConfigCodeConnectionMode = "direct" | "relay"

export interface ConfigCodeConnection {
  name: string
  mode: ConfigCodeConnectionMode
  url: string
  directToken?: string
  pairCode?: string
  pairSecret?: string
  relaySession?: RelaySessionInfo
}

export interface ParsedConfigCodeConnection {
  name: string
  mode: ConfigCodeConnectionMode
  url: string
  directToken?: string
  pairCode?: string
  pairSecret?: string
  relaySession?: RelaySessionInfo
}

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

export function buildConnectionConfigCode(connection: ConfigCodeConnection): string {
  return encodeBase64Url(JSON.stringify(buildConnectionConfigPayload(connection)))
}

export function decodeConnectionConfigCode(code: string): ConfigCodePayload {
  return JSON.parse(decodeBase64Url(code)) as ConfigCodePayload
}

export function parseConnectionConfigCodeToConnection(code: string): ParsedConfigCodeConnection {
  return projectConfigCodePayloadToConnection(decodeConnectionConfigCode(code))
}

function buildConnectionConfigPayload(connection: ConfigCodeConnection): ConfigCodePayload {
  const name = connection.name.trim() || "MCode"
  const url = normalizeUrl(connection.url)

  if (connection.mode === "direct") {
    const token = connection.directToken?.trim() || ""
    if (!url) throw new Error("直连配置缺少地址")
    if (!token) throw new Error("直连配置缺少 token")
    return {
      version: 1,
      name,
      mode: "direct",
      directBaseUrl: url,
      directToken: token,
    }
  }

  const session = normalizeRelaySession(connection.relaySession)
  const pairCode = connection.pairCode?.trim() || ""
  const pairSecret = connection.pairSecret?.trim() || ""
  if (!url) throw new Error("中继配置缺少地址")
  if (!session && (!pairCode || !pairSecret)) {
    throw new Error("中继配置缺少会话或配对信息")
  }

  return {
    version: 1,
    name,
    mode: "relay",
    relayUrl: url,
    ...(pairCode ? { pairCode } : {}),
    ...(pairSecret ? { pairSecret } : {}),
    ...(session ? { relaySession: session } : {}),
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

function projectConfigCodePayloadToConnection(payload: ConfigCodePayload): ParsedConfigCodeConnection {
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
    if (!url) throw new Error("配置码缺少中继地址")
    if (!relaySession && (!pairCode || !pairSecret)) {
      throw new Error("配置码缺少中继凭据")
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
  const accessToken = String(session?.accessToken || "").trim()
  if (!accessToken) return undefined
  return {
    accessToken,
    ...(String(session?.refreshToken || "").trim()
      ? { refreshToken: String(session?.refreshToken || "").trim() }
      : {}),
    ...(String(session?.targetId || "").trim() ? { targetId: String(session?.targetId || "").trim() } : {}),
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
