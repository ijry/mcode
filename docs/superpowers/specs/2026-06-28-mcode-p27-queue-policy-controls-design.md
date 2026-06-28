# MCode P27 Queue Policy Controls Design

## Background

P24 introduced Desktop-hosted prompt queues, P25 exposed them in MCode, and P26
persisted queued prompts through Desktop restart. The next commercial gap is
operational control: queues need visible limits, safe restored-item retention,
and a way to clear stale queued work without cancelling items one by one.

P27 adds the first policy slice without turning the queue into a full workflow
engine. Desktop remains the queue owner and relay remains transport-only.

## Goals

- Expose Desktop prompt queue policy in health snapshots.
- Enforce queue length through policy instead of a hard-coded constant.
- Drop expired restored queued prompts during recovery.
- Add a Desktop command to cancel all queued prompts for one session.
- Add an MCode app API wrapper and conversation-detail clear action.

## Non-Goals

- Do not implement queue reorder, priority, or scheduling weights.
- Do not implement ownership restriction enforcement in P27.
- Do not add relay-side queue storage or policy state.
- Do not add mobile-side `codex` or `claude` target agents.
- Do not audit full prompt bodies.

## Desktop Policy

Desktop exposes:

```rust
PromptQueuePolicy {
  queue_limit: usize,
  max_restored_age_ms: u64,
  allow_any_client_cancel: bool,
}
```

Defaults:

- `queueLimit = 20`
- `maxRestoredAgeMs = 7 * 24 * 60 * 60 * 1000`
- `allowAnyClientCancel = true`

`queueLimit` replaces the P24 hard-coded limit. P27 does not add a UI/config
screen for changing it; a later Desktop settings phase can make policy
operator-configurable.

## Recovery Expiry

P26 restores all queued prompts. P27 filters restored prompts:

- Keep prompts with `createdAtMs == 0` for backward compatibility.
- Keep prompts whose age is less than or equal to `maxRestoredAgeMs`.
- Drop expired prompts and increment `expiredPromptQueueCount`.
- Add a Desktop diagnostic entry summarizing how many queued prompts expired.

Expired prompts do not emit queue lifecycle events during boot because there is
no active app subscriber yet. App clients learn the current queue from health
or subsequent runtime state.

## Cancel All Command

Add Desktop proxy command:

```json
{
  "command": "acp_cancel_all_queued_prompts",
  "sessionId": "cli-session-id",
  "reason": "user_cancelled_all"
}
```

Response:

```json
{
  "status": "cancelled",
  "sessionId": "cli-session-id",
  "cancelledCount": 2,
  "queueLength": 0
}
```

Desktop emits `turn_queue_cancelled` for each removed item and then persists the
empty queue snapshot. The command only affects queued prompts; it does not
interrupt the active provider turn.

## App Behavior

MCode conversation detail adds a `清空` action in the shared Desktop queue
expanded panel. It is shown only when there is a bound `connectionId` and at
least one shared queue item.

Interaction:

- Tap `清空` calls `acp_cancel_all_queued_prompts`.
- While the request is in flight, the action shows `清空中` and disables itself.
- The app does not optimistically remove rows. P24/P25 lifecycle events remain
  authoritative.
- On failure, show toast `清空队列失败，请稍后重试`.

## Compatibility

- Older Desktop builds reject the new command; the app surfaces a recoverable
  failure toast.
- Health snapshots without policy fields are treated as older Desktop builds.
- Native clients can ignore `promptQueuePolicy` and keep existing queue UI.

## Testing

Desktop tests:

- Health exposes default queue policy.
- Queue overflow still reports `queueLimit` from policy.
- Recovery drops expired queued prompts and records count/diagnostic.
- `acp_cancel_all_queued_prompts` removes only queued items and keeps active
  turn state.

App tests:

- API wrapper sends `/acp_cancel_all_queued_prompts` with connection/session and
  reason.
- Presentation helper disables clear-all when there is no connection, no queue,
  or a clear request is already in flight.
- Existing queued-item cancel tests keep passing.

## Native iOS/Android Replication

Native clients should show clear-all as a shared Desktop queue action, not as a
local draft queue action. They must keep rows until queue lifecycle events or a
refreshed snapshot removes them, and should surface clear failure as a
recoverable toast.
