import type { ConnectionRecordV2 } from "@/services/connectionSchema"

export const DESKTOP_CAPABILITY_CODEX = "desktop.runtime.codex-cli"
export const DESKTOP_CAPABILITY_CLAUDE = "desktop.runtime.claude-cli"
export const DESKTOP_CAPABILITY_TUNNEL = "desktop.tunnel.available"

export type DesktopTunnelProtocol = "http" | "tcp"

export interface DesktopServiceEntry {
  label: string
  protocol: DesktopTunnelProtocol
  url: string
  enabled: boolean
  reason?: string
}

export interface DesktopGatewayDiagnostic {
  code: string
  level: "ok" | "warning" | "error"
  message: string
}

export function getDesktopCapabilityLabels(capabilities: string[] = []): string[] {
  const labels = capabilities.flatMap((value) => {
    if (value === DESKTOP_CAPABILITY_CODEX) return ["Codex CLI"]
    if (value === DESKTOP_CAPABILITY_CLAUDE) return ["Claude CLI"]
    if (value === DESKTOP_CAPABILITY_TUNNEL) return ["内网穿透"]
    return []
  })
  return Array.from(new Set(labels))
}

export function hasDesktopCapability(
  connection: Pick<ConnectionRecordV2, "targetAgent" | "targetProfile">,
  capability: string
): boolean {
  if (connection.targetAgent !== "mcode-desktop") return false
  return Boolean(connection.targetProfile?.capabilities?.includes(capability))
}

export function diagnoseDesktopGatewayConnection(
  connection: Pick<
    ConnectionRecordV2,
    "targetAgent" | "routeMode" | "gatewayBaseUrl" | "gatewaySession" | "targetProfile"
  >
): DesktopGatewayDiagnostic[] {
  if (connection.targetAgent !== "mcode-desktop") return []

  const diagnostics: DesktopGatewayDiagnostic[] = []
  if (connection.routeMode !== "gateway") {
    diagnostics.push({
      code: "desktop.route.direct",
      level: "warning",
      message: "MCode Desktop 官方 CLI 与内网穿透能力通常需要网关连接。",
    })
  }
  if (connection.routeMode === "gateway" && !String(connection.gatewayBaseUrl || "").trim()) {
    diagnostics.push({
      code: "desktop.gateway.missing_base_url",
      level: "error",
      message: "网关地址缺失，无法刷新 desktop session。",
    })
  }
  if (connection.routeMode === "gateway" && !connection.gatewaySession?.accessToken) {
    diagnostics.push({
      code: "desktop.gateway.unpaired",
      level: "warning",
      message: "尚未完成配对，移动端不能访问 desktop 服务。",
    })
  }
  if (!connection.targetProfile?.capabilities?.length) {
    diagnostics.push({
      code: "desktop.capabilities.missing",
      level: "warning",
      message: "尚未获取 desktop 能力列表，部分入口会先隐藏。",
    })
  }

  return diagnostics
}

export function buildDesktopTunnelEntry(input: {
  connection: Pick<
    ConnectionRecordV2,
    "targetAgent" | "routeMode" | "gatewayBaseUrl" | "gatewaySession" | "targetProfile"
  >
  label?: string
  port: number
  protocol?: DesktopTunnelProtocol
  path?: string
}): DesktopServiceEntry {
  const protocol = input.protocol || "http"
  const label = input.label || `${protocol.toUpperCase()} ${input.port}`
  const baseUrl = String(input.connection.gatewayBaseUrl || "").replace(/\/+$/, "")
  const targetId =
    input.connection.gatewaySession?.targetId || input.connection.targetProfile?.targetId || ""
  const hasTunnel = hasDesktopCapability(input.connection, DESKTOP_CAPABILITY_TUNNEL)
  const portValid = Number.isInteger(input.port) && input.port > 0 && input.port <= 65535

  if (input.connection.targetAgent !== "mcode-desktop") {
    return disabledEntry(label, protocol, "当前连接不是 MCode Desktop。")
  }
  if (input.connection.routeMode !== "gateway") {
    return disabledEntry(label, protocol, "本机服务入口需要网关连接。")
  }
  if (!baseUrl || !targetId) {
    return disabledEntry(label, protocol, "缺少网关地址或 target id。")
  }
  if (!hasTunnel) {
    return disabledEntry(label, protocol, "desktop 未发布内网穿透能力。")
  }
  if (!portValid) {
    return disabledEntry(label, protocol, "端口无效。")
  }

  const path = normalizeTunnelPath(input.path || "/")
  const route =
    protocol === "tcp"
      ? `/v1/tunnel-tcp/${encodeURIComponent(targetId)}/${input.port}`
      : `/v1/tunnel/${encodeURIComponent(targetId)}/${input.port}${path}`

  return {
    label,
    protocol,
    enabled: true,
    url: `${baseUrl}${route}`,
  }
}

function disabledEntry(
  label: string,
  protocol: DesktopTunnelProtocol,
  reason: string
): DesktopServiceEntry {
  return {
    label,
    protocol,
    enabled: false,
    url: "",
    reason,
  }
}

function normalizeTunnelPath(path: string): string {
  const value = String(path || "/").trim()
  if (!value || value === "/") return "/"
  return value.startsWith("/") ? value : `/${value}`
}
