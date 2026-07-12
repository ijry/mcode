# P69 Detail Connecting Dedupe Design

## Goal

Reduce repeated `正在连接智能体...` blockers on the MCode App conversation
detail page by avoiding unnecessary runtime reconnect transitions. The blocker
should remain visible for a real first-time agent connection, but it should not
flash when the app is only refreshing, resuming, switching mounted tabs, or
reusing an already-bound connection.

## Problem

The detail page shows the blocker when `runtimeStatus === "connecting"`. Several
normal lifecycle paths call `runtime.connect(...)`, including page load, foreground
resume, manual refresh, tab switching, background mounted-tab hydration, and
send-time recovery.

`runtime.connect(...)` currently sets `session.status = "connecting"` before it
checks whether a managed connection already exists. As a result, even a cheap
reuse path briefly drives the UI into `connecting`. Concurrent page initialization
can also call `runtime.connect(...)` more than once for the same `conversationId`,
because there is no per-conversation in-flight connection reuse in the runtime
store.

## Scope

- Add runtime-level reuse for an existing managed connection before entering
  `connecting`.
- Add per-`conversationId` in-flight connection request deduplication.
- Keep the existing detail-page blocker and wording for genuine connection work.
- Add focused tests for existing-connection reuse and concurrent connect reuse.
- Add or update one Markdown note under `docs/mcode-architecture-notes/` during
  implementation.

P69 does not redesign the detail blocker UI, change ACP protocol payloads, or
change backend connection reuse behavior.

## Approaches Considered

Recommended: fix the runtime state transition and connection dedupe at the
source. This prevents both meaningless UI flicker and duplicate connection work.

Alternative: delay the blocker by 300-500ms. This hides short flicker but still
allows duplicate connection calls and can delay useful feedback on slow real
connections.

Alternative: suppress the blocker only in the detail page when messages are
already rendered. This is presentation-only and risks letting users interact
during a real reconnect transition.

## Architecture

The runtime store remains the source of truth for detail connection state. P69
adds a module-local map of in-flight connect promises keyed by `conversationId`.
`connect(...)` first checks `connectionSessionManager.getByConversationId(...)`.
If a usable managed connection already exists, it binds the runtime session to
that connection, stores the connection info, keeps or restores a non-connecting
status, and returns without setting `session.status = "connecting"`.

If no existing connection is available, `connect(...)` checks the in-flight map.
A second caller for the same conversation receives the same promise instead of
starting a second connection. Only the first caller performs discovery, snapshot
adoption, `connectionSessionManager.connectConversation(...)`, realtime attach,
and status transitions.

## Data Flow

1. Detail page calls `runtime.connect(conversationId, agentType, ...)`.
2. Runtime looks for an existing managed conversation connection.
3. If found, runtime binds `session.connectionId`, `session.instanceKey`, and
   `connections`, then returns the managed `ConnectionInfo` without entering
   `connecting`.
4. If no existing connection is found and another connect is already running for
   that conversation, runtime returns the in-flight promise.
5. Otherwise runtime starts a new connection attempt, sets `connecting`, performs
   the existing discovery/adoption/connect flow, attaches realtime, and clears
   the in-flight entry in `finally`.

## UI Behavior

The detail blocker continues to show only when runtime status is `connecting`.
After P69, it appears for actual new or recovered agent connections, not for
ordinary refreshes that reuse an already-bound connection.

If a connection attempt fails, the existing runtime error path still sets
`status = "error"` and shows the error feedback instead of leaving the blocker
up.

## Compatibility

No protocol, storage schema, gateway, or backend changes are required. Existing
desktop and native clients remain compatible. The change is local to MCode App's
runtime session management.

## Testing

Add store-level unit coverage:

- Calling `connect(...)` with an existing managed connection returns it without
  calling `connectConversation(...)` and without setting `connecting`.
- Two concurrent `connect(...)` calls for the same conversation share one
  `connectConversation(...)` call and end with the same bound `connectionId`.
- Failed connection attempts clear the in-flight guard so a later retry can run.

Run the focused conversation-runtime test suite after implementation.

## Native iOS/Android Replication

Native clients should apply the same state rule: do not enter a visible
connecting state when rebinding an already-known live conversation connection.
Only show the blocking connecting affordance when a new connection or recovery
handshake is actually underway, and dedupe concurrent connect calls by
conversation id.
