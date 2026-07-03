import type { ConnectionRecordV2 } from "@/services/connectionSchema"
import { getConnectionEndpointLabel, maskSecretPresence } from "@/services/connectionDetail"
import {
  getConnectionProviderLabel,
  getConnectionRouteLabel,
  getConnectionTargetLabel,
} from "@/pages/connections/connectionPresentation"

export interface InfoRow {
  label: string
  value: string
}

export const DESKTOP_ACCENT_OPTIONS = [
  "neutral",
  "zinc",
  "slate",
  "stone",
  "gray",
  "red",
  "rose",
  "orange",
  "green",
  "blue",
  "yellow",
  "violet",
] as const

export function getAppearanceAccentOptions() {
  return DESKTOP_ACCENT_OPTIONS.map((value) => ({ value, label: value }))
}

export function buildSettingsRows() {
  return [
    {
      title: "个性化",
      rows: [
        { key: "appearance", label: "外观", value: "强调色" },
        { key: "language", label: "语言", value: "系统" },
        { key: "general", label: "通用", value: "委派 · 对话工具" },
        { key: "quickMessages", label: "快捷消息", value: "" },
      ],
    },
  ] as const
}

export function buildConnectionInfoRows(connection: ConnectionRecordV2): InfoRow[] {
  const target = connection.targetProfile || null
  const gatewaySession = connection.gatewaySession || null
  const capabilities = target?.capabilities || gatewaySession?.capabilities || []
  const rows: InfoRow[] = [
    { label: "连接 ID", value: connection.id || "未分配" },
    { label: "目标", value: getConnectionTargetLabel(connection) },
    { label: "路由", value: getConnectionRouteLabel(connection) },
    { label: "网关", value: getConnectionProviderLabel(connection) || "无" },
    { label: "地址", value: getConnectionEndpointLabel(connection) || "未配置" },
    { label: "目标名称", value: target?.displayName || gatewaySession?.displayName || "未返回" },
    { label: "目标 ID", value: target?.targetId || gatewaySession?.targetId || "未返回" },
    {
      label: "协议版本",
      value: target?.protocolVersion || gatewaySession?.protocolVersion || "未返回",
    },
    { label: "能力", value: capabilities.join(" · ") || "未返回" },
  ]

  if (connection.routeMode === "direct") {
    rows.push({ label: "直连 Token", value: maskSecretPresence(connection.directToken) })
  } else {
    rows.push({ label: "配对码", value: maskSecretPresence(connection.pairCode) })
    rows.push({ label: "配对密钥", value: maskSecretPresence(connection.pairSecret) })
    rows.push({ label: "访问令牌", value: maskSecretPresence(gatewaySession?.accessToken) })
    rows.push({ label: "刷新令牌", value: maskSecretPresence(gatewaySession?.refreshToken) })
  }

  return rows
}
