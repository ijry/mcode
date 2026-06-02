# Conversation Turn Dedupe Design

**Problem**

`mcode-app` currently persists completed conversation turns from multiple entry points:

- realtime `turn_complete`
- remote detail calibration
- replay / rehydrate paths

Those paths do not share a stable turn identity. The same logical turn can therefore be inserted multiple times into SQLite and then rendered multiple times after page re-entry or calibration.

**Goal**

Make SQLite the single source of truth for completed turns and guarantee that the same logical turn is stored once even if it arrives through realtime, calibration, or replay.

**Approach**

1. Add a stable business-level `dedupe_key` for persisted turns.
2. Enforce uniqueness at the SQLite layer with `(conversation_id, dedupe_key)`.
3. Route every completed-turn write through the same normalization and upsert path.
4. After `turn_complete`, write to SQLite first; only then clear completed runtime state and reload the visible window from SQLite.

**Dedupe Key**

Priority:

1. `remote:<turnId>` when the turn already has a remote canonical id.
2. `event:<turn_complete.turnId>` when only the ACP completion event exposes an id.
3. `fp:<role>:<contentHash>:<timeBucket>` as a fallback fingerprint.

`contentHash` is derived from normalized content parts serialized in a stable order.

**Runtime Model**

- Runtime remains a transient buffer for in-flight optimistic user turns and the live assistant message.
- SQLite is authoritative for completed turns.
- Calibration and replay update SQLite through the same upsert path and then the page rehydrates from SQLite.
- If SQLite write fails, runtime is preserved and the UI keeps the transient view.

**Acceptance Criteria**

- The same logical turn appears once in `conversation_turns` even after `turn_complete`, calibration, and replay all fire.
- Conversation detail renders from SQLite without duplicate turns after re-entry.
- Upward pagination still works from local SQLite data.
