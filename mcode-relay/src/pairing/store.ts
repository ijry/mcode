import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { sha256Hex } from "../auth/tokens.js"
import type { TargetAgent } from "../protocol/types.js"

const DEFAULT_TARGET_AGENT: TargetAgent = "codeg"
const DEFAULT_PROTOCOL_VERSION = "1"
const DEFAULT_TENANT_ID = "default"

export interface PairOfferRecord {
  code: string
  secretHash: string
  targetId: string
  tenantId: string
  targetName: string | null
  targetAgent: TargetAgent
  capabilities: string[]
  protocolVersion: string
  relayUrl: string | null
  expiresAt: number
  consumedAt: number | null
}

export interface TargetRecord {
  targetId: string
  tenantId: string
  targetName: string | null
  targetAgent: TargetAgent
  capabilities: string[]
  protocolVersion: string
  relayUrl: string | null
  pairedAt: number
  lastSeenAt: number | null
  preferredMode: "relay" | "direct"
  revoked: boolean
}

export interface PairSessionRecord {
  sessionId: string
  targetId: string
  tenantId: string
  deviceName: string | null
  deviceUserAgent: string | null
  createdAt: number
  updatedAt: number
  revokedAt: number | null
  revokeReason: string | null
}

export interface AuditEventRecord {
  eventId: string
  type: string
  tenantId: string
  targetId: string | null
  sessionId: string | null
  actor: string
  message: string | null
  createdAt: number
  metadata: Record<string, unknown>
}

export interface TenantRecord {
  tenantId: string
  tenantName: string | null
  createdAt: number
  updatedAt: number
}

export interface PairingStoreSnapshot {
  tenants: TenantRecord[]
  targets: TargetRecord[]
  sessions: PairSessionRecord[]
  auditEvents: AuditEventRecord[]
}

export interface PairingStoreStorage {
  load(): PairingStoreSnapshot | null
  save(snapshot: PairingStoreSnapshot): void
}

export class JsonFilePairingStoreStorage implements PairingStoreStorage {
  constructor(private readonly filePath: string) {}

  load(): PairingStoreSnapshot | null {
    if (!this.filePath || !existsSync(this.filePath)) return null
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<PairingStoreSnapshot>
      return {
        tenants: Array.isArray(parsed.tenants) ? parsed.tenants : [],
        targets: Array.isArray(parsed.targets) ? parsed.targets : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        auditEvents: Array.isArray(parsed.auditEvents) ? parsed.auditEvents : [],
      }
    } catch {
      return null
    }
  }

  save(snapshot: PairingStoreSnapshot): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(snapshot, null, 2), "utf8")
  }
}

export class PairingStore {
  private readonly tenants = new Map<string, TenantRecord>()
  private readonly offers = new Map<string, PairOfferRecord>()
  private readonly targets = new Map<string, TargetRecord>()
  private readonly sessions = new Map<string, PairSessionRecord>()
  private readonly auditEvents: AuditEventRecord[] = []

  constructor(private readonly storage?: PairingStoreStorage | null) {
    this.restore(storage?.load() ?? null)
    this.ensureDefaultTenant()
  }

  addOffer(input: {
    code: string
    secret: string
    targetId: string
    tenantId?: string
    targetName?: string | null
    targetAgent?: TargetAgent
    capabilities?: string[]
    protocolVersion?: string
    relayUrl?: string | null
    ttlSeconds: number
  }): PairOfferRecord {
    const now = Date.now()
    const offer: PairOfferRecord = {
      code: input.code,
      secretHash: sha256Hex(input.secret),
      targetId: input.targetId,
      tenantId: normalizeTenantId(input.tenantId),
      targetName: input.targetName ?? null,
      targetAgent: input.targetAgent ?? DEFAULT_TARGET_AGENT,
      capabilities: normalizeCapabilities(input.capabilities),
      protocolVersion: normalizeProtocolVersion(input.protocolVersion),
      relayUrl: input.relayUrl ?? null,
      expiresAt: now + input.ttlSeconds * 1000,
      consumedAt: null,
    }
    this.offers.set(input.code, offer)
    return offer
  }

  consumeOffer(code: string, secret: string): PairOfferRecord | null {
    const offer = this.offers.get(code)
    if (!offer) return null
    if (offer.consumedAt !== null) return null
    if (offer.expiresAt <= Date.now()) return null
    if (offer.secretHash !== sha256Hex(secret)) return null
    offer.consumedAt = Date.now()
    this.offers.set(code, offer)
    return offer
  }

  upsertTarget(input: {
    targetId: string
    tenantId?: string
    targetName?: string | null
    targetAgent?: TargetAgent
    capabilities?: string[]
    protocolVersion?: string
    relayUrl?: string | null
    preferredMode?: "relay" | "direct"
  }): TargetRecord {
    const existing = this.targets.get(input.targetId)
    const record: TargetRecord = {
      targetId: input.targetId,
      tenantId: normalizeTenantId(input.tenantId ?? existing?.tenantId),
      targetName: input.targetName ?? existing?.targetName ?? null,
      targetAgent: input.targetAgent ?? existing?.targetAgent ?? DEFAULT_TARGET_AGENT,
      capabilities: normalizeCapabilities(input.capabilities ?? existing?.capabilities),
      protocolVersion: normalizeProtocolVersion(input.protocolVersion ?? existing?.protocolVersion),
      relayUrl: input.relayUrl ?? existing?.relayUrl ?? null,
      pairedAt: existing?.pairedAt ?? Date.now(),
      lastSeenAt: existing?.lastSeenAt ?? null,
      preferredMode: input.preferredMode ?? existing?.preferredMode ?? "relay",
      revoked: existing?.revoked ?? false,
    }
    this.targets.set(record.targetId, record)
    this.ensureTenantRecord(record.tenantId)
    this.persist()
    return record
  }

  upsertTenant(input: { tenantId: string; tenantName?: string | null }): TenantRecord {
    const existing = this.tenants.get(input.tenantId)
    const now = Date.now()
    const record: TenantRecord = {
      tenantId: input.tenantId,
      tenantName: input.tenantName ?? existing?.tenantName ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    this.tenants.set(record.tenantId, record)
    this.persist()
    return record
  }

  getTenant(tenantId: string): TenantRecord | null {
    return this.tenants.get(tenantId) ?? null
  }

  listTenants(): TenantRecord[] {
    return [...this.tenants.values()]
  }

  assignTargetTenant(targetId: string, tenantId: string): TargetRecord | null {
    const target = this.targets.get(targetId)
    if (!target) return null
    target.tenantId = normalizeTenantId(tenantId)
    this.targets.set(targetId, target)
    this.ensureTenantRecord(target.tenantId)
    this.persist()
    return target
  }

  markTargetSeen(targetId: string): void {
    const target = this.targets.get(targetId)
    if (!target) return
    target.lastSeenAt = Date.now()
    this.targets.set(targetId, target)
    this.persist()
  }

  setPreferredMode(targetId: string, preferredMode: "relay" | "direct"): void {
    const target = this.targets.get(targetId)
    if (!target) return
    target.preferredMode = preferredMode
    this.targets.set(targetId, target)
    this.persist()
  }

  createSession(
    targetId: string,
    input: { deviceName?: string | null; deviceUserAgent?: string | null } = {}
  ): PairSessionRecord {
    const now = Date.now()
    const target = this.targets.get(targetId)
    const session: PairSessionRecord = {
      sessionId: randomUUID(),
      targetId,
      tenantId: normalizeTenantId(target?.tenantId),
      deviceName: normalizeOptionalString(input.deviceName),
      deviceUserAgent: normalizeOptionalString(input.deviceUserAgent),
      createdAt: now,
      updatedAt: now,
      revokedAt: null,
      revokeReason: null,
    }
    this.sessions.set(session.sessionId, session)
    this.ensureTenantRecord(session.tenantId)
    this.persist()
    return session
  }

  touchSession(sessionId: string): PairSessionRecord | null {
    const session = this.sessions.get(sessionId)
    if (!session || session.revokedAt !== null) return null
    session.updatedAt = Date.now()
    this.sessions.set(sessionId, session)
    this.persist()
    return session
  }

  revokeSession(sessionId: string, reason?: string | null): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false
    session.revokedAt = Date.now()
    session.revokeReason = normalizeOptionalString(reason)
    this.sessions.set(sessionId, session)
    this.persist()
    return true
  }

  revokeTarget(targetId: string, reason?: string | null): boolean {
    const target = this.targets.get(targetId)
    if (!target) return false
    target.revoked = true
    this.targets.set(targetId, target)
    for (const session of this.sessions.values()) {
      if (session.targetId === targetId && session.revokedAt === null) {
        session.revokedAt = Date.now()
        session.revokeReason = normalizeOptionalString(reason)
        this.sessions.set(session.sessionId, session)
      }
    }
    this.persist()
    return true
  }

  restoreTarget(targetId: string): boolean {
    const target = this.targets.get(targetId)
    if (!target) return false
    target.revoked = false
    this.targets.set(targetId, target)
    this.persist()
    return true
  }

  getSession(sessionId: string): PairSessionRecord | null {
    const session = this.sessions.get(sessionId)
    if (!session || session.revokedAt !== null) return null
    return session
  }

  getTarget(targetId: string): TargetRecord | null {
    return this.targets.get(targetId) ?? null
  }

  addAuditEvent(input: {
    type: string
    tenantId?: string | null
    targetId?: string | null
    sessionId?: string | null
    actor?: string | null
    message?: string | null
    metadata?: Record<string, unknown>
  }): AuditEventRecord {
    const tenantId = normalizeTenantId(
      input.tenantId ??
        this.targets.get(normalizeOptionalString(input.targetId) ?? "")?.tenantId ??
        this.sessions.get(normalizeOptionalString(input.sessionId) ?? "")?.tenantId
    )
    const record: AuditEventRecord = {
      eventId: randomUUID(),
      type: String(input.type || "unknown"),
      tenantId,
      targetId: normalizeOptionalString(input.targetId),
      sessionId: normalizeOptionalString(input.sessionId),
      actor: normalizeOptionalString(input.actor) ?? "system",
      message: normalizeOptionalString(input.message),
      createdAt: Date.now(),
      metadata: input.metadata ?? {},
    }
    this.auditEvents.push(record)
    if (this.auditEvents.length > 1000) {
      this.auditEvents.splice(0, this.auditEvents.length - 1000)
    }
    this.ensureTenantRecord(record.tenantId)
    this.persist()
    return record
  }

  listAuditEvents(limit = 100, tenantId?: string): AuditEventRecord[] {
    const bounded = Number.isFinite(limit) ? Math.max(1, Math.min(Math.trunc(limit), 500)) : 100
    const source = tenantId ? this.auditEvents.filter((event) => event.tenantId === tenantId) : this.auditEvents
    return source.slice(-bounded).reverse()
  }

  listTargets(tenantId?: string): TargetRecord[] {
    const source = tenantId ? [...this.targets.values()].filter((target) => target.tenantId === tenantId) : [...this.targets.values()]
    return source
  }

  listSessions(tenantId?: string): PairSessionRecord[] {
    const source = tenantId ? [...this.sessions.values()].filter((session) => session.tenantId === tenantId) : [...this.sessions.values()]
    return source
  }

  snapshot(): PairingStoreSnapshot {
    return {
      tenants: this.listTenants(),
      targets: this.listTargets(),
      sessions: this.listSessions(),
      auditEvents: [...this.auditEvents],
    }
  }

  private persist(): void {
    this.storage?.save(this.snapshot())
  }

  private restore(snapshot: PairingStoreSnapshot | null): void {
    if (!snapshot) return
    for (const tenant of snapshot.tenants ?? []) {
      const normalized = normalizeTenantRecord(tenant)
      if (normalized) this.tenants.set(normalized.tenantId, normalized)
    }
    for (const target of snapshot.targets ?? []) {
      const normalized = normalizeTargetRecord(target)
      if (normalized) {
        this.targets.set(normalized.targetId, normalized)
        this.ensureTenantRecord(normalized.tenantId)
      }
    }
    for (const session of snapshot.sessions ?? []) {
      const normalized = normalizeSessionRecord(session)
      if (normalized) {
        this.sessions.set(normalized.sessionId, normalized)
        this.ensureTenantRecord(normalized.tenantId)
      }
    }
    for (const event of snapshot.auditEvents ?? []) {
      const normalized = normalizeAuditEventRecord(event)
      if (normalized) {
        this.auditEvents.push(normalized)
        this.ensureTenantRecord(normalized.tenantId)
      }
    }
    if (this.auditEvents.length > 1000) {
      this.auditEvents.splice(0, this.auditEvents.length - 1000)
    }
  }

  private ensureDefaultTenant(): void {
    this.ensureTenantRecord(DEFAULT_TENANT_ID, null, false)
  }

  private ensureTenantRecord(
    tenantId: string,
    tenantName: string | null = null,
    markUpdated = true
  ): TenantRecord {
    const normalizedTenantId = normalizeTenantId(tenantId)
    const now = Date.now()
    const existing = this.tenants.get(normalizedTenantId)
    const record: TenantRecord = {
      tenantId: normalizedTenantId,
      tenantName: tenantName ?? existing?.tenantName ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: markUpdated ? now : existing?.updatedAt ?? now,
    }
    this.tenants.set(record.tenantId, record)
    return record
  }
}

function normalizeCapabilities(input?: string[]): string[] {
  if (!Array.isArray(input)) return []
  return Array.from(
    new Set(
      input
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  )
}

function normalizeProtocolVersion(input?: string): string {
  return String(input || "").trim() || DEFAULT_PROTOCOL_VERSION
}

function normalizeTenantId(input?: string | null): string {
  return normalizeOptionalString(input) ?? DEFAULT_TENANT_ID
}

function normalizeOptionalString(input?: string | null): string | null {
  const value = String(input || "").trim()
  return value || null
}

function normalizeTenantRecord(input: Partial<TenantRecord>): TenantRecord | null {
  const tenantId = normalizeOptionalString(input.tenantId)
  if (!tenantId) return null
  return {
    tenantId,
    tenantName: normalizeOptionalString(input.tenantName),
    createdAt: normalizeNumber(input.createdAt, Date.now()),
    updatedAt: normalizeNumber(input.updatedAt, Date.now()),
  }
}

function normalizeTargetRecord(input: Partial<TargetRecord>): TargetRecord | null {
  const targetId = normalizeOptionalString(input.targetId)
  if (!targetId) return null
  return {
    targetId,
    tenantId: normalizeTenantId(input.tenantId),
    targetName: normalizeOptionalString(input.targetName),
    targetAgent:
      input.targetAgent === "codeg" || input.targetAgent === "opencode" || input.targetAgent === "mcode-desktop"
        ? input.targetAgent
        : DEFAULT_TARGET_AGENT,
    capabilities: normalizeCapabilities(input.capabilities),
    protocolVersion: normalizeProtocolVersion(input.protocolVersion),
    relayUrl: normalizeOptionalString(input.relayUrl),
    pairedAt: normalizeNumber(input.pairedAt, Date.now()),
    lastSeenAt: input.lastSeenAt === null || input.lastSeenAt === undefined ? null : normalizeNumber(input.lastSeenAt, Date.now()),
    preferredMode: input.preferredMode === "direct" ? "direct" : "relay",
    revoked: Boolean(input.revoked),
  }
}

function normalizeSessionRecord(input: Partial<PairSessionRecord>): PairSessionRecord | null {
  const sessionId = normalizeOptionalString(input.sessionId)
  const targetId = normalizeOptionalString(input.targetId)
  if (!sessionId || !targetId) return null
  return {
    sessionId,
    targetId,
    tenantId: normalizeTenantId(input.tenantId),
    deviceName: normalizeOptionalString(input.deviceName),
    deviceUserAgent: normalizeOptionalString(input.deviceUserAgent),
    createdAt: normalizeNumber(input.createdAt, Date.now()),
    updatedAt: normalizeNumber(input.updatedAt, Date.now()),
    revokedAt: input.revokedAt === null || input.revokedAt === undefined ? null : normalizeNumber(input.revokedAt, Date.now()),
    revokeReason: normalizeOptionalString(input.revokeReason),
  }
}

function normalizeAuditEventRecord(input: Partial<AuditEventRecord>): AuditEventRecord | null {
  const eventId = normalizeOptionalString(input.eventId)
  const type = normalizeOptionalString(input.type)
  if (!eventId || !type) return null
  return {
    eventId,
    type,
    tenantId: normalizeTenantId(input.tenantId),
    targetId: normalizeOptionalString(input.targetId),
    sessionId: normalizeOptionalString(input.sessionId),
    actor: normalizeOptionalString(input.actor) ?? "system",
    message: normalizeOptionalString(input.message),
    createdAt: normalizeNumber(input.createdAt, Date.now()),
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
  }
}

function normalizeNumber(input: unknown, fallback: number): number {
  const value = Number(input)
  return Number.isFinite(value) ? value : fallback
}
