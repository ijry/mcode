import {
  clearRelayCheckpoint,
  clearRelayCheckpoints,
  readRelayCheckpoint,
  readRelayCheckpointSnapshot,
  upsertRelayCheckpoint,
} from "@/services/gateway/relayCheckpointStore"

describe("relay checkpoint store", () => {
  beforeEach(() => {
    clearRelayCheckpoints()
  })

  afterEach(() => {
    clearRelayCheckpoints()
  })

  it("writes and reads a checkpoint record", () => {
    upsertRelayCheckpoint("relay:desktop-1", 42)

    expect(readRelayCheckpoint("relay:desktop-1")).toMatchObject({
      instanceKey: "relay:desktop-1",
      lastRelayEventId: 42,
    })
  })

  it("clears one checkpoint without touching the others", () => {
    upsertRelayCheckpoint("relay:desktop-1", 42)
    upsertRelayCheckpoint("relay:desktop-2", 43)

    clearRelayCheckpoint("relay:desktop-1")

    expect(readRelayCheckpoint("relay:desktop-1")).toBeNull()
    expect(readRelayCheckpoint("relay:desktop-2")).toMatchObject({
      lastRelayEventId: 43,
    })
  })

  it("ignores malformed snapshots and wrong versions", () => {
    uni.setStorageSync("mcode_relay_checkpoints_v1", {
      version: 2,
      checkpoints: [{ instanceKey: "relay:bad", lastRelayEventId: 9, updatedAt: 1 }],
    })

    expect(readRelayCheckpointSnapshot()).toEqual({
      version: 1,
      checkpoints: [],
    })
  })

  it("keeps only the newest checkpoints when the snapshot is over the retention limit", () => {
    uni.setStorageSync("mcode_relay_checkpoints_v1", {
      version: 1,
      checkpoints: Array.from({ length: 52 }, (_, index) => ({
        instanceKey: `relay:${String(index + 1).padStart(2, "0")}`,
        lastRelayEventId: index + 1,
        updatedAt: 1_000 + index,
      })),
    })

    const snapshot = readRelayCheckpointSnapshot()

    expect(snapshot.checkpoints).toHaveLength(50)
    expect(snapshot.checkpoints[0]).toMatchObject({
      instanceKey: "relay:52",
      lastRelayEventId: 52,
    })
    expect(readRelayCheckpoint("relay:01")).toBeNull()
    expect(readRelayCheckpoint("relay:52")).toMatchObject({
      lastRelayEventId: 52,
    })
  })
})
