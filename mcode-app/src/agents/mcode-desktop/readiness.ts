import type { ConnectionRecordV2 } from "@/services/connectionSchema"
import {
  DESKTOP_CAPABILITY_CLAUDE,
  DESKTOP_CAPABILITY_CODEX,
  DESKTOP_CAPABILITY_TUNNEL,
  diagnoseDesktopGatewayConnection,
  getDesktopCapabilityLabels,
  type DesktopGatewayDiagnostic,
} from "./capabilities"
import type { DesktopDiscoveredServiceEntry } from "./serviceDiscovery"

export type DesktopReadinessLevel = "ready" | "warning" | "error"

export interface DesktopReadinessCapability {
  id: string
  label: string
  available: boolean
}

export interface DesktopReadinessSummary {
  level: DesktopReadinessLevel
  title: string
  description: string
  displayName: string
  gatewayBaseUrl: string
  targetId: string
  protocolVersion: string
  capabilities: DesktopReadinessCapability[]
  capabilityLabels: string[]
  diagnostics: DesktopGatewayDiagnostic[]
  serviceCounts: {
    total: number
    enabled: number
    http: number
    tcp: number
  }
}

export function buildDesktopReadinessSummary(
  connection: Pick<
    ConnectionRecordV2,
    "name" | "targetAgent" | "routeMode" | "gatewayBaseUrl" | "gatewaySession" | "targetProfile"
  > | null,
  services: DesktopDiscoveredServiceEntry[] = []
): DesktopReadinessSummary {
  if (!connection || connection.targetAgent !== "mcode-desktop") {
    return {
      level: "error",
      title: "未连接 MCode Desktop",
      description: "请先添加并配对 MCode Desktop 网关连接。",
      displayName: "",
      gatewayBaseUrl: "",
      targetId: "",
      protocolVersion: "",
      capabilities: buildCapabilityRows([]),
      capabilityLabels: [],
      diagnostics: [
        {
          code: "desktop.connection.missing",
          level: "error",
          message: "没有找到已配对的 MCode Desktop 网关连接。",
        },
      ],
      serviceCounts: countServices(services),
    }
  }

  const diagnostics = diagnoseDesktopGatewayConnection(connection)
  const hasError = diagnostics.some((item) => item.level === "error")
  const hasWarning = diagnostics.some((item) => item.level === "warning")
  const level: DesktopReadinessLevel = hasError ? "error" : hasWarning ? "warning" : "ready"
  const targetId = firstString(
    connection.gatewaySession?.targetId,
    connection.targetProfile?.targetId
  )
  const capabilities = connection.targetProfile?.capabilities || connection.gatewaySession?.capabilities || []

  return {
    level,
    title:
      level === "ready"
        ? "Desktop 网关已就绪"
        : level === "warning"
          ? "Desktop 网关需要确认"
          : "Desktop 网关不可用",
    description:
      level === "ready"
        ? "移动端可以访问 Desktop 发布的官方 CLI 与本机服务能力。"
        : "根据下方诊断处理后再使用官方 CLI 或内网穿透能力。",
    displayName: firstString(
      connection.gatewaySession?.displayName,
      connection.targetProfile?.displayName,
      connection.name
    ),
    gatewayBaseUrl: String(connection.gatewayBaseUrl || "").trim(),
    targetId,
    protocolVersion: firstString(
      connection.gatewaySession?.protocolVersion,
      connection.targetProfile?.protocolVersion
    ),
    capabilities: buildCapabilityRows(capabilities),
    capabilityLabels: getDesktopCapabilityLabels(capabilities),
    diagnostics,
    serviceCounts: countServices(services),
  }
}

export function buildDesktopReadinessDiagnosticText(summary: DesktopReadinessSummary): string {
  const diagnostics = summary.diagnostics.length
    ? summary.diagnostics.map((item) => `${item.level.toUpperCase()} ${item.code}: ${item.message}`)
    : ["OK desktop.ready: Desktop gateway is ready."]

  return [
    "MCode Desktop readiness",
    `level: ${summary.level}`,
    `displayName: ${summary.displayName || "-"}`,
    `gatewayBaseUrl: ${summary.gatewayBaseUrl || "-"}`,
    `targetId: ${summary.targetId || "-"}`,
    `protocolVersion: ${summary.protocolVersion || "-"}`,
    `capabilities: ${summary.capabilityLabels.join(", ") || "-"}`,
    `services: total=${summary.serviceCounts.total}, enabled=${summary.serviceCounts.enabled}, http=${summary.serviceCounts.http}, tcp=${summary.serviceCounts.tcp}`,
    "diagnostics:",
    ...diagnostics,
  ].join("\n")
}

function buildCapabilityRows(capabilities: string[]): DesktopReadinessCapability[] {
  const set = new Set(capabilities || [])
  return [
    {
      id: DESKTOP_CAPABILITY_CODEX,
      label: "Codex CLI",
      available: set.has(DESKTOP_CAPABILITY_CODEX),
    },
    {
      id: DESKTOP_CAPABILITY_CLAUDE,
      label: "Claude CLI",
      available: set.has(DESKTOP_CAPABILITY_CLAUDE),
    },
    {
      id: DESKTOP_CAPABILITY_TUNNEL,
      label: "内网穿透",
      available: set.has(DESKTOP_CAPABILITY_TUNNEL),
    },
  ]
}

function countServices(services: DesktopDiscoveredServiceEntry[]) {
  return {
    total: services.length,
    enabled: services.filter((service) => service.enabled).length,
    http: services.filter((service) => service.protocol === "http").length,
    tcp: services.filter((service) => service.protocol === "tcp").length,
  }
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value || "").trim()
    if (text) return text
  }
  return ""
}
