import type { RelayEventFrame } from "./types.js"

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
    const checkpoint = Number.isFinite(lastEventId) ? lastEventId : 0
    return this.items.filter((item) => item.eventId > checkpoint).map((item) => ({ ...item }))
  }
}
