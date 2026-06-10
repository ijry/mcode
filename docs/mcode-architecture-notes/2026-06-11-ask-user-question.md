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

## Mobile UI

The card renders in `pages/conversation-detail/index.vue` above the composer, next to the existing permission card pattern. It supports:

- single-select and multi-select questions;
- 1-4 question sets in one card;
- option labels and descriptions;
- `(Recommended)` suffix rendered as a visual "推荐" badge while preserving the original label in submitted answers;
- a built-in `其他` free-text option for every question;
- `跳过` and `提交` actions.

The submit button is enabled only after every question has one selected label or non-empty `其他` text. Failed submissions keep the card open for retry.

## Native iOS/Android Replication

Native clients should model this as a composer-docked live card, not a modal route. Keep it near the input area so the user understands it is blocking the current agent turn.

Recommended native state model:

- session field: `pendingQuestion: PendingQuestionState?`;
- status enum value: `waitingQuestion`;
- per-card local state keyed by per-question `id`: selected labels, `otherActive`, `otherText`;
- answer submission method matching the `acp_answer_question` payload above.

Native UI should preserve the protocol labels exactly in `labels`, including labels that end in `(Recommended)`. Only the visible text should strip the suffix and show a recommendation badge.

Compatibility rule: if a client does not support `question_request`, CodeG may leave the agent blocked until another supported client answers. A native implementation should therefore handle both realtime events and snapshot recovery before enabling this feature for that client.
