import { acpApi } from "@/api/acp"

describe("acpApi turn control event normalization", () => {
  it("normalizes turn_cancel_requested metadata", () => {
    expect(acpApi.normalizeRealtimeEvent({
      type: "turn_cancel_requested",
      connectionId: "conn-1",
      data: {
        session_id: "session-1",
        active_turn_id: "turn-1",
        active_turn_owner_client_id: "client-phone",
        cancel_requested_by_client_id: "client-watch",
        cancel_requested_at_ms: 1782630000000,
        reason: "user_cancelled_from_watch",
      },
    })).toMatchObject({
      type: "turn_cancel_requested",
      connectionId: "conn-1",
      data: {
        sessionId: "session-1",
        activeTurnId: "turn-1",
        activeTurnOwnerClientId: "client-phone",
        cancelRequestedByClientId: "client-watch",
        cancelRequestedAtMs: 1782630000000,
        reason: "user_cancelled_from_watch",
      },
    })
  })

  it("normalizes turn_cancelled metadata", () => {
    expect(acpApi.normalizeRealtimeEvent({
      type: "turn_cancelled",
      connectionId: "conn-1",
      data: {
        sessionId: "session-1",
        activeTurnId: "turn-1",
        cancelRequestedByClientId: "client-watch",
        status: "canceled",
      },
    })).toMatchObject({
      type: "turn_cancelled",
      connectionId: "conn-1",
      data: {
        sessionId: "session-1",
        activeTurnId: "turn-1",
        cancelRequestedByClientId: "client-watch",
        status: "canceled",
      },
    })
  })

  it("normalizes turn_cancel_failed metadata", () => {
    expect(acpApi.normalizeRealtimeEvent({
      type: "turn_cancel_failed",
      connectionId: "conn-1",
      data: {
        session_id: "session-1",
        active_turn_id: "turn-1",
        cancel_requested_by_client_id: "client-watch",
        message: "provider refused interrupt",
      },
    })).toMatchObject({
      type: "turn_cancel_failed",
      connectionId: "conn-1",
      data: {
        sessionId: "session-1",
        activeTurnId: "turn-1",
        cancelRequestedByClientId: "client-watch",
        message: "provider refused interrupt",
      },
    })
  })

  it("normalizes queue lifecycle metadata", () => {
    expect(acpApi.normalizeRealtimeEvent({
      type: "turn_queued",
      connectionId: "conn-1",
      data: {
        session_id: "session-1",
        queue_item_id: "queue-1",
        queue_position: "2",
        queue_length: 3,
        source_client_id: "client-phone",
        source_device_name: "Phone",
        prompt_preview: "run tests",
        created_at_ms: "1782630000000",
        active_turn_id: "turn-active",
        runtime: "claude",
        agent_type: "claude_code",
      },
    })).toMatchObject({
      type: "turn_queued",
      connectionId: "conn-1",
      data: {
        sessionId: "session-1",
        queueItemId: "queue-1",
        queuePosition: 2,
        queueLength: 3,
        sourceClientId: "client-phone",
        sourceDeviceName: "Phone",
        promptPreview: "run tests",
        createdAtMs: 1782630000000,
        activeTurnId: "turn-active",
        runtime: "claude",
        agentType: "claude_code",
      },
    })
  })

  it("normalizes queue failure messages from camelCase payloads", () => {
    expect(acpApi.normalizeRealtimeEvent({
      type: "turn_queue_failed",
      connectionId: "conn-1",
      data: {
        sessionId: "session-1",
        queueItemId: "queue-1",
        queueLength: 0,
        message: "provider failed",
      },
    })).toMatchObject({
      type: "turn_queue_failed",
      connectionId: "conn-1",
      data: {
        sessionId: "session-1",
        queueItemId: "queue-1",
        queueLength: 0,
        message: "provider failed",
      },
    })
  })
})
