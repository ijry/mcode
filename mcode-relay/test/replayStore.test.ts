import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { JsonFileReplayStoreStorage, ReplayStore } from "../src/protocol/replayStore.js"

describe("ReplayStore", () => {
  it("persists replay buffers and event sequences without tokens", () => {
    const dir = mkdtempSync(join(tmpdir(), "mcode-relay-replay-"))
    const path = join(dir, "replay.json")
    try {
      const store = new ReplayStore(new JsonFileReplayStoreStorage(path), 2)
      store.saveTarget("desktop-1", {
        eventSequence: 8,
        frames: [
          { eventId: 7, channel: "acp://event", payload: { text: "one" } },
          { eventId: 8, channel: "acp://event", payload: { text: "two" }, localEventId: 3 },
        ],
      })

      const raw = readFileSync(path, "utf8")
      expect(raw).toContain('"schema": "mcode.relay.replay.v1"')
      expect(raw).not.toContain("accessToken")
      expect(raw).not.toContain("refreshToken")

      const restored = new ReplayStore(new JsonFileReplayStoreStorage(path), 2)
      expect(restored.snapshot().targets["desktop-1"].eventSequence).toBe(8)
      expect(restored.snapshot().targets["desktop-1"].frames.map((frame) => frame.eventId)).toEqual([
        7,
        8,
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
