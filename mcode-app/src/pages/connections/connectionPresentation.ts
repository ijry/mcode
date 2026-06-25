import type { ConnectionRecordV2 } from "@/services/connectionSchema"

export function getConnectionTargetLabel(
  connection: Pick<ConnectionRecordV2, "targetAgent">
): string {
  if (connection.targetAgent === "opencode") return "OpenCode"
  if (connection.targetAgent === "mcode-desktop") return "MCode Desktop"
  return "Codeg"
}

export function getConnectionRouteLabel(
  connection: Pick<ConnectionRecordV2, "routeMode">
): string {
  return connection.routeMode === "gateway" ? "网关" : "直连"
}

export function getConnectionProviderLabel(
  connection: Partial<Pick<ConnectionRecordV2, "routeMode" | "gatewayProvider">>
): string {
  if (connection.routeMode === "direct") return ""
  if (connection.gatewayProvider === "custom") return "自定义网关"
  if (connection.routeMode === "gateway" || connection.gatewayProvider === "official" || !connection.routeMode) {
    return "MCode 官方网关"
  }
  return ""
}

export function getConnectionSubtitle(
  connection: Pick<
    ConnectionRecordV2,
    "targetAgent" | "routeMode" | "gatewayProvider" | "directBaseUrl" | "gatewayBaseUrl"
  >
): string {
  const parts = [getConnectionTargetLabel(connection), getConnectionRouteLabel(connection)]
  const provider = getConnectionProviderLabel(connection)
  const baseUrl = normalizeBaseUrl(
    connection.routeMode === "direct" ? connection.directBaseUrl || "" : connection.gatewayBaseUrl || ""
  )

  if (provider) parts.push(provider)
  if (baseUrl) parts.push(baseUrl)

  return parts.filter(Boolean).join(" · ")
}

export function getConnectionBadgeText(isOnline: boolean): string {
  return isOnline ? "CONNECTED" : "OFFLINE"
}

export function getConnectionCapabilityChips(
  connection: Pick<ConnectionRecordV2, "targetAgent" | "targetProfile">
): string[] {
  const capabilities = connection.targetProfile?.capabilities || []
  const labels = capabilities.flatMap((value) => {
    if (value === "desktop.runtime.codex-cli") return ["Codex CLI"]
    if (value === "desktop.runtime.claude-cli") return ["Claude CLI"]
    if (value === "desktop.tunnel.available") return ["内网穿透"]
    return []
  })
  return Array.from(new Set(labels))
}

function normalizeBaseUrl(url: string): string {
  return String(url || "").trim().replace(/\/+$/, "")
}
