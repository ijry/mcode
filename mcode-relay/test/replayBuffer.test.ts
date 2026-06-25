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
})
