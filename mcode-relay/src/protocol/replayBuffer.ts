import type { RelayEventFrame, ReplayMetadata, ReplayQueryResult } from "./types.js"

export class ReplayBuffer {
  constructor(
    private readonly maxSize: number,
    private readonly items: RelayEventFrame[] = []
  ) {}

  push(frame: RelayEventFrame): void {
    this.items.push({ ...frame })
    while (this.items.length > this.maxSize) {
      this.items.shift()
    }
  }

  after(lastEventId: number): RelayEventFrame[] {
    return this.queryAfter(lastEventId).frames
  }

  queryAfter(lastEventId: number): ReplayQueryResult {
    const checkpoint = normalizeEventId(lastEventId)
    const metadata = this.metadata()
    const replayMiss =
      checkpoint > 0 &&
      metadata.replayWindowStart !== null &&
      checkpoint < metadata.replayWindowStart

    return {
      ...metadata,
      requestedLastEventId: checkpoint,
      replayMiss,
      frames: this.items.filter((item) => item.eventId > checkpoint).map(cloneFrame),
    }
  }

  metadata(): ReplayMetadata {
    const first = this.items[0]
    const last = this.items[this.items.length - 1]
    return {
      replayWindowStart: first?.eventId ?? null,
      lastEventId: last?.eventId ?? 0,
      replayAvailable: this.items.length > 0,
    }
  }

  snapshot(): RelayEventFrame[] {
    return this.items.map(cloneFrame)
  }

  restore(frames: RelayEventFrame[]): void {
    this.items.splice(0, this.items.length)
    for (const frame of frames) {
      this.push(frame)
    }
  }
}

function normalizeEventId(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
}

function cloneFrame(frame: RelayEventFrame): RelayEventFrame {
  return { ...frame }
}
