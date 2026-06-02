# MCode Conversation Runtime Rearchitecture Design

**Date:** 2026-06-02  
**Status:** Approved for planning  
**Owner:** mcode team

## 1. Context and Goals

`mcode-app` conversation detail currently relies on:

1. Per-page runtime state held only in memory.
2. Polling (`acp_poll_events`) instead of a real-time shared event stream.
3. Full-detail fetches for history loading instead of local incremental reads.
4. Page-level teardown on back navigation, which destroys live state and slows restore.

This causes four visible problems:

1. Dynamic updates are incomplete and laggy.
2. Large conversations load and render too much data at once.
3. Returning to a conversation detail page does not restore state fast enough.
4. The current transport model does not scale to many conversations across many remote `codeg` instances.

The new design must satisfy these goals:

1. Real-time updates become first-class.
2. Conversation data becomes local-first using SQLite.
3. Detail pages load only the newest slice by default and page older history from local storage.
4. Conversation detail runtime survives page exit and restores quickly on re-entry.
5. The transport model supports multiple remote `codeg` instances in the same app session.

## 2. Scope and Non-Goals

### In Scope

1. Replace polling-based ACP event delivery in `mcode-app` with a shared attach-based real-time stream per remote instance.
2. Add SQLite-backed local persistence for conversation lists, turns, parts, and runtime metadata.
3. Change conversation detail to local-first load, default newest 10 turns, upward local pagination, and hot restore.
4. Keep conversation-to-ACP-runtime mapping as `conversation : connection = 1 : 1`.
5. Add remote-detail calibration as a controlled fallback path.

### Non-Goals (This Rearchitecture)

1. Replacing every existing list page with a virtualized renderer in the first delivery.
2. Building a full event-sourcing platform around raw event logs.
3. Supporting Mini Program as a first-class target in this phase.
4. Removing `get_folder_conversation` entirely in the first version.

## 3. Approved Architecture Direction

Adopt **instance-level shared real-time transport + local-first SQLite cache + hot conversation runtime**.

This design follows three approved constraints:

1. **Priority order:** `A → B → C`
   - A: real-time transport first
   - B: local storage and paging second
   - C: detail-page keepalive and restore third
2. **Transport authority:** service-side protocol changes are allowed.
3. **Conversation runtime model:** conversation and ACP connection remain `1:1`; only the underlying socket is shared.

## 4. Core Architecture

### 4.1 Instance-Level Shared Transport

The app must not use one global WebSocket for all remotes. The correct model is:

1. Each remote `codeg` instance gets one `remoteInstanceKey`.
2. Each `remoteInstanceKey` owns one shared real-time transport.
3. Multiple ACP connections under the same instance multiplex on that shared transport.
4. Different remote instances stay isolated in transport, auth, reconnection, and failure handling.

`remoteInstanceKey` is derived from:

- mode (`direct | relay`)
- base URL
- account/session identity needed to isolate auth context

### 4.2 Conversation-to-Connection Mapping

The app must preserve:

- one conversation → one ACP connection
- one ACP connection → one active live runtime

This keeps ACP semantics aligned with `codeg` web behavior. Sharing is done at the transport layer, not by merging multiple conversations into one ACP runtime.

### 4.3 Local-First Read Model

UI pages read from local SQLite first:

1. Conversation list reads local summary rows.
2. Conversation detail reads local runtime state plus the newest persisted turns.
3. Remote fetches are fallback or calibration paths, not the primary render path.

### 4.4 Hot Runtime Preservation

Returning from conversation detail must not destroy live runtime state. The active conversation remains alive in memory and continues receiving events. Re-entering the detail page restores from:

1. in-memory hot cache if available
2. otherwise SQLite runtime cache
3. otherwise remote calibration

## 5. Runtime Modules

The runtime is split into the following modules.

### 5.1 `RealtimeTransportRegistry`

Responsibilities:

1. Build and maintain one shared event transport per `remoteInstanceKey`.
2. Reconnect transport on failure.
3. Re-attach active subscriptions after reconnect.

### 5.2 `EventStream`

Responsibilities:

1. Attach and detach ACP connection subscriptions.
2. Route `snapshot / replay / event / detached` frames by `subscription_id`.
3. Maintain `lastAppliedSeq` per subscription.

### 5.3 `ConnectionSessionManager`

Responsibilities:

1. Manage `conversationId ⇄ connectionId ⇄ remoteInstanceKey`.
2. Spawn or resume ACP connections.
3. Own connection lifecycle and keepalive.

### 5.4 `ConversationRepository`

Responsibilities:

1. Read and write SQLite tables for conversations, turns, parts, folders, runtime metadata, and sync cursors.
2. Expose stable domain methods so page/store layers never call the SQLite plugin directly.

### 5.5 `ConversationSyncService`

Responsibilities:

1. Consume real-time frames.
2. Update runtime state in memory.
3. Write durable state into SQLite.
4. Trigger remote calibration when event delivery is incomplete or stale.

### 5.6 `ConversationCacheStore`

Responsibilities:

1. Hold hot in-memory runtime for opened conversations.
2. Restore detail-page state quickly on re-entry.
3. Track scroll anchor, draft queue, attachments, live message, optimistic turns, and current composer text.

## 6. SQLite Data Model

SQLite is the primary local store for the conversation domain.

### 6.1 `remote_instances`

Columns:

- `instance_key` (PK)
- `mode`
- `base_url`
- `auth_meta`
- `last_seen_at`

### 6.2 `folders`

Columns:

- `id`
- `instance_key`
- `name`
- `sort_order`
- `updated_at`

### 6.3 `conversations`

Columns:

- `id`
- `instance_key`
- `folder_id`
- `title`
- `agent_type`
- `external_id`
- `connection_id`
- `status`
- `last_turn_id`
- `last_message_at`
- `unread_count`
- `is_pinned`
- `deleted_at`
- `updated_at`

### 6.4 `conversation_turns`

Columns:

- `id`
- `conversation_id`
- `instance_key`
- `role`
- `created_at`
- `seq`
- `status`
- `version`

### 6.5 `conversation_parts`

Columns:

- `id`
- `turn_id`
- `conversation_id`
- `part_index`
- `type`
- `payload_json`
- `updated_at`

### 6.6 `conversation_runtime`

Columns:

- `conversation_id`
- `instance_key`
- `connection_id`
- `live_message_json`
- `optimistic_json`
- `draft_queue_json`
- `attachments_json`
- `scroll_anchor`
- `composer_text`
- `last_applied_seq`
- `last_snapshot_at`
- `is_active`

### 6.7 `sync_cursors`

Columns:

- `instance_key`
- `connection_id`
- `subscription_id`
- `last_seq`
- `last_sync_at`

### 6.8 Optional `event_log`

First delivery does not require event log as a system of record. It may be added later for diagnostics or replay support.

## 7. Real-Time Protocol and Sync Strategy

### 7.1 Protocol Model

For each remote instance, one shared transport carries many ACP subscriptions. Each attach stream must support these server frames:

1. `snapshot`
2. `replay`
3. `event`
4. `detached`

Required identifiers:

- `subscription_id`
- `connection_id`
- `seq`

`conversation_id` should be present in event payloads when available; if not present, the client resolves route using `connectionId ⇄ conversationId`.

### 7.2 Attach Flow

1. Create or resume ACP connection for a conversation.
2. Read local `last_seq` from `sync_cursors`.
3. Attach the connection to the instance transport using that cursor.
4. Handle one of:
   - snapshot only
   - snapshot + replay
   - replay + live event continuation

### 7.3 Event Application Rules

1. Reject any event where `seq <= last_applied_seq`.
2. Apply state changes to hot in-memory runtime first.
3. Persist to SQLite asynchronously but in order.
4. Advance `last_applied_seq` only after successful application.

### 7.4 Persistence Boundaries

- `status_changed` updates `conversations.status`
- `stream_batch` updates only runtime live state
- `tool_call` and `tool_call_update` update runtime live state
- `turn_complete` promotes runtime content into durable `conversation_turns` + `conversation_parts`
- `usage_update` updates runtime/session stats

The durable history boundary is `turn_complete`. Streaming updates should not rewrite historical turns repeatedly.

### 7.5 Remote Calibration

`get_folder_conversation` remains as a controlled fallback in phase 1. Calibration runs only when:

1. local cache is empty on first open
2. snapshot is incomplete
3. `turn_complete` needs authoritative post-persist reconciliation
4. reconnect detects lag or detached replay failure
5. user manually refreshes

## 8. Detail Load, Pagination, and Restore

### 8.1 Detail Open Sequence

On entering conversation detail:

1. restore from hot `ConversationCacheStore` when present
2. otherwise restore runtime metadata from `conversation_runtime`
3. load the newest 10 persisted turns from SQLite
4. only then decide whether remote calibration is needed

### 8.2 Default Window

Initial detail render uses the newest 10 turns:

1. query `conversation_turns` by `seq desc` or `created_at desc`
2. reverse results into display order
3. mark `oldestLoadedSeq` and `hasMoreHistory`

### 8.3 Upward Local Pagination

When the user scrolls near the top:

1. query 20 older turns before `oldestLoadedSeq`
2. join their `conversation_parts`
3. prepend to UI
4. preserve scroll anchor so content does not jump

Pagination reads local SQLite only. It must not issue remote detail requests while the user scrolls.

### 8.4 Live State Handling

Live streaming content remains outside the persisted turn list until `turn_complete`. The detail page renders:

1. persisted turns from SQLite
2. optimistic turns from runtime
3. live streaming content from runtime

After `turn_complete`, the live segment becomes a durable turn and is merged into the loaded detail list.

### 8.5 Back Navigation Keepalive

Back navigation must not disconnect the ACP connection. The following state survives:

- live message
- optimistic turns
- draft queue
- attachments
- composer text
- scroll anchor

The detail page restores these values instantly on re-entry.

## 9. Implementation Strategy

### Phase A1 — Shared Real-Time Transport

1. Add attach-based real-time protocol support on the service side.
2. Implement `RealtimeTransportRegistry` in `mcode-app`.
3. Replace `acp_poll_events` as the primary update path.

### Phase A2 — Conversation Runtime Mapping

1. Replace the current flat `conversationRuntime` assumptions with `conversationId + connectionId + instanceKey`.
2. Support snapshot, replay, live events, and detached recovery.

### Phase B1 — SQLite Integration

1. Use `laoqianjunzi-sqlite` as the initial implementation path.
2. Keep all plugin calls behind repository interfaces.
3. Add schema migration and initialization.

### Phase B2 — Local-First Detail

1. Read newest 10 turns locally.
2. Move history pagination to local SQLite.
3. Keep remote calibration as a fallback only.

### Phase B3 — Local-First List

1. Read conversation list from SQLite.
2. Update summary rows on turn completion and status change.

### Phase C1 — Hot Detail Restore

1. Keep detail runtime alive after page exit.
2. Restore live state and scroll anchor on re-entry.

### Phase C2 — Cleanup and Recovery

1. Add LRU cleanup for stale hot sessions.
2. Add forced calibration when replay gap cannot be recovered.

## 10. Risks and Mitigations

### Risk 1: Plugin compatibility between `uni-app-x` SQLite package and current `uni-app`

Mitigation:

1. Keep direct plugin usage inside one DB layer.
2. Build a migration test page and smoke tests before moving business logic.

### Risk 2: Event payloads may not fully identify conversation ownership

Mitigation:

1. Use `connectionId ⇄ conversationId` as the primary route key.
2. Require service-side event shape review before final implementation.

### Risk 3: Snapshot and detail calibration can fight each other

Mitigation:

1. Define explicit authority boundaries:
   - streaming authority: runtime
   - persisted authority: SQLite
   - reconciliation authority: calibrated detail fetch
2. Never overwrite active runtime with stale detail data.

### Risk 4: Large conversation growth can bloat the local database

Mitigation:

1. Start with full-cache retention as approved.
2. Add later cleanup policy only after instrumentation shows need.

## 11. Testing Strategy

### Unit-Level

1. Event dedup by `seq`
2. Snapshot + replay merge
3. `turn_complete` promotion from runtime to persisted tables
4. Pagination window assembly
5. Re-entry state restore

### Integration-Level

1. One remote instance with multiple live conversations
2. Multiple remote instances in one app session
3. WS reconnect with replay
4. Forced calibration after stale cursor
5. Back navigation and instant detail restore

### Performance Checks

1. Time to open conversation detail from local cache
2. Time to restore active detail after back navigation
3. Time to prepend 20 older turns from SQLite
4. Memory growth with many hot conversations

## 12. Final Recommendation

Implement **phase 1 using the target architecture of instance-level shared transport + SQLite primary cache**, but keep **remote detail calibration** as a deliberate fallback path.

This yields:

1. a transport model aligned with `codeg`
2. local-first performance and pagination
3. safe migration from today’s polling/in-memory runtime
4. a clean path toward a stricter event-driven model later without redoing the data boundaries
