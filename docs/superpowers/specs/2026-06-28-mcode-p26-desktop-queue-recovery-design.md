# MCode P26 Desktop Queue Recovery Design

## Background

P24 added Desktop-hosted prompt queues for official CLI sessions and P25 made
those queues visible and cancellable in the app. The remaining commercial
readiness gap is restart behavior: queued prompts are still held only in
`AppState.queued_prompts`, so a Desktop restart drops work that users already
submitted from phone, watch, or another client.

P26 persists only prompts that have not started. It reuses the existing P19
Desktop recovery snapshot and keeps relay transport-only.

## Goals

- Persist not-yet-started Desktop queued prompts in the Desktop recovery
  snapshot.
- Restore queued prompts after Desktop restart so app clients can see and
  cancel them.
- Keep active provider turns non-resumable; running sessions still become
  `Interrupted` through P19.
- Avoid storing official CLI tokens or pair secrets in queue snapshots.
- Keep queue restoration conservative: restored queued prompts do not
  auto-start immediately during Desktop boot.

## Non-Goals

- Do not persist running active turns.
- Do not add a relay-side queue store.
- Do not add queue reorder, priority, bulk cancel, or ownership policies.
- Do not add direct mobile `codex` or `claude` target agents.
- Do not implement provider thread resume for Codex app-server sessions.

## Architecture

Desktop adds a serializable queue record to the P19 recovery snapshot:

```rust
PersistentQueuedPrompt {
  queue_item_id: String,
  session_id: String,
  runtime: CliRuntimeKind,
  agent_type: String,
  payload: serde_json::Value,
  source_client_id: Option<String>,
  source_device_name: Option<String>,
  prompt_preview: Option<String>,
  created_at_ms: u64,
}
```

The in-memory `QueuedPromptItem` keeps `event_sink` as runtime-only state. The
persistent record omits `event_sink`, pair codes, relay tokens, and official CLI
credentials. `payload` is stored because Desktop needs the original prompt
command to run the queued item after recovery; the existing app protocol must
continue to avoid sending official provider tokens through MCode.

Recovery flow:

1. `build_recovery_snapshot(state)` copies `state.queued_prompts` into
   `queuedPrompts`.
2. `load_recovery_snapshot(...)` validates schema as before.
3. `apply_recovery_snapshot(...)` restores queued prompts into
   `state.queued_prompts` after interrupting running CLI sessions.
4. Restored queued items have `event_sink = None`. Future queue events are
   emitted through the current request path or outbound relay sink when a later
   queue operation occurs.
5. Desktop boot does not call `start_next_queued_prompt_if_idle` automatically
   for restored queues.

## Restore Semantics

Restored queues are visible in `desktop_get_health.promptQueue` immediately.
They can be cancelled with `acp_cancel_queued_prompt`. They can start when a
later Desktop-controlled transition calls `start_next_queued_prompt_if_idle`,
for example after a new active turn finishes for the same session.

If a queued item references a session that was running before restart, that
session is restored as `Interrupted`, but the queued item remains. This matches
the product model: the running provider turn cannot be resumed, but not-started
user work is still recoverable and manageable.

## Data Retention

P26 keeps the first slice simple and durable:

- Persist every not-started queued prompt present in memory.
- Preserve original queue order per session.
- Preserve `queueItemId` so app rows remain stable across recovery.
- Do not add expiry or TTL enforcement in P26. A later queue policy phase can
  add retention controls with visible product copy.

## Compatibility

- Snapshots without `queuedPrompts` remain valid and restore an empty queue.
- Existing P19 fields retain the same schema value because the change is
  additive and serde defaults the new field.
- Older Desktop builds ignore the new field if they do not know it.
- Native clients do not need a new protocol command; health and queue lifecycle
  events keep the same P24/P25 shape.

## Testing

Rust tests cover:

- Snapshot build/load/apply preserves queued prompt metadata and order.
- Restored queue appears in `build_health_snapshot(...)`.
- Restored queued items can be cancelled without an active turn.
- Snapshot JSON does not include pair secrets or relay tokens.
- Running CLI sessions still restore as `Interrupted`.

Manual verification:

- Start a Desktop session, queue two prompts, and confirm health shows queue
  count 2.
- Restart Desktop with the same `MCODE_DESKTOP_STATE_PATH`.
- Confirm health still shows the same two queue ids and previews.
- Cancel one queued item from MCode and confirm the row disappears after the
  queue event/state update.

## Native iOS/Android Replication

Native clients should treat restored Desktop queues exactly like live P24 queue
state. They should render the same shared queue panel, keep local drafts
separate, allow queued-item cancel when `queueItemId` exists, and wait for queue
lifecycle events or refreshed health/session state before removing rows.
