import { buildRemoteInstanceKey } from "@/services/realtime/instance-key"
import type { RemoteInstanceDescriptor } from "@/services/realtime/types"
import { firstString } from "./detailDataNormalization"

export interface StoredConnectionItem {
  mode: "direct" | "relay"
  url: string
  directToken?: string
  pairCode?: string
  pairSecret?: string
  relaySession?: {
    accessToken?: string
    refreshToken?: string
    targetId?: string
  }
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
  const mode = raw.mode === "relay" ? "relay" : raw.mode === "direct" ? "direct" : null
  const url = normalizeConnectionUrl(String(raw.url || ""))
  if (!mode || !url) return null

  return {
    mode,
    url,
    directToken: firstString(raw.directToken) || undefined,
    pairCode: firstString(raw.pairCode) || undefined,
    pairSecret: firstString(raw.pairSecret) || undefined,
    relaySession: raw.relaySession && typeof raw.relaySession === "object"
      ? {
          accessToken: firstString(raw.relaySession.accessToken) || undefined,
          refreshToken: firstString(raw.relaySession.refreshToken) || undefined,
          targetId: firstString(raw.relaySession.targetId) || undefined,
        }
      : undefined,
  }
}

export function findStoredConnectionByKey(
  input: unknown,
  connKey: string
): StoredConnectionItem | null {
  if (!Array.isArray(input)) return null
  const targetKey = String(connKey || "")
  for (const item of input) {
    const connection = normalizeStoredConnectionLike(item)
    if (connection && buildConnectionKey(connection.mode, connection.url) === targetKey) {
      return connection
    }
  }
  return null
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
