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

interface ConfigCodePayload {
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
  if (typeof Buffer !== "undefined") {
    return Buffer.from(text, "utf8").toString("base64")
  }
  return btoa(unescape(encodeURIComponent(text)))
}

function decodeBase64Utf8(base64: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(base64, "base64").toString("utf8")
  }
  return decodeURIComponent(escape(atob(base64)))
}
