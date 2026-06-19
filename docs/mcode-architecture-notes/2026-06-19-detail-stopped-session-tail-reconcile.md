# Detail Stopped Session Tail Reconcile

## Scope

Fixes a mobile `mcode-app` detail-page case where opening a stopped conversation
could show stale locally cached turns until the user tapped refresh.

## Architecture And Data Flow

Conversation detail still renders local SQLite turns first for fast open. After a
local-cache hit, the page now runs a background remote `get_folder_conversation`
calibration unless the runtime has volatile in-flight state.

Volatile state means optimistic outgoing turns, a live assistant message, a
pending permission request, or a pending question. Persisted local turns alone
are renderable but not volatile, so they must not block remote detail
calibration.

The calibration persists the remote detail snapshot into SQLite and reloads the
newest local turn window. This lets stopped conversations pick up the final
assistant turn that may have arrived after the previous local cache write.

## UI Behavior

The detail page can still paint immediately from cache. If the cache is missing
the final stopped-session message, the background calibration updates the visible
message list without requiring a manual refresh.

Active streaming, optimistic sends, permission prompts, and question prompts are
not overwritten by this background reload.

## Compatibility

No protocol changes are required. The change only refines the mobile client's
cache reconciliation guard and uses the existing detail snapshot persistence
path.

## Native iOS/Android Replication Guidance

Native clients should distinguish "renderable cache exists" from "volatile
runtime state exists". Local persisted messages should enable fast first render
but should not suppress a remote detail calibration for a stopped conversation.

Skip the calibration reload only when replacing local messages would overwrite
in-flight UI state: optimistic user turns, live assistant content, pending
permission, or pending question. Otherwise persist the remote detail snapshot and
reload the newest message window from local storage.
