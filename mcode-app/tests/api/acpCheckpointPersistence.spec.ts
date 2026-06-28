import { acpApi } from "@/api/acp"
import {
  clearRelayCheckpoints,
  readRelayCheckpoint,
  upsertRelayCheckpoint,
} from "@/services/gateway/relayCheckpointStore"

describe("acpApi relay checkpoint persistence", () => {
  beforeEach(() => {
    acpApi.clearRelayRecoveryState()
    clearRelayCheckpoints()
    acpApi.__setReplayMissCalibrationHookForTest(() => {})
  })

  afterEach(() => {
    acpApi.__setReplayMissCalibrationHookForTest(null)
    acpApi.clearRelayRecoveryState()
    clearRelayCheckpoints()
  })

  it("hydrates the relay checkpoint from storage", () => {
    uni.setStorageSync("mcode_relay_checkpoints_v1", {
      version: 1,
      checkpoints: [
        {
          instanceKey: "relay:hydrate",
          lastRelayEventId: 88,
          updatedAt: 1_710_000_000_000,
        },
      ],
    })

    expect(acpApi.getRelayRecoveryState("relay:hydrate")).toMatchObject({
      lastRelayEventId: 88,
    })
  })

  it("persists the wrapped event checkpoint after dispatch succeeds", () => {
    const payloads: unknown[] = []

    acpApi.__handleRelayRealtimeFrameForTest(
      "relay:persist",
      { eventId: 9, channel: "app://status", payload: { ok: true } },
      (payload) => payloads.push(payload)
    )

    expect(payloads).toEqual([{
      eventId: 9,
      channel: "app://status",
      payload: { ok: true },
      controllerId: null,
      localEventId: null,
    }])
    expect(readRelayCheckpoint("relay:persist")).toMatchObject({
      instanceKey: "relay:persist",
      lastRelayEventId: 9,
    })
  })

  it("does not persist when wrapped event dispatch throws", () => {
    expect(() =>
      acpApi.__handleRelayRealtimeFrameForTest(
        "relay:broken",
        { eventId: 10, channel: "app://status", payload: { ok: false } },
        () => {
          throw new Error("dispatch failed")
        }
      )
    ).toThrow("dispatch failed")

    expect(readRelayCheckpoint("relay:broken")).toBeNull()
  })

  it("persists replay miss high-water checkpoints", async () => {
    acpApi.__handleRelayRealtimeFrameForTest(
      "relay:miss",
      { type: "replay_miss", requestedLastEventId: 1, replayWindowStart: 5, lastEventId: 8 },
      () => {}
    )

    await Promise.resolve()

    expect(readRelayCheckpoint("relay:miss")).toMatchObject({
      instanceKey: "relay:miss",
      lastRelayEventId: 8,
    })
    expect(acpApi.getRelayRecoveryState("relay:miss")).toMatchObject({
      recoveryIssue: "replay_miss",
    })
  })

  it("clears persisted checkpoints with the in-memory state", () => {
    upsertRelayCheckpoint("relay:clear", 12)

    acpApi.clearRelayRecoveryState("relay:clear")

    expect(readRelayCheckpoint("relay:clear")).toBeNull()
  })
})
