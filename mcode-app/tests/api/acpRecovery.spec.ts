import { acpApi } from "@/api/acp"

describe("acpApi relay recovery", () => {
  beforeEach(() => {
    acpApi.clearRelayRecoveryState()
  })

  it("records relay checkpoints after wrapped event dispatch", () => {
    const received: unknown[] = []
    acpApi.__handleRelayRealtimeFrameForTest(
      "relay:https://gateway.example.com:desktop-1",
      { eventId: 9, channel: "app://status", payload: { ok: true } },
      (payload) => received.push(payload)
    )

    expect(received).toEqual([{
      eventId: 9,
      channel: "app://status",
      payload: { ok: true },
      controllerId: null,
      localEventId: null,
    }])
    expect(acpApi.getRelayRecoveryState("relay:https://gateway.example.com:desktop-1"))
      .toMatchObject({ lastRelayEventId: 9 })
  })

  it("does not advance checkpoint when dispatch throws", () => {
    expect(() => acpApi.__handleRelayRealtimeFrameForTest(
      "relay:broken",
      { eventId: 10, channel: "app://status", payload: { ok: false } },
      () => {
        throw new Error("dispatch failed")
      }
    )).toThrow("dispatch failed")

    expect(acpApi.getRelayRecoveryState("relay:broken").lastRelayEventId).toBeNull()
  })

  it("records replay miss health without dispatching ACP event", () => {
    const received: unknown[] = []
    acpApi.__handleRelayRealtimeFrameForTest(
      "relay:miss",
      { type: "replay_miss", requestedLastEventId: 1, replayWindowStart: 5, lastEventId: 8 },
      (payload) => received.push(payload)
    )

    expect(received).toEqual([])
    expect(acpApi.getRelayRecoveryState("relay:miss")).toMatchObject({
      recoveryIssue: "replay_miss",
      requestedLastEventId: 1,
      replayWindowStart: 5,
      lastRelayEventId: 8,
    })
    expect(acpApi.getRealtimeBridgeHealth("relay:miss")).toMatchObject({
      recoveryIssue: "replay_miss",
      requestedLastEventId: 1,
      replayWindowStart: 5,
      lastRelayEventId: 8,
    })
  })
})
