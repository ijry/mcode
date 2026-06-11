# mcode Force-Kill Recovery

## Scope

This change improves mobile recovery when the app process is killed while a conversation is active. The app must cold-start, restore the correct remote connection context, and reattach or reconcile the conversation without relying on `onHide` or `onUnload` having run.

## Recovery Model

`codeg-server` remains the authority for live ACP connections and conversation snapshots. `mcode-app` is a remote client that can lose all in-memory state during force-kill. On cold start, the detail page rebuilds state from:

- saved connection configuration in `mcode_connections`;
- local SQLite conversation summaries and turns;
- local runtime draft state;
- remote `get_folder_conversation`;
- live ACP discovery and session snapshots.

## Runtime Storage Boundary

`conversation_runtime` is now scoped by `(instance_key, conversation_id)`. This prevents two remote CodeG instances with the same numeric conversation id from sharing draft text, attachments, `connection_id`, or realtime cursor state.

The schema migration rebuilds legacy `conversation_runtime` tables whose primary key was only `conversation_id`, preserving existing rows and using the stored `instance_key` when available.

Repository callers must provide `instanceKey` when reading, saving, or clearing runtime state. Empty instance keys intentionally do not read a runtime row.

## Detail Page Behavior

The conversation detail page resolves the remote instance before local runtime hydration. It reads runtime state with the resolved `instanceKey`, then reconnects using the existing live discovery flow.

After a successful `runtime.connect` and after live snapshot hydration, the page persists runtime state immediately. This reduces the force-kill window after reconnect or prompt start where the process could die before `onHide` persists state.

For relay connections, the detail page attempts `refreshAuth()` before cold-start remote detail calls. A successful refresh updates both the active auth store and the saved connection session.

## Remaining Boundaries

This change does not server-side owner/viewer leases. A recovered client still follows the existing live discovery and attach model. If `codeg-server` no longer has a live connection, the client falls back to persisted conversation detail and later resume behavior.

## Verification

Unit coverage was added for runtime repository scoping and draft preservation.

Validated commands:

```bash
pnpm test:unit -- tests/services/runtimeRepository.spec.ts
pnpm test:unit
```

`vue-tsc --noEmit` still reports pre-existing type errors in `src/uni_modules/up-tts/examples/*`; those example errors are outside this recovery change.
