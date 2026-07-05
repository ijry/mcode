import {
  buildGoalDisplayParts,
  normalizeGoalToolName,
  parseGoalToolCall,
} from "@/services/conversation/goalToolCall"
import type { ContentPart, ToolCall } from "@/types/acp"

describe("goalToolCall", () => {
  it("normalizes Codex goal tool aliases and live titles", () => {
    expect(normalizeGoalToolName("create_goal")).toBe("create_goal")
    expect(normalizeGoalToolName("functions.update_goal")).toBe("update_goal")
    expect(normalizeGoalToolName("mcp__codeg__create_goal")).toBe("create_goal")
    expect(normalizeGoalToolName("Goal updated (active): Ship mobile goal card")).toBe(
      "create_goal"
    )
    expect(normalizeGoalToolName("Goal updated (budget_limited): Ship mobile goal card")).toBe(
      "update_goal"
    )
    expect(normalizeGoalToolName("shell_command")).toBeNull()
  })

  it("parses objective, status, token budget, usage, remaining tokens, and duration", () => {
    const toolCall: ToolCall = {
      id: "codex-goal-1",
      name: "update_goal",
      input: { status: "budget_limited", objective: "Ship mobile goal card" },
      output: JSON.stringify({
        goal: {
          objective: "Ship mobile goal card",
          status: "budget_limited",
          tokenBudget: 8000,
          tokensUsed: 5200,
          timeUsedSeconds: 19,
        },
        remainingTokens: 2800,
      }),
      status: "completed",
    }

    expect(parseGoalToolCall(toolCall)).toEqual({
      objective: "Ship mobile goal card",
      status: "budget_limited",
      tokensUsed: 5200,
      tokenBudget: 8000,
      remainingTokens: 2800,
      timeUsedSeconds: 19,
    })
  })

  it("falls back to title and input when goal output is unavailable", () => {
    const toolCall: ToolCall = {
      id: "codex-goal-2",
      name: "Goal updated (active): Ship mobile goal card",
      input: {},
      status: "completed",
    }

    expect(parseGoalToolCall(toolCall)).toEqual({
      objective: "Ship mobile goal card",
      status: "active",
      tokensUsed: null,
      tokenBudget: null,
      remainingTokens: null,
      timeUsedSeconds: null,
    })
  })

  it("preserves zero-valued numeric goal fields", () => {
    const toolCall: ToolCall = {
      id: "codex-goal-3",
      name: "create_goal",
      input: { objective: "No usage yet", tokenBudget: 0 },
      output: JSON.stringify({
        goal: {
          objective: "No usage yet",
          status: "active",
          tokenBudget: 0,
          tokensUsed: 0,
          timeUsedSeconds: 0,
        },
        remainingTokens: 0,
      }),
      status: "completed",
    }

    expect(parseGoalToolCall(toolCall)).toEqual({
      objective: "No usage yet",
      status: "active",
      tokensUsed: 0,
      tokenBudget: 0,
      remainingTokens: 0,
      timeUsedSeconds: 0,
    })
  })

  it("wraps create/update goal markers with intervening content", () => {
    const parts: ContentPart[] = [
      {
        type: "tool_call",
        tool_call: {
          id: "codex-goal-1",
          name: "create_goal",
          input: { objective: "Ship mobile goal card" },
          output: JSON.stringify({
            goal: { objective: "Ship mobile goal card", status: "active" },
          }),
          status: "completed",
        },
      },
      { type: "text", text: "Working" },
      {
        type: "tool_call",
        tool_call: {
          id: "codex-goal-2",
          name: "update_goal",
          input: { status: "complete", objective: "Ship mobile goal card" },
          output: JSON.stringify({
            goal: { objective: "Ship mobile goal card", status: "complete" },
          }),
          status: "completed",
        },
      },
    ]

    expect(buildGoalDisplayParts(parts)).toEqual([
      {
        type: "goal_run",
        start: parts[0].tool_call,
        end: parts[2].tool_call,
        items: [parts[1]],
        isRunning: false,
      },
    ])
  })

  it("keeps unfinished goal runs static after streaming stops", () => {
    const parts: ContentPart[] = [
      {
        type: "tool_call",
        tool_call: {
          id: "codex-goal-1",
          name: "create_goal",
          input: { objective: "Ship mobile goal card" },
          status: "completed",
        },
      },
      { type: "text", text: "Working" },
    ]

    expect(buildGoalDisplayParts(parts, false)).toEqual([
      {
        type: "goal_run",
        start: parts[0].tool_call,
        end: null,
        items: [parts[1]],
        isRunning: false,
      },
    ])
    expect(buildGoalDisplayParts(parts, true)[0]).toMatchObject({
      type: "goal_run",
      isRunning: true,
    })
  })
})
