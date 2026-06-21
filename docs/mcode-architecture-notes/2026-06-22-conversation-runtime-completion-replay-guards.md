# Conversation Runtime Completion Replay Guards

## Architecture

`mcode-app` conversation runtime now keeps a small runtime-only completion guard on each session: the most recent completed-turn key and the time it was handled. This state is not persisted and is reset with cached session cleanup or newly bound conversation runtime state.

The guard complements the timeline projection added earlier. Timeline projection prevents duplicate rendering; the completion guard prevents duplicate `turn_complete` handling from re-running replay calibration after the session has already drained its live and optimistic buffers.

Snapshot hydration also rejects stale live-message replay when a reconnect snapshot carries an assistant response that is older than the newest completed local assistant turn. This prevents a completed reply from being reintroduced as a streaming tail after reconnect.

## Protocol And Data Flow

No ACP schema, SQLite schema, or realtime event payload changes are required.

Completion idempotency key priority:

1. explicit turn/message id from the completion payload
2. realtime event sequence forwarded as `__eventSeq`
3. current live assistant turn id
4. optimistic user turn ids
5. short-lived unknown key for direct duplicate local calls

When a completion arrives after the session is already drained, the runtime ignores it only if it matches the last handled key, or if it is an immediate keyless duplicate within the guard window. Keyed remote events with new sequence numbers still trigger replay-gap calibration, so viewer-side backfill remains possible.

Snapshot live replay is ignored only when all of these are true:

- no current `liveMessage`
- no optimistic user turn
- no pending permission or question
- runtime status is not an in-progress state
- there is a completed local assistant turn whose timestamp is newer than or equal to the snapshot live `started_at`

New live snapshots that start after existing history remain visible.

## UI Behavior

The visible detail page behavior is unchanged except for duplicate prevention:

- repeated `turn_complete` events do not trigger extra replay/calibration work
- stale reconnect snapshots do not append an already completed reply as a live assistant message
- legitimate new in-flight live replies after existing history still render at the tail

## Compatibility

Existing persisted conversation turns and runtime snapshots remain compatible. The new completion guard fields are transient runtime state and require no migration.

If a backend does not send a stable completion id, clients should forward the realtime event sequence into the completion handler. This preserves idempotency without changing the protocol payload itself.

## Native iOS/Android Guidance

Native clients should mirror the same runtime-level behavior:

- store the most recent completed-turn key per open conversation session
- treat duplicate completion events as no-ops only after live/optimistic/pending buffers are drained
- include realtime event sequence in the local completion key when the backend payload has no turn id
- reject reconnect snapshot live messages whose start time is not newer than the latest completed assistant message
- keep this logic outside message-cell rendering; cells should consume an already projected and deduped timeline
