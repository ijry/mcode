# Conversation List: Refresh On `pet://sessions`

## Scope

Makes the `mcode-app` conversation-list page (`src/pages/conversations/index.vue`)
refresh its conversation cards when the backend emits `pet://sessions`, so a
session that just started, is now waiting on a permission, finished, or errored
shows the right status in the list without the user pulling to refresh.

Previously `pet://sessions` only drove the tabbar badge count; the card list
relied solely on the `conversation://changed` channel.

## Architecture And Data Flow

`pet://sessions` carries a `PetSessionsPayload` (backend `models/pet.rs`):
precomputed `running/waiting/error` counts plus a `sessions[]` array where each
`PetSessionEntry` has `connectionId`, `conversationId`, `folderId`, `agentType`,
`title`, `status`, and an optional pending-permission summary. The backend
rebuilds and de-dupes this payload from authoritative manager + DB state and
emits it only when the serialized payload actually changes, and only for
membership/status transitions — not for high-volume content/tool/thinking
deltas.

The existing subscription (`ensureActiveSessionsSubscription`) already updated
the badge from this payload. It now also triggers a **debounced remote refresh**
of that instance's conversation overview:

1. Each `pet://sessions` event calls `scheduleActiveSessionsOverviewRefresh(instanceKey)`.
2. That debounces (`ACTIVE_SESSIONS_REFRESH_DEBOUNCE_MS`, 400ms) per instance via
   `activeSessionsRefreshTimerMap`, collapsing event bursts.
3. On fire, `refreshOverviewFromRemoteByInstance` resolves the instance to its
   connection using the same maps the local-cache refresh already uses
   (`instanceConnectionKeyMap` → `findConnectedConnectionByKey`, plus the cached
   `connectionFolderSnapshotMap` / `connectionTabSnapshotMap`), then delegates to
   the existing `scheduleOverviewConversationRefresh` (which itself de-dupes
   in-flight refreshes per connection via `overviewRefreshPromiseMap`).

### Why a remote refresh instead of local status patching

The payload's `sessions[]` only lists *active* sessions. A conversation that
just finished drops out of the list, so `pet://sessions` alone cannot signal a
transition to a terminal status. A remote `list_all_conversations` pull is
authoritative for both the "just became active" and the "just finished" cases:
the finished conversation comes back with its correct terminal status
(`pending_review`, etc.). This avoids fragile local status-merging and keeps the
list consistent with the backend. Because the event is backend-deduped and
low-frequency, the debounced pull is cheap.

This is unrelated to the detail-page streaming guard in
`2026-07-12-detail-streaming-no-full-history-refresh.md`: that constrains the
*detail page's* per-event history reload during live streaming; this is a
list-level overview refresh triggered by a deduped, low-frequency membership
event.

## UI Behavior

When any session on a connected instance changes membership/status, the
conversation list re-renders its cards with fresh backend state shortly after
(within the debounce window). Cards for conversations that finished flip to
their terminal status because the remote pull returns it. The tabbar badge
continues to update from the same event as before.

## Compatibility

No ACP schema, SQLite schema, or realtime payload changed. The refresh reuses
existing overview-refresh plumbing and existing per-connection de-dupe. Debounce
timers are cleared on page unload. If the instance's folder/tab snapshots are not
yet cached, the refresh is skipped for that event (a later mount/refresh path
fills the cache), so no unbounded remote calls occur.

## Native iOS/Android Replication Guidance

Native clients should:

- Subscribe to `pet://sessions` on each connected instance and use it both for
  the active-session badge and as a trigger to refresh the conversation list.
- Debounce the refresh per instance to collapse event bursts.
- Refresh from the authoritative backend list rather than patching card statuses
  from the payload directly, because the payload only contains currently-active
  sessions and cannot express a transition to a terminal status (a finished
  session simply disappears from it).
- Reuse any existing per-connection in-flight de-dupe so overlapping triggers do
  not issue redundant list pulls.
- Clear debounce timers when the list screen is torn down.
