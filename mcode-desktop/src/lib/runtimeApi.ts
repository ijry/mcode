import { invoke } from "@tauri-apps/api/core"
import type { LocalServiceConfig } from "./localServices"

export type GatewayProvider = "official" | "custom"
export type UpstreamStatus = "offline" | "connecting" | "online" | "error"

export interface PairOffer {
  code: string
  secret: string
  qrPayload: string
}

export interface DiagnosticEntry {
  level: "info" | "error" | string
  message: string
  createdAtMs: number
}

export interface DesktopHealthSnapshot {
  targetAgent: "mcode-desktop"
  targetId: string
  displayName: string
  version: string
  upstreamStatus: UpstreamStatus
  upstreamError?: string | null
  gatewayProvider?: GatewayProvider | null
  gatewayBaseUrl?: string | null
  capabilities: string[]
  pairOffer?: PairOffer | null
  localServices: LocalServiceConfig[]
  diagnostics: DiagnosticEntry[]
}

export const OFFICIAL_GATEWAY_BASE_URL = normalizeGatewayBaseUrl(
  import.meta.env.VITE_MCODE_OFFICIAL_GATEWAY_BASE_URL || "http://127.0.0.1:8787"
)

export function normalizeGatewayBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "")
}

export function getDesktopHealth() {
  return invoke<DesktopHealthSnapshot>("desktop_get_health")
}

export function configureGateway(input: { provider: GatewayProvider; baseUrl: string }) {
  return invoke<DesktopHealthSnapshot>("desktop_configure_gateway", {
    provider: input.provider,
    baseUrl: normalizeGatewayBaseUrl(input.baseUrl),
  })
}

export function connectGatewayUpstream() {
  return invoke<DesktopHealthSnapshot>("desktop_connect_gateway")
}

export function generateDesktopPairOffer(input: {
  name: string
  provider: GatewayProvider
  baseUrl?: string
}) {
  return invoke<PairOffer>("desktop_generate_pair_offer", {
    name: input.name,
    provider: input.provider,
    baseUrl: input.baseUrl ? normalizeGatewayBaseUrl(input.baseUrl) : undefined,
  })
}

export function saveLocalService(config: LocalServiceConfig) {
  return invoke<LocalServiceConfig>("desktop_save_local_service", { config })
}
