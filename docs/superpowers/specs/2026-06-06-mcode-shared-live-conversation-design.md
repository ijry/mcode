# MCode Shared Live Conversation Design

## Context

`mcode-app` currently treats a conversation runtime as locally owned once the detail page connects:

1. Opening a conversation can create or adopt a connection using snapshot metadata, but the model does not explicitly distinguish local owner vs remote viewer.
2. Disconnect semantics are local-first and can end up assuming the page that opened the detail view also owns the live connection lifecycle.
3. Send eligibility is derived from local status only, not from a shared multi-client conversation ownership model.

The user’s intended workflow is cross-device and frequent:

1. Desktop starts a conversation and enters live streaming.
2. `mcode-app` opens the same conversation later and should join that same live session.
3. `mcode-app` may also start live first, with desktop joining later.

The server target is `codeg 0.15+`, which already supports:

1. `acp_find_connection_for_conversation`
2. attaching to an already-live conversation connection
3. shared cross-client real-time streaming

## Goal

Make `mcode-app` participate correctly in shared live conversations across desktop and mobile/web clients so that:

1. Opening a conversation that already has a live connection reuses that connection instead of creating another one.
2. If another client is actively processing a turn, the newly opened `mcode-app` view becomes a viewer and is prevented from sending until the turn ends.
3. When the current live turn finishes, `mcode-app` becomes send-capable again.
4. Closing `mcode-app` while another client is still viewing or the turn is still active must not tear down the shared live connection.
5. The behavior works for both direct and relay gateway modes, assuming relay transparently forwards the 0.15+ APIs and websocket frames.

## Non-Goals

1. No `codeg-main` changes in this repository.
2. No backward compatibility for `codeg < 0.15`.
3. No broad rewrite of conversation persistence or SQLite schema.
4. No attempt to support simultaneous dual-send during the same live turn.

## User-Approved Runtime Rules

The following rules were explicitly chosen:

1. **Send rule:** both ends may send when the conversation is idle.
2. **Turn conflict rule:** when one end is currently live (`thinking`, `running_tool`, `waiting_permission`, or equivalent in-progress state), the other end may open and watch, but may not send.
3. **Connection retention rule:** if one client closes its detail page while another client is still watching or the turn is still active, the shared live connection must remain alive.
4. **Mode scope:** support both `direct` and `relay`.

## Recommended Approach

Adopt a **server-discovered shared-connection model** on the client:

1. When `mcode-app` opens a conversation, it first asks the server whether a live connection already owns that conversation.
2. If one exists, `mcode-app` adopts it as a shared live connection and attaches as a viewer/client on that existing runtime.
3. If none exists, `mcode-app` creates a fresh connection and becomes the owner of the local connection reference.
4. Send availability is computed from the current shared role plus live status, not just from local page state.
5. Page exit detaches local listeners and local mapping, but does not eagerly disconnect the remote shared live connection.

This matches the `codeg 0.15+` architecture and avoids duplicated live connections for the same conversation.

## Shared Connection Model

### Roles

`mcode-app` must track one of two roles per live conversation:

1. `owner`
   The local client created the live connection because none existed when it opened or resumed the conversation.
2. `viewer`
   The local client found an already-live connection for that conversation and attached to it.

These roles are **client-side coordination metadata**, not separate backend connection types.

### Shared Live Flags

Each managed conversation connection should carry:

1. `role: "owner" | "viewer"`
2. `sharedLive: boolean`
3. `detachOnly: boolean`
4. `allowSend: boolean`

Recommended semantics:

1. `sharedLive`
   True when the conversation is currently using a server-discovered live connection that can outlive the local page.
2. `detachOnly`
   True when local cleanup must not call remote disconnect.
3. `allowSend`
   Derived field updated when role or status changes.

## Conversation Open Flow

When opening detail for an existing conversation:

1. Read local cache / persisted detail as today.
2. Before creating a new ACP connection, call `acp_find_connection_for_conversation(conversationId)`.
3. If the server returns a live connection:
   - adopt that connection id
   - mark role as `viewer`
   - mark `sharedLive = true`
   - attach realtime stream to that connection
   - hydrate from snapshot
4. If the server returns no live connection:
   - create a connection through the current `acp_connect` path
   - mark role as `owner`
   - mark `sharedLive` depending on whether later viewers may join
   - attach realtime stream and hydrate as usual

This check must happen in both `direct` and `relay` modes through the existing gateway abstraction.

## Send Gating

### Allowed States

`mcode-app` may send when:

1. the conversation runtime is idle / connected / completed-equivalent
2. there is no active in-progress turn owned elsewhere

### Blocked States

`mcode-app` must block send when:

1. role is `viewer`
2. the shared conversation is in progress

In practice this means blocking while runtime status is any of:

1. `thinking`
2. `running_tool`
3. `waiting_permission`
4. any mapped server status equivalent to `in_progress`

### Recovery

When the active turn ends and the conversation returns to an idle state:

1. `allowSend` becomes true again
2. `mcode-app` may send from the same detail page
3. before actually sending, the client should re-check `acp_find_connection_for_conversation`
4. if a live connection still exists, reuse it
5. if no live connection exists anymore, create one and promote local role to `owner`

This avoids stale assumptions about whether the live backend connection was retained or already cleaned up.

### UI Feedback

When send is blocked, the UI must fail clearly rather than silently. Recommended message:

`该会话正在其他端处理中，当前仅可旁观，待本轮结束后可发送`

The send button may stay visible but should be disabled or guard-clicked with this feedback.

## Cleanup Semantics

When `mcode-app` leaves the detail page for a shared live conversation:

1. detach realtime subscriptions
2. remove local page/runtime mapping
3. do **not** call `acp_disconnect` just because the page closed

This applies to:

1. `viewer`
2. `owner` under this shared-live design

Rationale:

1. another client may still be attached
2. the current live turn may still be running
3. the server is the correct place to decide final connection lifetime

The local app should treat detail-page exit as “stop viewing locally”, not “destroy the shared live session”.

## Data Flow

### Desktop First, MCode Second

1. Desktop opens conversation and enters live.
2. `mcode-app` opens the same conversation.
3. `mcode-app` calls `acp_find_connection_for_conversation`.
4. Server returns the existing connection id.
5. `mcode-app` adopts it as `viewer` and attaches.
6. `mcode-app` renders the same live stream.
7. `mcode-app` cannot send until the current turn ends.

### MCode First, Desktop Second

1. `mcode-app` opens conversation and enters live.
2. Desktop opens the same conversation later.
3. Desktop attaches to the existing live connection.
4. If `mcode-app` closes detail, the live connection remains available for desktop.

### Idle After Shared Turn

1. Shared turn completes.
2. Runtime status returns to idle.
3. `viewer` side becomes send-capable again.
4. On next send, it re-checks whether a live connection still exists and either reuses it or creates a new one.

## File Responsibilities

### `mcode-app/src/api/acp.ts`

Responsibilities:

1. expose `acpFindConnectionForConversation(conversationId)`
2. normalize the returned connection payload

### `mcode-app/src/types/acp.ts`

Responsibilities:

1. add `ConversationConnectionInfo`
2. keep status and snapshot typing aligned with `codeg 0.15+`

### `mcode-app/src/services/conversation/connectionSessionManager.ts`

Responsibilities:

1. track shared-live role metadata
2. adopt an existing live connection as `viewer`
3. keep cleanup semantics explicit
4. avoid eager remote disconnect on page close

### `mcode-app/src/stores/conversationRuntime.ts`

Responsibilities:

1. open flow checks `acp_find_connection_for_conversation` first
2. compute and update `allowSend`
3. re-check live ownership before sending after idle recovery

### `mcode-app/src/pages/conversation-detail/index.vue`

Responsibilities:

1. reflect shared-live state in the UI
2. block send while viewer + in-progress
3. show a clear “watch-only until turn ends” message
4. avoid disconnecting shared live runtime on exit

## Error Handling

1. If `acp_find_connection_for_conversation` fails, log a warning and fall back to the current local connect path.
2. If viewer attach succeeds but later realtime attach fails, show existing load/connect error handling and allow refresh/retry.
3. If send re-check fails when recovering from idle, fall back to the safe path:
   - try local create connection
   - if that also fails, show send error
4. Any role/allowSend recomputation must be defensive and never throw through realtime handlers.

## Risks

### Risk 1: Relay mode may not transparently forward the discovery endpoint

Mitigation:

1. implement through the existing gateway abstraction
2. on failure, log and fall back to current connect behavior

### Risk 2: Local disconnect cleanup could still tear down shared sessions accidentally

Mitigation:

1. centralize cleanup decisions in `connectionSessionManager`
2. make “remote disconnect” an explicit exceptional path, not the default

### Risk 3: Allow-send state becomes stale after mid-turn reconnect

Mitigation:

1. recompute on every relevant `status_changed`
2. re-check live connection existence before first send after idle recovery

## Testing

### Manual verification

1. `mcode-app` starts a live turn, then desktop opens the same conversation:
   - desktop must join the same live stream
2. desktop starts a live turn, then `mcode-app` opens the same conversation:
   - `mcode-app` must join the same live stream
3. while one side is live, the other side tries to send:
   - send is blocked with a clear message
4. after the turn completes, the blocked side tries to send again:
   - send is allowed
5. `mcode-app` opens live first, desktop joins, then `mcode-app` exits detail:
   - desktop live stream continues
6. repeat the same verification in both direct and relay modes

### Regression checks

1. conversations with no existing live connection still open normally
2. creating a new live connection still works from `mcode-app`
3. existing SQLite-backed detail restore still works
4. shared live does not create duplicate visible assistant streams

## Acceptance Criteria

1. `mcode-app` checks `acp_find_connection_for_conversation` before creating a new live connection for an existing conversation.
2. When a live connection already exists, `mcode-app` reuses it instead of creating a duplicate connection.
3. A viewer cannot send while another client’s turn is in progress.
4. A viewer becomes send-capable again after the turn ends.
5. Exiting `mcode-app` detail does not tear down a shared live session another client is still using.
6. The behavior works through both direct and relay gateway paths when backed by `codeg 0.15+`.
