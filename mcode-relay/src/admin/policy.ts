import type { FastifyRequest } from "fastify"
import type { RelayConfig } from "../config.js"
import type { AdminCredentialStore } from "./credentials.js"

export type AdminRole = "owner" | "admin" | "auditor"

export interface AdminPrincipal {
  token: string
  role: AdminRole
  tenantId: string | null
}

export interface AdminPolicySnapshot {
  mode: "token-role"
  warnings: string[]
  principals: Map<string, AdminPrincipal>
}

export type AdminAction =
  | "tenant.read"
  | "tenant.write"
  | "device.read"
  | "device.write"
  | "session.read"
  | "session.write"
  | "audit.read"
  | "credential.read"
  | "credential.write"

interface AdminPolicyEntry {
  role: AdminRole
  tenantId: string | null
}

const ADMIN_ROLES = new Set<AdminRole>(["owner", "admin", "auditor"])

export function resolveAdminPrincipal(
  req: FastifyRequest,
  config: RelayConfig,
  adminCredentialStore?: AdminCredentialStore | null
): AdminPrincipal | null {
  const token = getAdminToken(req)
  if (!token) return null

  const dynamicCredential = adminCredentialStore?.resolveToken(token)
  if (dynamicCredential) {
    return {
      token,
      role: dynamicCredential.role,
      tenantId: dynamicCredential.tenantId,
    }
  }

  const snapshot = buildAdminPolicySnapshot(config)
  const principal = snapshot.principals.get(token)
  if (principal) return principal

  if (config.ADMIN_TOKEN.trim() && token === config.ADMIN_TOKEN.trim()) {
    return {
      token,
      role: "owner",
      tenantId: null,
    }
  }

  return null
}

export function buildAdminPolicySnapshot(config: RelayConfig): AdminPolicySnapshot {
  const principals = new Map<string, AdminPrincipal>()
  const warnings: string[] = []
  const parsed = parseAdminTokenRoles(config.ADMIN_TOKEN_ROLES)

  for (const [token, entry] of parsed.entries()) {
    principals.set(token, {
      token,
      role: entry.role,
      tenantId: entry.tenantId,
    })
  }

  const bootstrapToken = config.ADMIN_TOKEN.trim()
  if (bootstrapToken && !principals.has(bootstrapToken)) {
    principals.set(bootstrapToken, {
      token: bootstrapToken,
      role: "owner",
      tenantId: null,
    })
  }

  if (!config.ADMIN_TOKEN_ROLES.trim()) {
    warnings.push("ADMIN_TOKEN_ROLES is not configured; bootstrap token acts as owner")
  }

  return {
    mode: "token-role",
    warnings,
    principals,
  }
}

export function authorizeAdminRoute(
  principal: AdminPrincipal,
  action: AdminAction,
  tenantId?: string | null
): { allowed: boolean; reason?: string } {
  if (principal.role === "owner") {
    return { allowed: true }
  }

  if (action === "credential.read" || action === "credential.write") {
    return deny("credential management requires owner")
  }

  const scopeTenantId = normalizeScopeTenantId(tenantId)
  const principalTenantId = normalizeScopeTenantId(principal.tenantId)
  const hasTenantScope = principalTenantId !== null
  const matchesTenant = scopeTenantId !== null && principalTenantId !== null && scopeTenantId === principalTenantId

  if (principal.role === "auditor") {
    if (action.endsWith(".read")) {
      if (!hasTenantScope) return deny("auditor requires a tenant scope")
      return matchesTenant || scopeTenantId === null
        ? { allowed: true }
        : deny("auditor cannot access other tenants")
    }
    return deny("auditor is read-only")
  }

  if (principal.role === "admin") {
    if (!hasTenantScope) return deny("admin requires a tenant scope")
    if (action === "tenant.read" || action === "audit.read" || action === "device.read" || action === "session.read") {
      return scopeTenantId === null || matchesTenant ? { allowed: true } : deny("admin cannot access other tenants")
    }
    if (action === "tenant.write" || action === "device.write" || action === "session.write") {
      return matchesTenant || scopeTenantId === null
        ? { allowed: true }
        : deny("admin cannot mutate other tenants")
    }
  }

  return deny("forbidden")
}

export function resolveAdminScope(principal: AdminPrincipal, requestedTenantId?: string | null): string | null {
  const principalTenantId = normalizeScopeTenantId(principal.tenantId)
  const requested = normalizeScopeTenantId(requestedTenantId)
  if (principal.role === "owner") return requested
  return principalTenantId ?? requested
}

export function parseAdminTokenRoles(raw: string): Map<string, AdminPolicyEntry> {
  const value = raw.trim()
  if (!value) return new Map()

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error("ADMIN_TOKEN_ROLES must be valid JSON")
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("ADMIN_TOKEN_ROLES must be a JSON object")
  }

  const entries = new Map<string, AdminPolicyEntry>()
  for (const [token, item] of Object.entries(parsed as Record<string, unknown>)) {
    const normalizedToken = token.trim()
    if (!normalizedToken) throw new Error("ADMIN_TOKEN_ROLES contains an empty token")
    if (entries.has(normalizedToken)) throw new Error(`duplicate admin token policy for ${normalizedToken}`)
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`ADMIN_TOKEN_ROLES entry for ${normalizedToken} must be an object`)
    }

    const role = String((item as Record<string, unknown>).role || "").trim() as AdminRole
    if (!ADMIN_ROLES.has(role)) {
      throw new Error(`ADMIN_TOKEN_ROLES entry for ${normalizedToken} has invalid role`)
    }

    const tenantIdRaw = String((item as Record<string, unknown>).tenantId || "").trim()
    const tenantId = tenantIdRaw || null
    if (role !== "owner" && !tenantId) {
      throw new Error(`ADMIN_TOKEN_ROLES entry for ${normalizedToken} requires tenantId`)
    }

    entries.set(normalizedToken, { role, tenantId })
  }

  return entries
}

function getAdminToken(req: FastifyRequest): string | null {
  const header = req.headers["x-mcode-admin-token"]
  if (typeof header === "string" && header.trim()) return header.trim()
  const bearer = req.headers.authorization
  if (typeof bearer === "string" && bearer.startsWith("Bearer ")) {
    const token = bearer.slice("Bearer ".length).trim()
    return token || null
  }
  return null
}

function normalizeScopeTenantId(value?: string | null): string | null {
  const trimmed = String(value || "").trim()
  return trimmed || null
}

function deny(reason: string): { allowed: false; reason: string } {
  return { allowed: false, reason }
}
