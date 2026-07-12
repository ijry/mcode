# P68 Conversation List Realtime Refresh Design

## Goal

Make the `mcode-app` conversation list update automatically when a session starts,
waits for input, finishes, or errors, without requiring manual pull-to-refresh.

## Scope

P68 only changes the conversation-list overview refresh path. It does not include
the detail-page `user_message` synthesis, streaming backfill throttling, or tab
stability changes from `fix/detail-realtime-user-message-and-tab-stability`.

## Architecture

The list page already subscribes to the low-frequency `pet://sessions` global
event per remote instance to update the tabbar active-session badge. P68 reuses
that subscription as the refresh trigger for overview cards.

On every `pet://sessions` payload, the page updates the badge as before and
schedules a debounced refresh for that `instanceKey`. The refresh resolves the
current connection and cached folder/tab snapshots, then reuses the existing
`scheduleOverviewConversationRefresh` path. That path pulls
`list_all_conversations`, persists summaries into the local repository, rebuilds
the connection group, and de-dupes overlapping in-flight refreshes.

## Data Flow

1. `ensureActiveSessionsSubscription(instanceKey)` subscribes to
   `acpApi.subscribeGlobalEvent("pet://sessions", ..., instanceKey)`.
2. The handler updates `activeSessionBadgeCountMap` and applies the tabbar badge.
3. The same handler calls `scheduleActiveSessionsOverviewRefresh(instanceKey)`.
4. A per-instance timer collapses event bursts for 400ms.
5. `refreshOverviewFromRemoteByInstance(instanceKey)` finds the connected
   connection, folder snapshot, and opened-tab snapshot for that instance.
6. `scheduleOverviewConversationRefresh(...)` fetches authoritative conversation
   summaries and replaces the displayed connection group.

## Rationale

`pet://sessions` is a better list refresh trigger than the detail stream because
it represents membership/status transitions, not high-volume content deltas. A
remote refresh is safer than local patching: the payload only lists active
sessions, so a completed session disappears from the payload and cannot be
reliably assigned its terminal status without asking the backend.

## Error Handling

If the instance is unknown, the connection is gone, or cached folder/tab
snapshots are not available, the refresh is skipped. If the remote pull fails,
the existing overview refresh warning path handles it and the current UI remains
unchanged. Timers are cleared on page unload.

## Testing

Verification should run the relevant unit tests that cover active-session badge
and overview snapshot behavior, plus a Vue/TypeScript check if available in the
local environment.

## Compatibility

No protocol, database schema, or payload shape changes are required. Older
clients continue using `pet://sessions` only for badges; newer clients also use
it as a debounced list-refresh trigger.

## Native iOS/Android Replication

Native clients should subscribe to `pet://sessions` per connected instance,
update active-session badges from the payload, and debounce an authoritative
conversation-list refresh per instance. Do not derive terminal card status from
the payload alone because inactive completed sessions are absent from it.
