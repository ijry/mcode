import type { ContentPart, GoalDisplayPart, GoalRunContentPart, ToolCall } from "@/types/acp"

export type GoalToolName = "create_goal" | "update_goal"

export interface ParsedGoalToolCall {
  objective: string | null
  status: string | null
  tokensUsed: number | null
  tokenBudget: number | null
  remainingTokens: number | null
  timeUsedSeconds: number | null
}

interface ParsedGoalTitle {
  objective: string
  status: string
  toolName: GoalToolName
}

const GOAL_UPDATE_TITLE_RE = /^goal updated\s*\(([^)]+)\)\s*[:：]\s*([\s\S]*)$/i

export function normalizeGoalToolName(name?: string | null): GoalToolName | null {
  const trimmed = String(name || "")
    .trim()
    .replace(/^[:：'"`“”‘’\s]+/, "")
    .replace(/['"`“”‘’\s]+$/, "")
  if (!trimmed) return null

  const title = parseGoalUpdateTitle(trimmed)
  if (title) return title.toolName

  const canonical = trimmed
    .toLowerCase()
    .replace(/[().]/g, "_")
    .replace(/[\s:/\\-]+/g, "_")
    .replace(/_+/g, "_")

  if (canonical === "create_goal" || canonical.endsWith("_create_goal")) return "create_goal"
  if (canonical === "update_goal" || canonical.endsWith("_update_goal")) return "update_goal"
  return null
}

export function parseGoalToolCall(toolCall: ToolCall): ParsedGoalToolCall | null {
  const toolName = normalizeGoalToolName(toolCall.name)
  if (!toolName) return null

  const input = recordFromUnknown(toolCall.input)
  const output = parseJsonRecord(toolCall.output || toolCall.rawOutput || toolCall.error)
  const goal = recordFromUnknown(output?.goal)
  const title = parseGoalUpdateTitle(toolCall.name)

  return {
    objective:
      stringField(goal, ["objective"]) ||
      stringField(input, ["objective"]) ||
      title?.objective ||
      null,
    status:
      stringField(goal, ["status"]) ||
      stringField(input, ["status"]) ||
      title?.status ||
      (toolName === "create_goal" ? "active" : null),
    tokensUsed: numberField(goal, ["tokensUsed", "tokens_used"]),
    tokenBudget:
      numberField(goal, ["tokenBudget", "token_budget"]) ??
      numberField(input, ["tokenBudget", "token_budget"]),
    remainingTokens:
      numberField(output, ["remainingTokens", "remaining_tokens"]) ??
      numberField(goal, ["remainingTokens", "remaining_tokens"]),
    timeUsedSeconds: numberField(goal, ["timeUsedSeconds", "time_used_seconds"]),
  }
}

export function buildGoalDisplayParts(
  parts: ContentPart[],
  isStreaming = false
): GoalDisplayPart[] {
  const result: GoalDisplayPart[] = []
  let active: { start: ToolCall; items: ContentPart[] } | null = null

  const flushActive = () => {
    if (!active) return
    result.push(createGoalRunPart(active.start, null, active.items, isStreaming))
    active = null
  }

  for (const part of parts || []) {
    const toolCall = part.type === "tool_call" ? part.tool_call : null
    const goalName = toolCall ? normalizeGoalToolName(toolCall.name) : null

    if (toolCall && goalName === "create_goal") {
      if (active) {
        active.start = toolCall
        active.items = []
      } else {
        active = { start: toolCall, items: [] }
      }
      continue
    }

    if (toolCall && goalName === "update_goal") {
      if (active) {
        result.push(
          createGoalRunPart(active.start, toolCall, active.items, toolCall.status === "running")
        )
        active = null
      } else {
        result.push(createGoalRunPart(toolCall, null, [], toolCall.status === "running"))
      }
      continue
    }

    if (active) {
      active.items.push(part)
    } else {
      result.push(part)
    }
  }

  flushActive()
  return result
}

function createGoalRunPart(
  start: ToolCall,
  end: ToolCall | null,
  items: ContentPart[],
  isRunning: boolean
): GoalRunContentPart {
  return {
    type: "goal_run",
    start,
    end,
    items: [...items],
    isRunning,
  }
}

function parseGoalUpdateTitle(input?: string | null): ParsedGoalTitle | null {
  const match = String(input || "").trim().match(GOAL_UPDATE_TITLE_RE)
  if (!match) return null

  const status = normalizeGoalStatus(match[1] || "")
  const objective = (match[2] || "").trim()
  if (!status || !objective) return null

  return {
    status,
    objective,
    toolName: status === "active" ? "create_goal" : "update_goal",
  }
}

function normalizeGoalStatus(status: string): string {
  return status.trim().toLowerCase().replace(/[\s-]+/g, "_")
}

function parseJsonRecord(raw?: string | null): Record<string, unknown> | null {
  if (!raw) return null
  try {
    return recordFromUnknown(JSON.parse(raw))
  } catch {
    return null
  }
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function stringField(obj: Record<string, unknown> | null, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj?.[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}

function numberField(obj: Record<string, unknown> | null, keys: string[]): number | null {
  for (const key of keys) {
    const value = obj?.[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
  }
  return null
}
