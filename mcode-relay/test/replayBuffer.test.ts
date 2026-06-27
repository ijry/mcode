import { describe, expect, it } from "vitest"
import { ReplayBuffer } from "../src/protocol/replayBuffer.js"

describe("ReplayBuffer", () => {
  it("replays events after a last acknowledged id", () => {
    const buffer = new ReplayBuffer(4)
    buffer.push({ eventId: 1, channel: "acp://event", payload: { type: "ready" } })
    buffer.push({ eventId: 2, channel: "acp://event", payload: { type: "delta" } })

    expect(buffer.after(1).map((event) => event.eventId)).toEqual([2])
  })

  it("keeps only the configured replay window", () => {
    const buffer = new ReplayBuffer(2)
    buffer.push({ eventId: 1, channel: "acp://event", payload: {} })
    buffer.push({ eventId: 2, channel: "acp://event", payload: {} })
    buffer.push({ eventId: 3, channel: "acp://event", payload: {} })

    expect(buffer.after(0).map((event) => event.eventId)).toEqual([2, 3])
  })

  it("reports replay metadata and detects window misses", () => {
    const buffer = new ReplayBuffer(2)
    buffer.push({ eventId: 1, channel: "acp://event", payload: {} })
    buffer.push({ eventId: 2, channel: "acp://event", payload: {} })
    buffer.push({ eventId: 3, channel: "acp://event", payload: {} })

    expect(buffer.metadata()).toEqual({
      replayWindowStart: 2,
      lastEventId: 3,
      replayAvailable: true,
    })

    expect(buffer.queryAfter(1)).toMatchObject({
      replayMiss: true,
      requestedLastEventId: 1,
      replayWindowStart: 2,
      lastEventId: 3,
    })
    expect(buffer.queryAfter(2).frames.map((event) => event.eventId)).toEqual([3])
  })

  it("snapshots and restores bounded replay frames", () => {
    const buffer = new ReplayBuffer(2)
    buffer.push({ eventId: 4, channel: "app://status", payload: { step: 1 }, localEventId: 11 })
    buffer.push({ eventId: 5, channel: "app://status", payload: { step: 2 }, localEventId: 12 })

    const restored = new ReplayBuffer(2)
    restored.restore(buffer.snapshot())

    expect(restored.metadata()).toEqual({
      replayWindowStart: 4,
      lastEventId: 5,
      replayAvailable: true,
    })
    expect(restored.after(0).map((event) => event.localEventId)).toEqual([11, 12])
  })
})
