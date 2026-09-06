import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { JsonFilePairingStoreStorage, PairingStore } from "../src/pairing/store.js"
import { TARGET_AGENTS, isTargetAgent } from "../src/protocol/types.js"

/**
 * Guards for the `targetAgent` vocabulary.
 *
 * Relay validates it in three places — pair offers, target upsert, and snapshot
 * restore — and they used to carry three copies of the union. A value accepted by
 * two of them and dropped by the third is the failure this file exists to catch:
 * pairing succeeds, the phone connects, and then the target vanishes on the next
 * relay restart.
 */
describe("target agent vocabulary", () => {
  it("includes dsh and narrows only known values", () => {
    expect(TARGET_AGENTS).toContain("dsh")
    expect(TARGET_AGENTS).toContain("codeg")
    expect(TARGET_AGENTS).toContain("opencode")
    expect(TARGET_AGENTS).toContain("mcode-desktop")

    for (const agent of TARGET_AGENTS) {
      expect(isTargetAgent(agent)).toBe(true)
    }
    for (const nope of ["", "DSH", "claude", "codex", null, undefined, 1, {}]) {
      expect(isTargetAgent(nope)).toBe(false)
    }
  })

  it("carries a dsh target through pairing, upsert, and a snapshot restore", () => {
    const dir = mkdtempSync(join(tmpdir(), "mcode-relay-dsh-"))
    try {
      const path = join(dir, "pairing-store.json")
      const store = new PairingStore(new JsonFilePairingStoreStorage(path))

      store.addOffer({
        code: "ABCD-2345",
        secret: "pair-secret",
        targetId: "dsh-desktop-1",
        targetName: "书房台式机 的 dsh",
        targetAgent: "dsh",
        capabilities: ["dsh.bridge.sessions", "dsh.bridge.events"],
        protocolVersion: "1",
        ttlSeconds: 300,
      })

      const offer = store.consumeOffer("ABCD-2345", "pair-secret")
      expect(offer?.targetAgent).toBe("dsh")

      const target = store.upsertTarget({
        targetId: "dsh-desktop-1",
        targetName: "书房台式机 的 dsh",
        targetAgent: "dsh",
        capabilities: ["dsh.bridge.sessions"],
        protocolVersion: "1",
        preferredMode: "relay",
      })
      expect(target.targetAgent).toBe("dsh")

      // The restore path is the one that used to drop unknown agents silently.
      const restored = new PairingStore(new JsonFilePairingStoreStorage(path))
      expect(restored.getTarget("dsh-desktop-1")?.targetAgent).toBe("dsh")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("still refuses a target with no recognizable agent", () => {
    const store = new PairingStore()
    expect(() =>
      store.upsertTarget({
        targetId: "mystery-1",
        // @ts-expect-error deliberately outside the union
        targetAgent: "something-new",
        protocolVersion: "1",
      })
    ).toThrow(/targetAgent is required/)
  })
})
