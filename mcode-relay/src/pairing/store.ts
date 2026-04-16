import { randomUUID } from "node:crypto"
import { sha256Hex } from "../auth/tokens.js"

export interface PairOfferRecord {
  code: string
  secretHash: string
  targetId: string
  targetName: string | null
  relayUrl: string | null
  expiresAt: number
  consumedAt: number | null
}

export interface TargetRecord {
  targetId: string
  targetName: string | null
  relayUrl: string | null
  pairedAt: number
  lastSeenAt: number | null
  preferredMode: "relay" | "direct"
  revoked: boolean
}

export interface PairSessionRecord {
  sessionId: string
  targetId: string
  createdAt: number
  updatedAt: number
  revokedAt: number | null
}

export class PairingStore {
  private readonly offers = new Map<string, PairOfferRecord>()
  private readonly targets = new Map<string, TargetRecord>()
  private readonly sessions = new Map<string, PairSessionRecord>()

  addOffer(input: {
    code: string
    secret: string
    targetId: string
    targetName?: string | null
    relayUrl?: string | null
    ttlSeconds: number
  }): PairOfferRecord {
    const now = Date.now()
    const offer: PairOfferRecord = {
      code: input.code,
      secretHash: sha256Hex(input.secret),
      targetId: input.targetId,
      targetName: input.targetName ?? null,
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
    targetName?: string | null
    relayUrl?: string | null
    preferredMode?: "relay" | "direct"
  }): TargetRecord {
    const existing = this.targets.get(input.targetId)
    const record: TargetRecord = {
      targetId: input.targetId,
      targetName: input.targetName ?? existing?.targetName ?? null,
      relayUrl: input.relayUrl ?? existing?.relayUrl ?? null,
      pairedAt: existing?.pairedAt ?? Date.now(),
      lastSeenAt: existing?.lastSeenAt ?? null,
      preferredMode: input.preferredMode ?? existing?.preferredMode ?? "relay",
      revoked: existing?.revoked ?? false,
    }
    this.targets.set(record.targetId, record)
    return record
  }

  markTargetSeen(targetId: string): void {
    const target = this.targets.get(targetId)
    if (!target) return
    target.lastSeenAt = Date.now()
    this.targets.set(targetId, target)
  }

  setPreferredMode(targetId: string, preferredMode: "relay" | "direct"): void {
    const target = this.targets.get(targetId)
    if (!target) return
    target.preferredMode = preferredMode
    this.targets.set(targetId, target)
  }

  createSession(targetId: string): PairSessionRecord {
    const now = Date.now()
    const session: PairSessionRecord = {
      sessionId: randomUUID(),
      targetId,
      createdAt: now,
      updatedAt: now,
      revokedAt: null,
    }
    this.sessions.set(session.sessionId, session)
    return session
  }

  touchSession(sessionId: string): PairSessionRecord | null {
    const session = this.sessions.get(sessionId)
    if (!session || session.revokedAt !== null) return null
    session.updatedAt = Date.now()
    this.sessions.set(sessionId, session)
    return session
  }

  revokeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false
    session.revokedAt = Date.now()
    this.sessions.set(sessionId, session)
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

  listTargets(): TargetRecord[] {
    return [...this.targets.values()]
  }

  listSessions(): PairSessionRecord[] {
    return [...this.sessions.values()]
  }
}
