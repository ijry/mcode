import type { ConnectionRecordV2 } from "@/services/connectionSchema"
import {
  getConnectionRouteLabel,
  getConnectionTargetLabel,
} from "@/pages/connections/connectionPresentation"

export type ConnectionDetailTab = "folders" | "settings" | "info" | "config"

const TABS = new Set<ConnectionDetailTab>(["folders", "settings", "info", "config"])

export function normalizeConnectionDetailTab(value: unknown): ConnectionDetailTab {
  return typeof value === "string" && TABS.has(value as ConnectionDetailTab)
    ? (value as ConnectionDetailTab)
    : "folders"
}

export function buildConnectionDetailRoute(params: {
  connectionId: string
  tab?: ConnectionDetailTab
}) {
  const tab = normalizeConnectionDetailTab(params.tab || "folders")
  return `/pages/connection-detail/index?connectionId=${encodeURIComponent(
    params.connectionId
  )}&tab=${tab}`
}

export function getConnectionEndpointLabel(
  connection: Pick<
    ConnectionRecordV2,
    "routeMode" | "directBaseUrl" | "gatewayBaseUrl" | "gatewayProvider"
  >
) {
  if (connection.routeMode === "direct") return connection.directBaseUrl || ""
  return connection.gatewayBaseUrl || connection.gatewayProvider || "official"
}

export function getConnectionKindLabel(
  connection: Pick<ConnectionRecordV2, "targetAgent" | "routeMode">
) {
  return `${getConnectionTargetLabel(connection)} · ${getConnectionRouteLabel(connection)}`
}

export function maskSecretPresence(value: unknown) {
  return typeof value === "string" && value.trim() ? "已保存" : "未保存"
}
