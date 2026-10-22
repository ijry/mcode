import type { ConnectionRecordV2 } from "@/services/connectionSchema"
import {
  getConnectionHostModel,
  type ConnectionHostKind,
} from "@/services/connectionHostCatalog"
import { getDshCapabilityLabels } from "@/agents/dsh/capabilities"
import { getDesktopCapabilityLabels } from "@/agents/mcode-desktop/capabilities"

export function getConnectionTargetLabel(
  connection: Pick<ConnectionRecordV2, "targetAgent">
): string {
  if (connection.targetAgent === "opencode") return "OpenCode"
  if (connection.targetAgent === "mcode-desktop") return "MCode Desktop"
  if (connection.targetAgent === "dsh") return "DeepSeek Harness"
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

/**
 * 38×38 主机徽标里的短字（设计稿里的 `Mac` / `ECS` / `Win`）。
 *
 * 取值优先级是「品牌能认出来就用品牌，否则退回机型，再退回类别」：
 * 徽标只有 38px，4 个字符以上就要缩到 10px 才塞得下，那时文字已经不成形了。
 * 云服务器统一给 `云` 而不是各家缩写 —— 同一个用户在列表里放三台不同厂商的 ECS 时，
 * `ECS`/`EC2`/`CVM` 并排只会让人多读一遍，真正区分它们的是下面的主机名。
 */
export function getConnectionHostShortLabel(
  connection: Partial<Pick<ConnectionRecordV2, "hostModelId">>
): string {
  const host = getConnectionHostPresentation(connection)
  if (host.kind === "cloud-server") return "云"
  const candidates = [host.brand, host.model, host.kindLabel]
  for (const candidate of candidates) {
    const text = String(candidate || "").trim()
    if (!text) continue
    // 中文按 2 字截（38px 内 13px Bold 最多容 2 个汉字），拉丁按 4 字符截。
    return /^[\u4e00-\u9fa5]/.test(text) ? text.slice(0, 2) : text.slice(0, 4)
  }
  return "PC"
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
  if (connection.targetAgent === "dsh") {
    return getDshCapabilityLabels(capabilities)
  }
  const labels = capabilities.flatMap((value) => {
    return []
  })
  return Array.from(new Set(labels))
}

function normalizeBaseUrl(url: string): string {
  return String(url || "").trim().replace(/\/+$/, "")
}
