# MCode Force-Kill Recovery Design

## Goal

Make `mcode-app` recover an in-progress conversation correctly after the mobile app process is killed and later reopened.

## Problem

When the app is force-killed, in-memory runtime state is lost and lifecycle hooks may not run. Recovery must rely on persisted connection configuration, local SQLite state, and `codeg-server` live connection discovery. The current `conversation_runtime` table is keyed only by `conversation_id`, so two remote instances with the same conversation id can overwrite each other's runtime state.

## Design

1. Store runtime state by `(instance_key, conversation_id)` instead of only `conversation_id`.
2. Keep a migration path for old `conversation_runtime` tables by rebuilding the table and preserving existing rows.
3. Update runtime repository APIs to require `instanceKey` when reading, saving, or clearing runtime.
4. Update conversation detail recovery to resolve the instance key before loading runtime state.
5. Refresh remote authentication before cold-start detail fetches, so relay sessions can recover from expired access tokens.
6. Persist runtime state immediately after a successful reconnect/snapshot hydrate, not only during page hide/unload.

## Testing

Add focused Jest tests for runtime repository behavior:

- Two instances can store the same conversation id without overwriting each other.
- `saveDraftState` preserves existing runtime fields within the same instance.

Run the existing unit test suite after implementation.
