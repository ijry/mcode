# P64 Goal Tool Call Adaptation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render Codex `/goal` lifecycle markers in `mcode-app` conversation detail as goal cards instead of generic tool logs.

**Architecture:** `codeg-main` now emits Codex `/goal` as synthetic `create_goal` / `update_goal` tool calls whose output carries `{"goal": {...}}`. `mcode-app` should preserve those completed tool-call fields in runtime state, then group and render goal start/end markers at the message presentation layer. The app remains a consumer of the normalized tool-call contract and does not parse raw `session_info_update._meta.codex.goal`.

**Tech Stack:** Vue 3 SFC, TypeScript, Pinia runtime store, Jest unit/source-contract tests, uview-plus `--up-*` theme variables.

## Global Constraints

- 普通回复和交付说明默认使用中文。
- mcode 变更必须新增或更新 `docs/mcode-architecture-notes/` 下的 Markdown note。
- Dark-mode styling must use existing `--up-*` uview runtime variables; do not introduce `--mcode-*` color aliases.
- The adaptation must not require mobile clients to understand raw Codex `session_info_update._meta.codex.goal`.
- Existing generic `ToolCallBlock` and `ToolCallGroupBlock` behavior must remain unchanged for non-goal tool calls.

---

## File Structure

- `mcode-app/src/types/acp.ts`: extend local content part and tool call contracts with optional goal-run presentation fields and preserved raw output.
- `mcode-app/src/services/conversation/goalToolCall.ts`: focused parser/grouping helpers for goal synthetic tool calls.
- `mcode-app/src/components/GoalToolCallBlock.vue`: compact mobile goal card component.
- `mcode-app/src/components/MessageBubble.vue`: use goal grouping before generic tool grouping and render goal cards.
- `mcode-app/src/stores/conversationRuntime.ts`: preserve `tool_call` event status/output/error on the initial event.
- `mcode-app/src/pages/conversation-detail/detailDataNormalization.ts`: preserve optional raw output during detail normalization.
- `mcode-app/src/services/conversation/conversationDetailPersistence.ts`: preserve optional raw output during local persistence mapping.
- `mcode-app/tests/services/goalToolCall.spec.ts`: helper behavior tests.
- `mcode-app/tests/stores/conversationRuntime.spec.ts`: realtime completed goal tool-call preservation regression.
- `mcode-app/tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts`: source-contract check that the bubble renders goal cards before generic tool grouping.
- `docs/mcode-architecture-notes/2026-07-05-p64-goal-tool-call-adaptation.md`: architecture/protocol/native replication note.

### Task 1: Goal Tool-Call Parser And Grouper

**Files:**
- Modify: `mcode-app/src/types/acp.ts`
- Create: `mcode-app/src/services/conversation/goalToolCall.ts`
- Test: `mcode-app/tests/services/goalToolCall.spec.ts`

**Interfaces:**
- Produces: `normalizeGoalToolName(name?: string): "create_goal" | "update_goal" | null`
- Produces: `parseGoalToolCall(toolCall: ToolCall): ParsedGoalToolCall | null`
- Produces: `buildGoalDisplayParts(parts: ContentPart[], isStreaming?: boolean): GoalDisplayPart[]`
- Consumes: existing `ContentPart` and `ToolCall` types.

- [ ] **Step 1: Write the failing helper tests**

Create `mcode-app/tests/services/goalToolCall.spec.ts` with tests for:

```ts
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
    expect(normalizeGoalToolName("Goal updated (active): Ship mobile goal card")).toBe("create_goal")
    expect(normalizeGoalToolName("Goal updated (budget_limited): Ship mobile goal card")).toBe("update_goal")
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

  it("wraps create/update goal markers with intervening content", () => {
    const parts: ContentPart[] = [
      {
        type: "tool_call",
        tool_call: {
          id: "codex-goal-1",
          name: "create_goal",
          input: { objective: "Ship mobile goal card" },
          output: JSON.stringify({ goal: { objective: "Ship mobile goal card", status: "active" } }),
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
          output: JSON.stringify({ goal: { objective: "Ship mobile goal card", status: "complete" } }),
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
})
```

- [ ] **Step 2: Run helper test to verify it fails**

Run: `cd mcode-app && pnpm test:unit -- --runTestsByPath tests/services/goalToolCall.spec.ts`

Expected: FAIL with module not found for `@/services/conversation/goalToolCall`.

- [ ] **Step 3: Implement parser and grouping helpers**

Add the helper module and extend `ContentPart` with presentation-only `GoalRunContentPart` support. The grouping logic must keep non-goal parts in order, treat `create_goal` as start, `update_goal` as end, and flush unfinished runs with `isRunning` equal to the current message streaming state.

- [ ] **Step 4: Run helper test to verify it passes**

Run: `cd mcode-app && pnpm test:unit -- --runTestsByPath tests/services/goalToolCall.spec.ts`

Expected: PASS.

### Task 2: Runtime And Normalization Preservation

**Files:**
- Modify: `mcode-app/src/types/acp.ts`
- Modify: `mcode-app/src/stores/conversationRuntime.ts`
- Modify: `mcode-app/src/pages/conversation-detail/detailDataNormalization.ts`
- Modify: `mcode-app/src/services/conversation/conversationDetailPersistence.ts`
- Test: `mcode-app/tests/stores/conversationRuntime.spec.ts`

**Interfaces:**
- Consumes: `ToolCall.output`, `ToolCall.error`, `ToolCall.status` from initial `tool_call` event payload.
- Produces: live and persisted message content where synthetic goal tool calls keep their completed status and output JSON.

- [ ] **Step 1: Write the failing runtime regression**

Add a test that applies a `tool_call` event with `name: "Goal updated (complete): Ship mobile goal card"`, `status: "completed"`, `rawOutput: "{\"goal\":...}"`, and asserts the live message tool call has `status: "completed"` and `output` set to the raw goal JSON.

- [ ] **Step 2: Run runtime test to verify it fails**

Run: `cd mcode-app && pnpm test:unit -- --runTestsByPath tests/stores/conversationRuntime.spec.ts`

Expected: FAIL because current runtime sets every new tool call to `running` and drops output.

- [ ] **Step 3: Preserve initial tool-call status and output**

Update the runtime `tool_call` branch to assign `status: event.data.status || "running"`, `output: event.data.output || event.data.rawOutput`, and `error: event.data.error`. Update normalization/persistence mappers to retain optional `rawOutput` only as an alias source for `output`, not as a new protocol requirement.

- [ ] **Step 4: Run runtime test to verify it passes**

Run: `cd mcode-app && pnpm test:unit -- --runTestsByPath tests/stores/conversationRuntime.spec.ts`

Expected: PASS.

### Task 3: Goal Card Rendering In MessageBubble

**Files:**
- Create: `mcode-app/src/components/GoalToolCallBlock.vue`
- Modify: `mcode-app/src/components/MessageBubble.vue`
- Test: `mcode-app/tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts`

**Interfaces:**
- Consumes: `buildGoalDisplayParts(parts, isStreaming)` and `parseGoalToolCall(toolCall)`.
- Produces: `GoalToolCallBlock` props `{ start: ToolCall; end?: ToolCall | null; items?: ContentPart[]; isRunning?: boolean; translucent?: boolean }`.

- [ ] **Step 1: Write source-contract checks**

Add assertions that `MessageBubble.vue` imports `GoalToolCallBlock` and `buildGoalDisplayParts`, calls `buildGoalDisplayParts(props.message.content || [], isStreaming.value)`, and handles `part.type === 'goal_run'` before `tool_call_group`.

- [ ] **Step 2: Run source-contract test to verify it fails**

Run: `cd mcode-app && pnpm test:unit -- --runTestsByPath tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts`

Expected: FAIL because the imports and branch do not exist.

- [ ] **Step 3: Implement the goal card**

Create a compact card that shows `目标：<objective>`, status label (`进行中`, `已完成`, `已阻塞`, `预算受限`, `用量受限`, `已暂停`), optional token/duration chips, expandable details, and nested non-goal child parts by reusing existing message part rendering branches where practical. Use only `--up-*` variables.

- [ ] **Step 4: Wire MessageBubble display ordering**

Call `buildGoalDisplayParts` before generic adjacent tool grouping. When encountering `goal_run`, render `GoalToolCallBlock`; non-goal adjacent `tool_call` parts still fold into `ToolCallGroupBlock`.

- [ ] **Step 5: Run source-contract test to verify it passes**

Run: `cd mcode-app && pnpm test:unit -- --runTestsByPath tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts`

Expected: PASS.

### Task 4: Architecture Note And Targeted Verification

**Files:**
- Create: `docs/mcode-architecture-notes/2026-07-05-p64-goal-tool-call-adaptation.md`

**Interfaces:**
- Consumes: completed Task 1-3 behavior.
- Produces: native replication guidance for iOS/Android clients.

- [ ] **Step 1: Write architecture note**

Document that codeg-main normalizes `/goal` into `create_goal` / `update_goal`, mcode-app preserves completed tool-call output, groups goal runs in UI only, and native clients should implement the same parser/card without parsing raw `session_info_update`.

- [ ] **Step 2: Run targeted verification**

Run: `cd mcode-app && pnpm test:unit -- --runTestsByPath tests/services/goalToolCall.spec.ts tests/stores/conversationRuntime.spec.ts tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts`

Expected: PASS, or only unrelated pre-existing failures outside the touched assertions.

