# MCode Codeg 0.15 Conversation Sync Design

## Context

`mcode-app` currently creates and manages conversations through `codeg` web APIs, but its integration model is still partly pre-0.15:

1. It relies on local seeding plus manual overview reload after create.
2. Rename currently uses a non-standard `update_conversation` command instead of the 0.15 web API split endpoints.
3. It does not consume the new global `conversation://changed` side-channel introduced by `codeg` 0.15.

The target environment is explicit: the user will upgrade `codeg` separately, and `mcode-app` only needs to support `codeg 0.15+`.

## Goal

Make `mcode-app` align with `codeg 0.15+` conversation sync semantics so that:

1. Conversations created from `mcode-app` appear in desktop `codeg` in real time.
2. Renames, deletes, and conversation status changes initiated from `mcode-app` also reflect in desktop `codeg` in real time.
3. `mcode-app` itself consumes the same global conversation-change events, so both clients converge on the same summary state model.

## Non-Goals

1. No changes to `codeg-main` in this repository.
2. No backward compatibility for `codeg < 0.15`.
3. No new viewer-attach or shared live-connection work in this task.
4. No broad conversation detail runtime refactor beyond what is required for status propagation.

## Recommended Approach

Adopt the `codeg 0.15+` global conversation summary event model directly in `mcode-app`.

This means:

1. `mcode-app` continues to call standard backend write APIs for create, delete, title update, and status update.
2. `mcode-app` adds a global event subscription for `conversation://changed`.
3. The app updates its local SQLite-backed summary cache from `upsert`, `deleted`, and `status` payloads.
4. The conversations overview page refreshes from local state changes rather than depending only on manual dirty flags and ad hoc remote reloads.

This is the smallest change that matches the server’s intended sync mechanism and guarantees that `mcode-app`-originated writes flow through the same broadcast path the desktop client already listens to.

## Event Model

`codeg 0.15+` emits a global side-channel event named `conversation://changed` with payload variants:

1. `upsert`
   Carries a full conversation summary row. Used for create and metadata updates such as title changes.
2. `deleted`
   Carries only the conversation id. Used for soft-delete removal from sidebar state.
3. `status`
   Carries conversation id plus status string. Used for lightweight running-state transitions.

`mcode-app` must treat this channel as the source of truth for overview sync across clients.

## MCode Changes

### 1. Normalize Conversation Write APIs

`mcode-app` must call the 0.15-compatible endpoints:

1. `create_conversation`
2. `update_conversation_title`
3. `update_conversation_status`
4. `delete_conversation`

The current rename flow still calls `update_conversation`, which does not match the 0.15 web handler contract. That must be replaced with `update_conversation_title`.

Create and delete already use the standard command names and should remain on that path.

### 2. Add Global Conversation Change Subscription

Add a lightweight service in `mcode-app` that listens to the instance event socket and filters frames where:

1. `channel === "conversation://changed"`
2. payload `kind` is one of `upsert`, `deleted`, or `status`

This listener must be per remote instance, not per page, because the event channel is instance-wide and should survive page transitions.

### 3. Update Local Summary Cache from Global Events

When the listener receives:

1. `upsert`
   Convert the remote summary into the existing `ConversationSummaryRecord` shape and `upsertConversationSummary(...)`.
2. `deleted`
   Remove or mark deleted in the local summary repository for that instance key.
3. `status`
   Read the current local summary row and patch only the normalized status plus `updatedAt`.

This keeps the existing SQLite-first overview model intact while switching its write-through source from manual fetches to realtime global summary changes.

### 4. Refresh Overview Reactively

The conversations overview page should subscribe to a small local invalidation signal exposed by the new global sync service.

When a summary row changes because of `conversation://changed`, the page should:

1. mark the overview state dirty
2. refresh from local persisted summaries
3. avoid forcing unnecessary full remote fetches unless required for missing project context

The existing `markConversationListDirty()` flag can remain, but it should no longer be the only way create/rename/delete propagate into the page state.

### 5. Preserve Existing Local Optimism

`mcode-app` should keep its current local optimistic behavior after create:

1. create conversation
2. optionally seed local summary immediately
3. open detail page

But once `conversation://changed` arrives, that event becomes authoritative and should reconcile any local seed state.

This avoids regressions in perceived responsiveness while still converging on the server-broadcast summary.

## File Responsibilities

### `mcode-app/src/pages/conversations/index.vue`

Responsibilities:

1. use `update_conversation_title` for rename
2. subscribe to overview invalidation from the new global sync service
3. refresh rendered groups/history from local summary updates

### `mcode-app/src/api/acp.ts`

Responsibilities:

1. expose the standard title/status update methods if missing
2. expose or reuse a low-level global event subscription path for non-ACP-channel events
3. normalize socket payloads that arrive as `{ channel, payload }`-style global frames

### `mcode-app/src/services/conversation/...`

Add a new focused service for global conversation sync.

Responsibilities:

1. connect per-instance global event listener
2. parse `conversation://changed`
3. write summary mutations into SQLite
4. notify page-level consumers that overview data should refresh

### `mcode-app/src/services/db/repositories/conversationRepository.ts`

Responsibilities:

1. support update/delete operations needed by realtime summary sync if missing
2. keep all summary writes instance-scoped

## Data Flow

### Create from MCode

1. User creates a conversation in `mcode-app`.
2. `mcode-app` calls `create_conversation`.
3. Upgraded `codeg 0.15+` emits `conversation://changed` `upsert`.
4. Desktop `codeg` sidebar updates from that event.
5. `mcode-app` global listener receives the same event and upserts the same summary locally.
6. Overview page refreshes from local state.

### Rename from MCode

1. User renames a conversation in `mcode-app`.
2. `mcode-app` calls `update_conversation_title`.
3. `codeg 0.15+` emits `conversation://changed` `upsert`.
4. Desktop and `mcode-app` both converge on the new title.

### Delete from MCode

1. User deletes a conversation in `mcode-app`.
2. `mcode-app` calls `delete_conversation`.
3. `codeg 0.15+` emits `conversation://changed` `deleted`.
4. Desktop removes it immediately.
5. `mcode-app` removes or tombstones the local summary and refreshes the overview.

### Status Change from MCode

1. `mcode-app` activity causes conversation status changes server-side.
2. `codeg 0.15+` emits `conversation://changed` `status`.
3. Desktop and `mcode-app` both patch the status chip without opening the conversation.

## Error Handling

1. If the global event listener fails to initialize, `mcode-app` should log a warning and continue using the current manual refresh path.
2. If a `status` event arrives for a missing local summary, the app should skip the patch and rely on the next `upsert` or manual reload.
3. If an `upsert` payload lacks required identifiers, ignore it and log once per event.
4. Global event handling must never throw through the socket frame handler.

## Testing

### Manual verification

1. Upgrade desktop `codeg` to 0.15+.
2. Connect `mcode-app` directly to that desktop web service.
3. Create a conversation in `mcode-app`; confirm it appears in desktop sidebar without manual refresh.
4. Rename the same conversation in `mcode-app`; confirm desktop title updates without manual refresh.
5. Delete the conversation in `mcode-app`; confirm desktop removes it without manual refresh.
6. Trigger a status transition from `mcode-app`; confirm desktop status chip changes live.
7. Confirm `mcode-app` overview also updates when another client performs the same operations.

### Regression checks

1. Existing create flow still opens detail immediately after create.
2. Local summary persistence still works after app re-entry.
3. History view and overview grouping do not duplicate rows after `upsert`.
4. Relay mode remains unchanged if its backend does not forward the global event channel yet.

## Risks

### Risk 1: Event payload shape differs slightly between websocket runtimes

Mitigation:

1. normalize decoded socket frames centrally
2. support both direct payload and wrapped payload shapes

### Risk 2: Overview refresh becomes too eager

Mitigation:

1. refresh from local SQLite first
2. avoid full remote reload on every global event

### Risk 3: Existing local seed conflicts with later authoritative upsert

Mitigation:

1. keep `upsertConversationSummary(...)` idempotent by conversation id + instance key
2. let server-broadcast payload overwrite local seed fields

## Acceptance Criteria

1. `mcode-app` rename uses `update_conversation_title`, not `update_conversation`.
2. `mcode-app` listens for `conversation://changed` on direct connections.
3. `upsert`, `deleted`, and `status` are persisted into the local conversation summary store.
4. The conversations overview refreshes from those local mutations without requiring manual pull-to-refresh.
5. After upgrading `codeg` to 0.15+, actions initiated from `mcode-app` are reflected in desktop `codeg` in real time.
