# Detail Status Banner

## Scope

The mobile `mcode-app` conversation detail page now surfaces runtime and
transport health through one top-of-page status banner instead of relying on
small navbar text or composer-only feedback.

## Architecture And Data Flow

The detail page now combines two existing state sources:

1. Conversation runtime session state from `conversationRuntime`, including
   `connecting`, `thinking`, `running_tool`, `waiting_permission`,
   `waiting_question`, `error`, and `apiRetry`.
2. Real-time bridge health from `acpApi`, keyed by remote `instanceKey`, which
   reports whether the shared socket bridge is `connected`, `reconnecting`,
   `error`, `polling`, or `idle`.

`acpApi` emits bridge health when the shared event bridge opens, closes, errors,
or schedules reconnect. The detail page subscribes by the active instance key
and derives one visible banner from the highest-priority state.

## UI Behavior

Banner priority is:

1. Real-time bridge reconnecting or bridge error.
2. Runtime error.
3. API retry in progress.
4. Waiting for permission or waiting for question.
5. Connecting.
6. Long-running thinking/tool execution.

The banner appears below the navbar and above the message list. It is
non-blocking and disappears automatically when the higher-priority state clears.
If `thinking`, `running_tool`, or `connecting` lasts longer than 20 seconds, the
banner upgrades to a long-wait message so the user knows the remote side is
still working.

## Compatibility

This change does not alter ACP payloads, conversation persistence, or event
transport protocols. It only exposes existing bridge lifecycle information to
the UI. The presentation uses uview-plus runtime theme variables with the
`--up-*` prefix.

## Native iOS/Android Replication Guidance

Native clients should implement the same two-layer status model:

- Subscribe to conversation runtime state for per-conversation activity.
- Subscribe to shared transport health for the active remote instance.
- Derive one visible, non-modal banner using the same priority order.
- Show long-wait copy after a stable threshold, without converting it into an
  error automatically.
