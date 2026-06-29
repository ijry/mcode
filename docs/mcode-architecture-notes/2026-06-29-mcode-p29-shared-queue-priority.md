# MCode P29 Shared Queue Priority And Reorder Note

P29 extends the Desktop-hosted shared prompt queue with reorder and priority
controls.

## Architecture

- `mcode-desktop` remains the only queue authority for official CLI sessions.
- Relay keeps transporting proxy commands and event pushes; it does not store
  queue order or priority state.
- App and native clients treat queue order as shared session state, not as a
  local presentation-only list.
- Desktop should expose queue reorder and queue priority capability flags in
  health or capability metadata so clients can hide unsupported controls.

## Data Flow

1. A paired client sends `acp_reorder_queued_prompt` or
   `acp_set_queued_prompt_priority` through the existing proxy path.
2. Relay forwards the request to the Desktop host for the paired session.
3. Desktop mutates the queue item order or priority and recomputes the session
   queue snapshot.
4. Desktop emits `turn_queue_reordered` or `turn_queue_priority_changed` to all
   subscribers through the existing event stream.
5. Connected clients refresh their shared queue view from the event or from the
   next snapshot.

## UI Behavior

- Shared queue rows show a visible priority label.
- Reorder controls act on the Desktop-backed queue, not on a local draft list.
- If a queued item is no longer queued, the app must disable reorder and
  priority actions for that row.
- Clients should gate these controls on Desktop capability metadata instead of
  assuming every hosted session supports them.

## Compatibility

- Older Desktop builds can reject the new commands without affecting queueing,
  cancel-all, or recovery.
- Older clients can ignore the new events and still render the queue in its
  current order.
- P29 does not change `targetAgent` naming or introduce new official CLI target
  agents on mobile.

## Native iOS/Android Replication Guidance

Native clients should mirror the same shared-queue rules:

- Use Desktop as the source of truth for queue order and priority.
- Rebuild the visible queue after reorder or priority events.
- Keep the active turn separate from queued item management.
- Do not store queue priority locally as a replacement for Desktop state.
