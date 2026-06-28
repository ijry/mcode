const STORAGE_KEY = "mcode_relay_checkpoints_v1"
const MAX_RELAY_CHECKPOINTS = 50

export interface RelayCheckpointRecord {
  instanceKey: string
  lastRelayEventId: number
  updatedAt: number
}

export interface RelayCheckpointStorageSnapshot {
  version: 1
  checkpoints: RelayCheckpointRecord[]
}

export function readRelayCheckpointSnapshot(): RelayCheckpointStorageSnapshot {
  return normalizeRelayCheckpointStorageSnapshot(uni.getStorageSync(STORAGE_KEY))
}

export function readRelayCheckpoint(instanceKey: string): RelayCheckpointRecord | null {
  const key = normalizeInstanceKey(instanceKey)
  if (!key) return null

  return readRelayCheckpointSnapshot().checkpoints.find((item) => item.instanceKey === key) ?? null
}

export function upsertRelayCheckpoint(instanceKey: string, lastRelayEventId: number) {
  const key = normalizeInstanceKey(instanceKey)
  const eventId = normalizeCheckpointId(lastRelayEventId)
  if (!key || eventId === null) return

  const snapshot = readRelayCheckpointSnapshot()
  const next: RelayCheckpointStorageSnapshot = {
    version: 1,
    checkpoints: [
      ...snapshot.checkpoints.filter((item) => item.instanceKey !== key),
      {
        instanceKey: key,
        lastRelayEventId: eventId,
        updatedAt: Date.now(),
      },
    ]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_RELAY_CHECKPOINTS),
  }
  uni.setStorageSync(STORAGE_KEY, next)
}

export function clearRelayCheckpoint(instanceKey: string) {
  const key = normalizeInstanceKey(instanceKey)
  if (!key) return

  const snapshot = readRelayCheckpointSnapshot()
  const next = snapshot.checkpoints.filter((item) => item.instanceKey !== key)
  if (next.length === snapshot.checkpoints.length) return

  if (next.length === 0) {
    uni.removeStorageSync(STORAGE_KEY)
    return
  }

  uni.setStorageSync(STORAGE_KEY, {
    version: 1,
    checkpoints: next,
  })
}

export function clearRelayCheckpoints() {
  uni.removeStorageSync(STORAGE_KEY)
}

function normalizeRelayCheckpointStorageSnapshot(value: unknown): RelayCheckpointStorageSnapshot {
  if (!value || typeof value !== "object") {
    return { version: 1, checkpoints: [] }
  }

  const record = value as Record<string, unknown>
  if (Number(record.version) !== 1) {
    return { version: 1, checkpoints: [] }
  }

  const byInstanceKey = new Map<string, RelayCheckpointRecord>()
  const checkpoints = Array.isArray(record.checkpoints) ? record.checkpoints : []
  for (const checkpoint of checkpoints) {
    const normalized = normalizeRelayCheckpointRecord(checkpoint)
    if (!normalized) continue
    const previous = byInstanceKey.get(normalized.instanceKey)
    if (!previous || normalized.updatedAt >= previous.updatedAt) {
      byInstanceKey.set(normalized.instanceKey, normalized)
    }
  }

  return {
    version: 1,
    checkpoints: Array.from(byInstanceKey.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_RELAY_CHECKPOINTS),
  }
}

function normalizeRelayCheckpointRecord(value: unknown): RelayCheckpointRecord | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  const instanceKey = normalizeInstanceKey(record.instanceKey)
  const lastRelayEventId = normalizeCheckpointId(record.lastRelayEventId)
  const updatedAt = normalizeTimestamp(record.updatedAt)
  if (!instanceKey || lastRelayEventId === null || updatedAt === null) return null

  return {
    instanceKey,
    lastRelayEventId,
    updatedAt,
  }
}

function normalizeInstanceKey(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeCheckpointId(value: unknown) {
  const parsed = typeof value === "string" && value.trim() ? Number(value) : value
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed <= 0) return null
  return Math.trunc(parsed)
}

function normalizeTimestamp(value: unknown) {
  const parsed = typeof value === "string" && value.trim() ? Number(value) : value
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed <= 0) return null
  return Math.trunc(parsed)
}
