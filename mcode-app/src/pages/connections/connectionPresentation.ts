import type { ConnectionRecordV2 } from "@/services/connectionSchema"
import {
  getConnectionHostModel,
  type ConnectionHostKind,
} from "@/services/connectionHostCatalog"
import { getDesktopCapabilityLabels } from "@/agents/mcode-desktop/capabilities"

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

export interface ConnectionHostPresentation {
  id: string
  brand: string
  model: string
  displayName: string
  kind: ConnectionHostKind
  kindLabel: string
  image: string
  logo?: string
}

export function getConnectionHostPresentation(
  connection: Partial<Pick<ConnectionRecordV2, "hostModelId">>
): ConnectionHostPresentation {
  const model = getConnectionHostModel(connection.hostModelId)
  return {
    id: model.id,
    brand: model.brand,
    model: model.model,
    displayName: model.displayName,
    kind: model.kind,
    kindLabel: getConnectionHostKindLabel(model.kind),
    image: model.image,
    ...(model.logo ? { logo: model.logo } : {}),
  }
}

export function getConnectionHostKindLabel(kind: ConnectionHostKind): string {
  if (kind === "laptop") return "笔记本"
  if (kind === "desktop") return "台式机"
  if (kind === "mini-pc") return "Mini PC"
  if (kind === "cloud-server") return "云服务器"
  return "电脑"
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
  if (connection.targetAgent === "mcode-desktop") {
    return getDesktopCapabilityLabels(capabilities)
  }
  const labels = capabilities.flatMap((value) => {
    return []
  })
  return Array.from(new Set(labels))
}

function normalizeBaseUrl(url: string): string {
  return String(url || "").trim().replace(/\/+$/, "")
}
