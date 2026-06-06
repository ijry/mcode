# MCode Direct Tauri Conversation Sync Stability Design

## Context

`mcode-app` already has realtime conversation sync, but the direct Tauri path is still fragile:

1. The websocket bridge is effectively driven by the current auth state, not by the target `instanceKey` being synced.
2. The global `conversation://changed` subscription is not fully instance-scoped.
3. Short socket drops do not reliably rebuild the bridge, so detail/runtime and overview state can drift until a manual refresh.
4. Overview refresh still leans too hard on remote reloads instead of consuming the local SQLite summary cache first.

This design only targets the direct Tauri path. Relay behavior stays unchanged.

## Goal

Make direct Tauri sync stable enough that:

1. Overview and detail state stay aligned for the active direct instance.
2. Brief websocket interruptions recover automatically without user action.
3. Global conversation updates are applied only to the matching instance.
4. Local SQLite state becomes the first source for overview refresh after realtime invalidation.

## Non-Goals

1. No `codeg-main` changes.
2. No relay-path refactor.
3. No new UI.
4. No rewrite of the conversation data model.

## Recommended Approach

Use a per-instance bridge registry inside `mcode-app` and treat `instanceKey` as the routing key for both ACP events and global conversation events.

The bridge should:

1. Keep one active websocket session per `instanceKey`.
2. Reconnect with backoff when the socket closes or errors.
3. Preserve per-conversation attach subscriptions across reconnects.
4. Dispatch `conversation://changed` only to listeners registered for the same `instanceKey`.
5. Let overview invalidation trigger a local SQLite refresh first, with remote reload only as fallback.

This keeps the existing architecture, but removes the two main sources of drift: wrong-instance routing and transient disconnect loss.

## Architecture

### 1. Instance-Bound Bridge Registry

`mcode-app/src/api/acp.ts` should stop treating the websocket bridge as a single global connection. It needs an internal registry keyed by `instanceKey` that stores:

1. the target remote descriptor,
2. the active websocket connection,
3. the reconnect timer/state,
4. per-instance ACP event listeners,
5. per-instance global event listeners.

`ensureRealtimeBridge(instanceKey)` should use the descriptor for that exact instance, not the current auth snapshot.

### 2. Reconnectable Event Connection

`mcode-app/src/services/gateway/directGateway.ts` and `mcode-app/src/services/gateway/relayGateway.ts` should expose close/error lifecycle callbacks on the event channel connection.

That lets `acp.ts` detect transient disconnects and reopen the bridge without waiting for a page reload.

### 3. Stable Realtime Transport

`mcode-app/src/services/realtime/event-stream.ts` should support host rebinding so conversation attach subscriptions survive a reconnect instead of being recreated by each page.

That keeps detail/runtime streams alive across brief socket drops.

### 4. Global Conversation Sync

`mcode-app/src/services/conversation/globalConversationSync.ts` should remain the write-through layer for `conversation://changed`, but it must be idempotent per `instanceKey` and must never consume events from the wrong instance.

### 5. Local-First Overview Refresh

`mcode-app/src/pages/conversations/index.vue` should refresh from local summary data after invalidation, and only fall back to remote reload when local cache is missing or incomplete.

## File Responsibilities

### `mcode-app/src/api/acp.ts`

Responsibilities:

1. Hold the per-instance bridge registry.
2. Route global events by `instanceKey` and `channel`.
3. Reconnect direct websocket bridges with backoff.
4. Register the correct remote descriptor for each instance.

### `mcode-app/src/services/gateway/directGateway.ts`

Responsibilities:

1. Surface websocket close/error callbacks.
2. Keep H5 and native socket behavior aligned.

### `mcode-app/src/services/gateway/relayGateway.ts`

Responsibilities:

1. Mirror the same connection lifecycle surface for consistency.
2. Keep relay behavior unchanged otherwise.

### `mcode-app/src/services/realtime/types.ts`

Responsibilities:

1. Extend the event-channel interface with lifecycle hooks needed for reconnect.

### `mcode-app/src/services/realtime/event-stream.ts`

Responsibilities:

1. Rebind transport hosts on reconnect.
2. Reattach active subscriptions when the host becomes ready again.

### `mcode-app/src/services/conversation/globalConversationSync.ts`

Responsibilities:

1. Parse `conversation://changed`.
2. Upsert, delete, or patch the local conversation summary row.
3. Notify overview consumers after local persistence succeeds.

### `mcode-app/src/pages/conversations/index.vue`

Responsibilities:

1. Start global sync for each connected direct instance.
2. Refresh the overview from local summaries first.
3. Keep the existing manual refresh fallback.

### `mcode-app/src/stores/conversationRuntime.ts`

Responsibilities:

1. Continue attaching detail streams using the correct instance-bound bridge.
2. Keep reconnect-sensitive runtime state tied to the managed conversation instance.

## Data Flow

### Overview Load

1. The page discovers connected direct instances.
2. For each instance, it creates a gateway and registers the remote descriptor.
3. `ensureGlobalConversationSync(instanceKey)` attaches the global listener for that instance.
4. The page loads local summary rows from SQLite.
5. If local data is missing, it falls back to a remote fetch and persists the result.

### Global Conversation Update

1. Tauri emits `conversation://changed`.
2. `acp.ts` receives the frame on the bridge tied to that `instanceKey`.
3. `globalConversationSync` normalizes the payload.
4. The local summary row is written or patched in SQLite.
5. The overview invalidation signal fires.
6. The overview page rereads local data.

### Detail Runtime

1. The detail store attaches to the conversation's managed `instanceKey` and `connectionId`.
2. The realtime transport reattaches after reconnect.
3. Replay or snapshot reconciliation heals any brief gap.

### Disconnect / Reconnect

1. The websocket closes or errors.
2. `acp.ts` marks that instance bridge as disconnected.
3. It schedules a reconnect with backoff.
4. Existing listeners remain registered.
5. When the socket comes back, subscriptions rehydrate and event delivery resumes.

## Error Handling

1. If a bridge is requested without a registered descriptor, log a warning and skip instead of using the wrong auth state.
2. If a global payload is malformed, ignore it and keep the bridge alive.
3. If reconnect fails, keep retrying with capped backoff until the listener is detached.
4. If local summary lookup fails, fall back to the existing remote reload path.
5. If a detail replay gap is detected after reconnect, resync from the authoritative snapshot.

## Testing

### Manual

1. Open two direct connections and confirm a `conversation://changed` event from one instance does not update the other.
2. Create, rename, and delete a conversation on the direct Tauri instance and confirm the desktop sidebar and `mcode-app` overview update without manual refresh.
3. Open a conversation detail view, drop the websocket briefly, and confirm the stream resumes after reconnect.
4. Switch between connections and confirm the bridge keeps using the correct instance.

### Static

1. Run TypeScript validation for `mcode-app`.
2. Verify no relay-specific behavior changed.

## Risks

### Risk 1: Reconnect thrash on bad network

Mitigation:

1. exponential backoff with a cap,
2. stop retrying when the listener is explicitly detached.

### Risk 2: Instance routing still depends on auth state somewhere else

Mitigation:

1. use the registered descriptor when building or restoring the bridge,
2. avoid falling back to `auth.currentRemoteInstance()` for bridge identity.

### Risk 3: Local cache looks stale for a moment after a global event

Mitigation:

1. write SQLite first,
2. refresh the page from local state before any remote reload.

## Acceptance Criteria

1. Direct Tauri sync uses the correct `instanceKey` even when multiple connections exist.
2. A brief websocket close no longer requires manual refresh to restore sync.
3. `conversation://changed` only updates the matching instance.
4. Overview refresh is local-first and does not force unnecessary remote reloads.
5. Detail/runtime streams recover after reconnect and continue from the authoritative replay path.
