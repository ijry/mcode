import { randomBytes, randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { sha256Hex } from "../auth/tokens.js"
import type { AdminRole } from "./policy.js"

export interface AdminCredentialRecord {
  credentialId: string
  tokenHash: string
  role: AdminRole
  tenantId: string | null
  label: string | null
  createdAt: number
  updatedAt: number
  lastUsedAt: number | null
  expiresAt: number | null
  revokedAt: number | null
  revokeReason: string | null
}

export interface SafeAdminCredentialRecord {
  credentialId: string
  role: AdminRole
  tenantId: string | null
  label: string | null
  createdAt: number
  updatedAt: number
  lastUsedAt: number | null
  expiresAt: number | null
  revokedAt: number | null
  revokeReason: string | null
}

export interface AdminCredentialStoreSnapshot {
  credentials: AdminCredentialRecord[]
}

export interface AdminCredentialStoreStorage {
  load(): AdminCredentialStoreSnapshot | null
  save(snapshot: AdminCredentialStoreSnapshot): void
}

export class JsonFileAdminCredentialStoreStorage implements AdminCredentialStoreStorage {
  constructor(private readonly filePath: string) {}

  load(): AdminCredentialStoreSnapshot | null {
    if (!this.filePath || !existsSync(this.filePath)) return null
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<AdminCredentialStoreSnapshot>
      return {
        credentials: Array.isArray(parsed.credentials) ? parsed.credentials : [],
      }
    } catch {
      return null
    }
  }

  save(snapshot: AdminCredentialStoreSnapshot): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(snapshot, null, 2), "utf8")
  }
}

export class AdminCredentialStore {
  private readonly credentials = new Map<string, AdminCredentialRecord>()

  constructor(private readonly storage?: AdminCredentialStoreStorage | null) {
    this.restore(storage?.load() ?? null)
  }

  createCredential(input: {
    role: AdminRole
    tenantId?: string | null
    label?: string | null
    expiresAt?: number | null
  }): { token: string; record: AdminCredentialRecord } {
    const role = normalizeRole(input.role)
    const tenantId = normalizeTenantScope(role, input.tenantId)
    const now = Date.now()
    const token = generateAdminToken()
    const record: AdminCredentialRecord = {
      credentialId: randomUUID(),
      tokenHash: sha256Hex(token),
      role,
      tenantId,
      label: normalizeOptionalString(input.label),
      createdAt: now,
      updatedAt: now,
      lastUsedAt: null,
      expiresAt: normalizeFutureTimestamp(input.expiresAt),
      revokedAt: null,
      revokeReason: null,
    }
    this.credentials.set(record.credentialId, record)
    this.persist()
    return { token, record }
  }

  resolveToken(token: string): AdminCredentialRecord | null {
    const tokenHash = sha256Hex(token)
    for (const record of this.credentials.values()) {
      if (record.tokenHash !== tokenHash || !isCredentialActive(record)) continue
      record.lastUsedAt = Date.now()
      record.updatedAt = record.lastUsedAt
      this.credentials.set(record.credentialId, record)
      this.persist()
      return record
    }
    return null
  }

  listCredentials(): AdminCredentialRecord[] {
    return [...this.credentials.values()].sort((a, b) => b.createdAt - a.createdAt)
  }

  revokeCredential(credentialId: string, reason?: string | null): AdminCredentialRecord | null {
    const record = this.credentials.get(String(credentialId || "").trim())
    if (!record) return null
    const now = Date.now()
    record.revokedAt = record.revokedAt ?? now
    record.updatedAt = now
    record.revokeReason = normalizeOptionalString(reason)
    this.credentials.set(record.credentialId, record)
    this.persist()
    return record
  }

  snapshot(): AdminCredentialStoreSnapshot {
    return {
      credentials: this.listCredentials(),
    }
  }

  private restore(snapshot: AdminCredentialStoreSnapshot | null): void {
    if (!snapshot) return
    for (const item of snapshot.credentials ?? []) {
      const record = normalizeCredentialRecord(item)
      if (record) this.credentials.set(record.credentialId, record)
    }
  }

  private persist(): void {
    this.storage?.save(this.snapshot())
  }
}

export function toSafeAdminCredentialRecord(record: AdminCredentialRecord): SafeAdminCredentialRecord {
  return {
    credentialId: record.credentialId,
    role: record.role,
    tenantId: record.tenantId,
    label: record.label,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastUsedAt: record.lastUsedAt,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
    revokeReason: record.revokeReason,
  }
}

export function getAdminCredentialStats(store: AdminCredentialStore): {
  total: number
  active: number
  revoked: number
} {
  const credentials = store.listCredentials()
  return {
    total: credentials.length,
    active: credentials.filter((credential) => isCredentialActive(credential)).length,
    revoked: credentials.filter((credential) => credential.revokedAt !== null).length,
  }
}

function generateAdminToken(): string {
  return `mca_${randomBytes(32).toString("base64url")}`
}

function normalizeRole(role: AdminRole): AdminRole {
  if (role === "owner" || role === "admin" || role === "auditor") return role
  throw new Error("invalid admin credential role")
}

function normalizeTenantScope(role: AdminRole, tenantId?: string | null): string | null {
  const normalized = normalizeOptionalString(tenantId)
  if (role === "owner") return null
  if (!normalized) throw new Error(`${role} credential requires tenantId`)
  return normalized
}

function normalizeCredentialRecord(input: Partial<AdminCredentialRecord>): AdminCredentialRecord | null {
  const credentialId = normalizeOptionalString(input.credentialId)
  const tokenHash = normalizeOptionalString(input.tokenHash)
  const role = input.role === "owner" || input.role === "admin" || input.role === "auditor" ? input.role : null
  if (!credentialId || !tokenHash || !role) return null
  return {
    credentialId,
    tokenHash,
    role,
    tenantId: role === "owner" ? null : normalizeOptionalString(input.tenantId),
    label: normalizeOptionalString(input.label),
    createdAt: normalizeNumber(input.createdAt, Date.now()),
    updatedAt: normalizeNumber(input.updatedAt, Date.now()),
    lastUsedAt: input.lastUsedAt == null ? null : normalizeNumber(input.lastUsedAt, Date.now()),
    expiresAt: input.expiresAt == null ? null : normalizeNumber(input.expiresAt, Date.now()),
    revokedAt: input.revokedAt == null ? null : normalizeNumber(input.revokedAt, Date.now()),
    revokeReason: normalizeOptionalString(input.revokeReason),
  }
}

function isCredentialActive(record: AdminCredentialRecord): boolean {
  if (record.revokedAt !== null) return false
  if (record.expiresAt !== null && record.expiresAt <= Date.now()) return false
  return true
}

function normalizeOptionalString(input?: string | null): string | null {
  const value = String(input || "").trim()
  return value || null
}

function normalizeFutureTimestamp(input: unknown): number | null {
  if (input === null || input === undefined || input === "") return null
  const value = Number(input)
  return Number.isFinite(value) && value > Date.now() ? Math.trunc(value) : null
}

function normalizeNumber(input: unknown, fallback: number): number {
  const value = Number(input)
  return Number.isFinite(value) ? value : fallback
}
