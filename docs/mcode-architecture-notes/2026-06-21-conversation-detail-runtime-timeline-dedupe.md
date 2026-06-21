# Conversation Detail Runtime Timeline Dedupe

## Architecture

`mcode-app` conversation detail now renders from a runtime timeline projection instead of directly concatenating `localTurns`, `optimisticTurns`, and `liveMessage`.

The projection lives in `mcode-app/src/stores/conversationTimeline.ts` as a pure helper. The runtime store remains the owner of mutable session state, but timeline ordering, live-turn shaping, and duplicate suppression are now deterministic and side-effect free.

`LiveMessage` also carries a stable runtime id. When the backend snapshot exposes `live_message.id`, the store keeps that id. When realtime starts before a snapshot is available, the store mints a temporary id and preserves it across later stream/tool updates for the same in-flight reply.

## Protocol And Data Flow

No ACP event schema, SQLite schema, or page template changed.

The runtime render path is now:

1. `localTurns` become `completed` timeline entries
2. optimistic user turns become `optimistic` entries
3. `liveMessage` becomes one `streaming` assistant entry with id `live-<conversationId>-<liveMessageId>`
4. the timeline is deduped by `(role, id)`

Retention rules mirror the safer `codeg-main` behavior for duplicate promotion races:

- user turns keep the first copy, preserving prompt ordering
- assistant and other non-user turns keep the last copy, so a still-streaming live entry wins over an earlier promoted snapshot

`completeTurn` now falls back to the same live-turn id when the ACP event does not provide a canonical turn id. That makes the promoted assistant turn and the in-flight live entry represent the same logical turn, so duplicate promotion or re-bridge races collapse cleanly in the timeline.

## UI Behavior

Visual output stays the same. The detail page still renders the same merged assistant runs and the same message bubble components.

The behavior change is only in race handling:

- if the same assistant reply is promoted into `localTurns` and then re-appears as a still-streaming `liveMessage`, the page shows it once
- if the same live reply is accidentally promoted twice, the page still shows one completed assistant turn
- if a completed assistant turn and a different in-flight assistant turn coexist, both remain visible

## Compatibility

Existing persisted turns, optimistic turns, and realtime snapshots remain compatible.

Older runtime state without `liveMessage.id` still works because the timeline helper falls back to the live timestamp when it has to synthesize a live-turn id. New snapshots simply improve identity stability and dedupe precision.

This change does not require a migration. It only changes how runtime state is projected for rendering.

## Native iOS/Android Guidance

Native clients should mirror the same separation:

- keep mutable runtime session state in the screen/view-model layer
- project a render timeline through a pure helper before binding UI
- give each live assistant reply a stable runtime id and preserve it across stream deltas, tool-call updates, and snapshot hydration
- build the visible live assistant turn id from `conversationId + liveMessageId`
- dedupe render entries by `(role, id)`, keeping first user copy and last assistant copy

Do not push this dedupe down into the message-cell renderer. The renderer should receive an already-clean timeline.
