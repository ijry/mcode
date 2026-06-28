import {
  buildRelayEventsUrl,
  classifyRelayRealtimeFrame,
  describeGatewayFailureCode,
  normalizeRelayEventCheckpoint,
} from "@/services/gateway/relayRecovery"

describe("relay recovery helpers", () => {
  it("builds events URLs with valid lastEventId only", () => {
    expect(buildRelayEventsUrl("https://relay.example.com/", 42))
      .toBe("wss://relay.example.com/v1/events?lastEventId=42")
    expect(buildRelayEventsUrl("http://127.0.0.1:8787", 0))
      .toBe("ws://127.0.0.1:8787/v1/events")
    expect(buildRelayEventsUrl("https://relay.example.com", -1))
      .toBe("wss://relay.example.com/v1/events")
  })

  it("normalizes relay event checkpoints defensively", () => {
    expect(normalizeRelayEventCheckpoint(12.9)).toBe(12)
    expect(normalizeRelayEventCheckpoint("7")).toBe(7)
    expect(normalizeRelayEventCheckpoint(0)).toBeNull()
    expect(normalizeRelayEventCheckpoint("bad")).toBeNull()
  })

  it("classifies relay ready, replay miss, and wrapped event frames", () => {
    expect(classifyRelayRealtimeFrame({ type: "ready", lastEventId: 9 }))
      .toMatchObject({
        kind: "ready",
        lastEventId: 9,
      })
    expect(classifyRelayRealtimeFrame({
      type: "replay_miss",
      requestedLastEventId: 1,
      lastEventId: 8,
    })).toMatchObject({
      kind: "replay_miss",
      requestedLastEventId: 1,
      lastEventId: 8,
    })
    expect(classifyRelayRealtimeFrame({
      eventId: 10,
      channel: "acp://event",
      payload: { type: "stream_batch" },
    })).toMatchObject({
      kind: "event",
      eventId: 10,
      channel: "acp://event",
    })
    expect(classifyRelayRealtimeFrame({
      type: "stream_batch",
      connectionId: "c1",
      data: {},
    })).toMatchObject({ kind: "legacy" })
  })

  it("maps classified gateway failures to actionable copy", () => {
    expect(describeGatewayFailureCode("target_offline")).toContain("Desktop")
    expect(describeGatewayFailureCode("request_timeout")).toContain("重试")
    expect(describeGatewayFailureCode("session_revoked")).toContain("重新配对")
    expect(describeGatewayFailureCode("unknown")).toBe("")
  })
})
