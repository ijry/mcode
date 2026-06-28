import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import type { RelayEventFrame } from "./types.js"

export const REPLAY_STORE_SCHEMA = "mcode.relay.replay.v1"

export interface ReplayTargetSnapshot {
  eventSequence: number
  frames: RelayEventFrame[]
}

export interface ReplayStoreSnapshot {
  schema: typeof REPLAY_STORE_SCHEMA
  targets: Record<string, ReplayTargetSnapshot>
}

export interface ReplayStoreStorage {
  load(): ReplayStoreSnapshot | null
  save(snapshot: ReplayStoreSnapshot): void
}

export class JsonFileReplayStoreStorage implements ReplayStoreStorage {
  constructor(private readonly filePath: string) {}

  load(): ReplayStoreSnapshot | null {
    if (!this.filePath || !existsSync(this.filePath)) return null
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<ReplayStoreSnapshot>
      if (
        parsed.schema !== REPLAY_STORE_SCHEMA ||
        !parsed.targets ||
        typeof parsed.targets !== "object"
      ) {
        return null
      }
      return normalizeSnapshot(parsed, 1000)
    } catch {
      return null
    }
  }

  save(snapshot: ReplayStoreSnapshot): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(snapshot, null, 2), "utf8")
  }
}

export class ReplayStore {
  private readonly targets = new Map<string, ReplayTargetSnapshot>()

  constructor(
    private readonly storage: ReplayStoreStorage | null = null,
    private readonly maxFramesPerTarget = 1000
  ) {
    const snapshot = storage?.load()
    if (snapshot) {
      for (const [targetId, target] of Object.entries(snapshot.targets)) {
        this.targets.set(targetId, normalizeTargetSnapshot(target, this.maxFramesPerTarget))
      }
    }
  }

  getTarget(targetId: string): ReplayTargetSnapshot | null {
    const target = this.targets.get(targetId)
    return target ? cloneTargetSnapshot(target) : null
  }

  saveTarget(targetId: string, snapshot: ReplayTargetSnapshot): void {
    this.targets.set(targetId, normalizeTargetSnapshot(snapshot, this.maxFramesPerTarget))
    this.persist()
  }

  snapshot(): ReplayStoreSnapshot {
    const targets: Record<string, ReplayTargetSnapshot> = {}
    for (const [targetId, target] of this.targets.entries()) {
      targets[targetId] = cloneTargetSnapshot(target)
    }
    return { schema: REPLAY_STORE_SCHEMA, targets }
  }

  private persist(): void {
    this.storage?.save(this.snapshot())
  }
}

function normalizeSnapshot(
  input: Partial<ReplayStoreSnapshot>,
  maxFrames: number
): ReplayStoreSnapshot {
  const targets: Record<string, ReplayTargetSnapshot> = {}
  for (const [targetId, target] of Object.entries(input.targets ?? {})) {
    targets[targetId] = normalizeTargetSnapshot(target, maxFrames)
  }
  return { schema: REPLAY_STORE_SCHEMA, targets }
}

function normalizeTargetSnapshot(
  input: Partial<ReplayTargetSnapshot>,
  maxFrames: number
): ReplayTargetSnapshot {
  const frames = Array.isArray(input.frames) ? input.frames.slice(-maxFrames).map(cloneFrame) : []
  return {
    eventSequence: normalizeNumber(input.eventSequence, frames.at(-1)?.eventId ?? 0),
    frames,
  }
}

function cloneTargetSnapshot(snapshot: ReplayTargetSnapshot): ReplayTargetSnapshot {
  return {
    eventSequence: snapshot.eventSequence,
    frames: snapshot.frames.map(cloneFrame),
  }
}

function cloneFrame(frame: RelayEventFrame): RelayEventFrame {
  return { ...frame }
}

function normalizeNumber(input: unknown, fallback: number): number {
  const value = Number(input)
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : fallback
}
