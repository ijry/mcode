# MCode P29 Shared Queue Priority And Reorder Design

## Background

P24 introduced a Desktop-hosted shared prompt queue for official CLI sessions.
P25 exposed the queue in the app, P26 persisted queued prompts across Desktop
restart, and P27 added queue policy controls and clear-all. The remaining gap is
operational control over queued work: users can see shared queued prompts, but
they still cannot reorder or prioritize them in a way that survives multi-client
use and Desktop restart.

P29 adds queue reorder and priority controls while keeping Desktop as the only
queue authority.

## Goal

- Let any authenticated paired client reorder a queued Desktop-hosted prompt.
- Let any authenticated paired client mark a queued prompt with a priority tier.
- Keep queue order deterministic across multi-client sessions and Desktop
  restart.
- Broadcast reorder and priority changes to all subscribed clients.

## Non-Goals

- Do not change relay ownership of the queue.
- Do not add mobile-side `codex` or `claude` target agents.
- Do not add new prompt execution semantics.
- Do not change active turn cancellation or queue clear-all behavior.
- Do not add prompt-body auditing or enterprise approval workflows.
- Do not introduce drag-and-drop as a protocol requirement; the app may use it
  later, but P29 only defines the underlying control surface.

## Recommended Approach

Keep the queue item model owned by `mcode-desktop` and extend it with explicit
ordering metadata. Reorder and priority are separate operations:

- Reorder changes the queue position directly.
- Priority changes the sort tier, and Desktop recomputes the visible order
  within the same session.

This keeps the behavior understandable in multi-client scenarios and avoids
mixing policy with manual queue position edits.

## Queue Model

Each queued prompt keeps the existing P24/P26 payload and adds:

```ts
interface HostedQueueItem {
  queueItemId: string
  sessionId: string
  sourceClientId: string | null
  sourceDeviceName: string | null
  status: "queued" | "running" | "cancelled" | "failed"
  priorityTier: "low" | "normal" | "high"
  queuePosition: number
  createdAtMs: number
  updatedAtMs: number
}
```

Rules:

- `queuePosition` is Desktop-owned, 1-based, and stable for display.
- `priorityTier` is an additive sorting hint, not authentication or ownership.
- A queued item keeps its priority and order metadata through Desktop restart.
- Running, cancelled, and failed items are not reorderable.

## Protocol

P29 adds two Desktop proxy commands.

### `acp_reorder_queued_prompt`

Input:

```json
{
  "sessionId": "desktop-session-1",
  "queueItemId": "queue-123",
  "action": "move_up",
  "sourceClientId": "mcode-client-phone"
}
```

`action` values:

- `move_up`
- `move_down`
- `move_top`
- `move_bottom`

Response:

```json
{
  "status": "reordered",
  "sessionId": "desktop-session-1",
  "queueItemId": "queue-123",
  "queuePosition": 1,
  "queueLength": 3
}
```

### `acp_set_queued_prompt_priority`

Input:

```json
{
  "sessionId": "desktop-session-1",
  "queueItemId": "queue-123",
  "priorityTier": "high",
  "sourceClientId": "mcode-client-watch"
}
```

Response:

```json
{
  "status": "updated",
  "sessionId": "desktop-session-1",
  "queueItemId": "queue-123",
  "priorityTier": "high",
  "queuePosition": 1
}
```

Desktop emits shared queue events through the existing `event_push` path:

- `turn_queue_reordered`
- `turn_queue_priority_changed`
- `turn_queue_updated`

Event payloads include `sessionId`, `queueItemId`, `queuePosition`,
`priorityTier`, `sourceClientId`, and timestamps.

## Desktop Behavior

Desktop remains the authoritative queue owner.

Behavior rules:

- Any authenticated paired client may reorder or reprioritize queued items.
- Only queued items for the same Desktop-hosted session are affected.
- If two clients edit the same item concurrently, Desktop applies last-write
  wins and broadcasts the final state to all clients.
- Priority changes do not interrupt the active turn.
- Reorder changes do not change the prompt content or creator identity.
- Queue start order uses `priorityTier` first, then `queuePosition`, with the
  order inside each tier rebuilt deterministically from `createdAtMs` during
  restore and reindex.
- If a queued item becomes running before a reorder arrives, Desktop rejects the
  request with a recoverable `invalid_queue_state` error.
- Desktop exposes capability flags for queue reorder and queue priority in
  health or capability metadata so the app can gate controls safely.

## App Behavior

The shared queue panel should expose two controls:

- Move item up/down or to top/bottom.
- Change priority between low, normal, and high.

Presentation rules:

- Show priority as a chip or label alongside each queued item.
- Keep queued rows visible until Desktop emits a queue lifecycle event or a
  refreshed snapshot changes them.
- If a reorder or priority update fails, show a recoverable toast and leave the
  current order unchanged.

The app must not treat reorder as a local-only presentation change. The Desktop
queue remains the source of truth for every connected client.

## Compatibility

- Older Desktop builds reject the new commands; the app should hide or disable
  reorder/priority controls when the capability is absent.
- Older apps can ignore the new queue events and still render the queue in its
  existing order.
- P29 remains compatible with P24 queueing, P26 persistence, and P27 clear-all.
- Direct Codeg/OpenCode paths are unaffected.

## Testing

Desktop tests:

- Reordering a queued item updates `queuePosition` and broadcasts
  `turn_queue_reordered`.
- Priority updates change the sort order for the same session and broadcast
  `turn_queue_priority_changed`.
- Reorder and priority changes survive Desktop snapshot restore.
- Reordering a running item fails with `invalid_queue_state`.
- Reorder and priority changes do not alter the active turn.

App tests:

- Queue UI shows reorder and priority controls only when the Desktop capability
  exists.
- App handles reorder and priority events without duplicating queue rows.
- Failure to reorder or reprioritize shows a recoverable toast.

## Native iOS/Android Replication

Native clients should treat queue order and priority as shared Desktop session
state, not as local presentation state.

They should:

- Send queue reorder and priority commands through the same Desktop proxy
  surface.
- Re-render the entire shared queue when a reorder or priority event arrives.
- Preserve the active turn and queued items independently.
- Keep official CLI sessions under `targetAgent = mcode-desktop`; do not add
  mobile-side official CLI agents.
