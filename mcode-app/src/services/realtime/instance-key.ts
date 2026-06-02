import type { RemoteMode } from "./types"

function normalizeBaseUrl(baseUrl: string) {
  return String(baseUrl || "").trim().replace(/\/+$/, "")
}

function normalizePrincipal(principal: string) {
  return String(principal || "").trim() || "anonymous"
}

export function buildRemoteInstanceKey(input: {
  mode: RemoteMode
  baseUrl: string
  principal: string
}) {
  return [
    input.mode,
    normalizeBaseUrl(input.baseUrl),
    normalizePrincipal(input.principal),
  ].join("::")
}
