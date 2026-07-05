# P64 Goal Tool Call Adaptation

## Architecture

`codeg-main` now normalizes Codex `/goal` lifecycle changes into synthetic tool calls:

- `create_goal` opens a goal run.
- `update_goal` closes or updates a goal run.
- The canonical goal payload lives in the tool call output as `{"goal": {...}}`.

`mcode-app` treats this as a UI-level presentation contract. It does not parse raw Codex `session_info_update._meta.codex.goal`; upstream adapters must translate provider-private goal metadata into the shared synthetic tool-call form first.

## Data Flow

1. Realtime ACP receives a `tool_call` event.
2. `conversationRuntime` stores the initial tool-call `status`, `output`, `rawOutput`, and `error` instead of forcing all initial calls to `running`.
3. Historical detail normalization preserves `rawOutput` as an alias source for `ToolCall.output`.
4. `MessageBubble` runs `buildGoalDisplayParts(...)` before ordinary adjacent tool-call grouping.
5. A `create_goal` followed by intermediate content and `update_goal` renders as one `GoalToolCallBlock`; unfinished active goals render as a static or running card based on current message streaming state.

## UI Behavior

- Goal cards show `目标：<objective>` in the summary row.
- Expanded details show objective, nested in-run content, status, token budget/usage, remaining tokens, elapsed time, and errors when present.
- Non-goal tool calls keep the existing `ToolCallBlock` / `ToolCallGroupBlock` behavior.
- Adjacent non-goal tool calls inside a goal run are still grouped compactly.

## Compatibility

Older conversations without goal synthetic tool calls are unchanged. If an upstream sends a standalone `update_goal` without a preceding `create_goal`, mobile renders it as a standalone goal card using the same parser. If a goal tool call lacks JSON output, the parser falls back to `input.objective`, `input.status`, or a `Goal updated (<status>): <objective>` title.

## Native iOS/Android Replication Guidance

Native clients should implement the same small parser:

1. Normalize tool names `create_goal`, `functions.create_goal`, `mcp__...__create_goal`, `update_goal`, and `Goal updated (...)` titles.
2. Parse `ToolCall.output` or `ToolCall.rawOutput` as JSON and read `goal.objective`, `goal.status`, `goal.tokenBudget`, `goal.tokensUsed`, `goal.timeUsedSeconds`, and top-level `remainingTokens`.
3. Group message parts by scanning in order: `create_goal` starts a run, `update_goal` closes it, intervening parts become the expanded body.
4. Do not persist synthetic `goal_run` as a protocol part; it is derived at render time from existing `tool_call` parts.
5. Do not depend on Codex-specific `_meta.codex.goal` on mobile clients.
