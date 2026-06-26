import type { RelayConfig } from "../config.js"
import type { RelayAppContext } from "../server.js"

export const PROTOCOL_VERSION = "1"

export const GATEWAY_FEATURES = [
  "pairing",
  "session.refresh",
  "proxy",
  "events.replay",
  "desktop.upstream",
  "tunnel.http",
]

const DEFAULT_VERSION = "0.0.0-dev"

export interface GatewaySecurityStatus {
  jwtSecretConfigured: boolean
  publicBaseUrlConfigured: boolean
  devSecretsAllowed: boolean
  productionReady: boolean
  warnings: string[]
}

export interface GatewayStats {
  targets: number
  sessions: number
  desktopsOnline: number
}

export interface GatewayHealthResponse {
  status: "ok"
  name: string
  provider: RelayConfig["GATEWAY_PROVIDER"]
  baseUrl: string | null
  version: string
  protocolVersion: string
  environment: RelayConfig["DEPLOYMENT_ENV"]
  security: GatewaySecurityStatus
  stats: GatewayStats
}

export interface GatewayInfoResponse {
  name: string
  provider: RelayConfig["GATEWAY_PROVIDER"]
  baseUrl: string | null
  version: string
  protocolVersion: string
  features: string[]
  deployment: {
    environment: RelayConfig["DEPLOYMENT_ENV"]
    logPolicy: string
    auditPolicy: string
  }
  security: GatewaySecurityStatus
}

export function buildGatewayHealth(context: RelayAppContext): GatewayHealthResponse {
  const config = context.config
  return {
    status: "ok",
    name: config.GATEWAY_NAME,
    provider: config.GATEWAY_PROVIDER,
    baseUrl: normalizedPublicBaseUrl(config),
    version: relayVersion(),
    protocolVersion: PROTOCOL_VERSION,
    environment: config.DEPLOYMENT_ENV,
    security: buildGatewaySecurity(config),
    stats: buildGatewayStats(context),
  }
}

export function buildGatewayInfo(context: RelayAppContext): GatewayInfoResponse {
  const config = context.config
  return {
    name: config.GATEWAY_NAME,
    provider: config.GATEWAY_PROVIDER,
    baseUrl: normalizedPublicBaseUrl(config),
    version: relayVersion(),
    protocolVersion: PROTOCOL_VERSION,
    features: [...GATEWAY_FEATURES],
    deployment: {
      environment: config.DEPLOYMENT_ENV,
      logPolicy: config.LOG_POLICY,
      auditPolicy: config.AUDIT_POLICY,
    },
    security: buildGatewaySecurity(config),
  }
}

export function buildGatewaySecurity(config: RelayConfig): GatewaySecurityStatus {
  const jwtSecretConfigured = config.JWT_SECRET.trim() !== "" && config.JWT_SECRET !== "dev-secret"
  const publicBaseUrlConfigured = config.PUBLIC_BASE_URL.trim() !== ""
  const devSecretsAllowed = config.ALLOW_DEV_SECRETS
  const warnings: string[] = []

  if (!jwtSecretConfigured) warnings.push("JWT_SECRET uses the development default")
  if (!publicBaseUrlConfigured) warnings.push("PUBLIC_BASE_URL is not configured")
  if (devSecretsAllowed) warnings.push("development secrets are allowed")

  const productionReady =
    config.DEPLOYMENT_ENV === "production"
      ? jwtSecretConfigured && publicBaseUrlConfigured && !devSecretsAllowed
      : warnings.length === 0

  return {
    jwtSecretConfigured,
    publicBaseUrlConfigured,
    devSecretsAllowed,
    productionReady,
    warnings,
  }
}

function buildGatewayStats(context: RelayAppContext): GatewayStats {
  const targets = context.store.listTargets()
  return {
    targets: targets.length,
    sessions: context.store.listSessions().filter((session) => session.revokedAt === null).length,
    desktopsOnline: targets.filter((target) => context.hub.isDesktopOnline(target.targetId)).length,
  }
}

function normalizedPublicBaseUrl(config: RelayConfig): string | null {
  const value = config.PUBLIC_BASE_URL.trim()
  return value ? value : null
}

function relayVersion(): string {
  return process.env.npm_package_version || process.env.MCODE_RELAY_VERSION || DEFAULT_VERSION
}
