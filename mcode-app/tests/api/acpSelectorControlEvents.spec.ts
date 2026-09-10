import { acpApi } from "@/api/acp"

describe("acpApi selector event normalization", () => {
  it("normalizes flat session_modes wire payloads", () => {
    expect(acpApi.normalizeRealtimeEvent({
      seq: 11,
      connection_id: "conn-1",
      type: "session_modes",
      modes: {
        current_mode_id: "agent-full-access",
        available_modes: [{ id: "agent-full-access", name: "Full access" }],
      },
    })).toMatchObject({
      type: "session_modes",
      connectionId: "conn-1",
      seq: 11,
      data: {
        modes: {
          current_mode_id: "agent-full-access",
          available_modes: [{ id: "agent-full-access", name: "Full access" }],
        },
      },
    })
  })

  it("normalizes flat session_config_options wire payloads", () => {
    expect(acpApi.normalizeRealtimeEvent({
      seq: 12,
      connection_id: "conn-1",
      type: "session_config_options",
      config_options: [{
        id: "reasoning_effort",
        name: "Reasoning effort",
        kind: { type: "select", current_value: "high", options: [], groups: [] },
      }],
    })).toMatchObject({
      type: "session_config_options",
      connectionId: "conn-1",
      seq: 12,
      data: {
        config_options: [{
          id: "reasoning_effort",
          name: "Reasoning effort",
          kind: { type: "select", current_value: "high", options: [], groups: [] },
        }],
      },
    })
  })

  it("normalizes flat mode_changed and selectors_ready payloads", () => {
    expect(acpApi.normalizeRealtimeEvent({
      seq: 13,
      connection_id: "conn-1",
      type: "mode_changed",
      mode_id: "agent-full-access",
    })).toMatchObject({
      type: "mode_changed",
      connectionId: "conn-1",
      seq: 13,
      data: { mode_id: "agent-full-access" },
    })

    expect(acpApi.normalizeRealtimeEvent({
      seq: 14,
      connection_id: "conn-1",
      type: "selectors_ready",
    })).toMatchObject({
      type: "selectors_ready",
      connectionId: "conn-1",
      seq: 14,
      data: {},
    })
  })
})
