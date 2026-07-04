import {
  buildAgentConfigContextKey,
  hasSessionModeOptions,
} from "@/services/conversation/composerTools"

describe("buildAgentConfigContextKey", () => {
  it("keeps create-flow keys stable when no scope is provided", () => {
    expect(buildAgentConfigContextKey("remote-a", "Codex", "/workspace/demo")).toBe(
      JSON.stringify(["remote-a", "codex", "/workspace/demo"])
    )
  })

  it("separates detail selections by explicit conversation scope", () => {
    const left = buildAgentConfigContextKey("remote-a", "codex", "/workspace/demo", 101)
    const right = buildAgentConfigContextKey("remote-a", "codex", "/workspace/demo", 202)

    expect(left).not.toBe(right)
    expect(left).toBe(JSON.stringify(["remote-a", "codex", "/workspace/demo", "101"]))
    expect(right).toBe(JSON.stringify(["remote-a", "codex", "/workspace/demo", "202"]))
  })

  it("treats returned session modes as create-flow authorization options", () => {
    expect(hasSessionModeOptions(null)).toBe(false)
    expect(hasSessionModeOptions({ current_mode_id: "", available_modes: [] })).toBe(false)
    expect(hasSessionModeOptions({
      current_mode_id: "agent",
      available_modes: [{ id: "agent", name: "Agent" }],
    })).toBe(true)
  })
})
