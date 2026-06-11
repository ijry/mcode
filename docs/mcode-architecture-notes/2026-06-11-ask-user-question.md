# mcode Ask User Question Support

## Scope

This change adds mobile support for CodeG's `ask_user_question` human-in-the-loop flow. The feature lets an agent ask 1-4 multiple-choice questions, block while waiting for the user's answer, then continue with a structured result.

## Protocol

CodeG emits ACP events:

- `question_request`: carries `question_id` and `questions`.
- `question_resolved`: carries `question_id` and clears the active prompt.

The live session snapshot may include `pending_question` with the same shape, so clients must restore the card after refresh, reconnect, or mid-turn attach.

The answer API is `acp_answer_question` with camelCase JSON:

```json
{
  "connectionId": "connection-id",
  "questionId": "question-id",
  "answer": {
    "declined": false,
    "answers": [
      { "questionId": "per-question-id", "labels": ["Option label"] }
    ]
  }
}
```

Skipping sends `{ "declined": true, "answers": [] }`.

## Runtime State

`conversationRuntime` now stores `pendingQuestion` independently from `pendingPermission`. It derives a new runtime status, `waiting_question`, when a question is active. This status disables sending, participates in shared-live "in progress" gating, and is cleared by `question_resolved`, turn completion, disconnect, or newer stream/tool activity.

Question state is not persisted as completed conversation history. It is live turn state, recovered from CodeG snapshots while the tool call is still blocked.

Completed transcripts persist the same interaction as a generic tool call. The tool input is the agent-authored `{ "questions": [...] }` payload. The tool output is preferably a structured envelope:

```json
{
  "answers": [
    {
      "header": "提问",
      "question": "是否接受复合游标方案?",
      "selected": ["复合游标 (Recommended)"]
    }
  ],
  "declined": false
}
```

For compatibility with older or alternate agent bridges, clients must also parse the human-readable fallback text:

```text
The user answered your question(s):
1. [提问] 是否接受复合游标方案?
   → 复合游标 (Recommended)
```

Declined text containing "dismissed the question" maps to `{ "declined": true, "answers": [] }`.

## Mobile UI

The card renders in `pages/conversation-detail/index.vue` above the composer, next to the existing permission card pattern. It supports:

- single-select and multi-select questions;
- 1-4 question sets in one card;
- option labels and descriptions;
- `(Recommended)` suffix rendered as a visual "推荐" badge while preserving the original label in submitted answers;
- a built-in `其他` free-text option for every question;
- `跳过` and `提交` actions.

The submit button is enabled only after every question has one selected label or non-empty `其他` text. Failed submissions keep the card open for retry.

Historical answered questions render through `ToolCallBlock` as a specialized read-only `AskQuestionResultBlock` instead of the generic expandable tool JSON view. The compact row shows a question icon, title `提问`, and either the selected labels, `用户已跳过`, `等待用户选择`, or `提问失败`. Expanding the row reveals per-question prompt text and answer chips. Labels ending in `(Recommended)` keep the original submitted value but render the suffix as a `推荐` badge. Values that do not match an offered option are treated as free-text `其他` answers.

## Native iOS/Android Replication

Native clients should model this as a composer-docked live card, not a modal route. Keep it near the input area so the user understands it is blocking the current agent turn.

Recommended native state model:

- session field: `pendingQuestion: PendingQuestionState?`;
- status enum value: `waitingQuestion`;
- per-card local state keyed by per-question `id`: selected labels, `otherActive`, `otherText`;
- answer submission method matching the `acp_answer_question` payload above.

Native UI should preserve the protocol labels exactly in `labels`, including labels that end in `(Recommended)`. Only the visible text should strip the suffix and show a recommendation badge.

For conversation history, native clients should detect `ask_user_question` tool calls by canonical names such as `question`, `ask_user_question`, `mcp__codeg-mcp__ask_user_question`, or by an input payload containing a non-empty `questions` array. Render them as a compact answered-question card rather than a generic tool log. Parse structured JSON first and use the text fallback only when structured output is unavailable; text fallback splits selections on `, ` and is therefore lossy for labels containing commas.

Compatibility rule: if a client does not support `question_request`, CodeG may leave the agent blocked until another supported client answers. A native implementation should therefore handle both realtime events and snapshot recovery before enabling this feature for that client.
