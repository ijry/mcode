# 2026-07-12 P68 Conversation List Realtime Refresh

## Architecture

Conversation list overview data remains authoritative from the remote
`list_all_conversations` endpoint. The existing `pet://sessions` subscription
now acts as a low-frequency invalidation signal for the list, in addition to its
tabbar badge role.

## Protocol And Data Flow

No ACP, SQLite, or payload schema changes are introduced. For each connected
instance, `pet://sessions` updates the active-session badge and schedules a
400ms debounced overview refresh. The refresh reuses cached folder/opened-tab
snapshots, calls the existing remote overview refresh path, persists summaries,
and replaces the visible connection group.

The refresh is skipped when the instance descriptor, connection mapping, folder
snapshot, or opened-tab snapshot is unavailable. That keeps event handling cheap
during cold start; the normal page-show and pull-refresh paths still populate the
cache.

## UI Behavior

The conversation list updates shortly after a session starts, waits for
permission/question input, finishes, or errors. Completed sessions receive their
terminal status from the backend list response rather than from the active-only
`pet://sessions` payload.

## Compatibility

Existing clients can ignore the extra behavior because the event payload is
unchanged. The change is client-side only and reuses existing overview refresh
and summary persistence code.

## Native iOS/Android Replication

Native clients should subscribe to `pet://sessions` per instance, update badges
from the payload, and debounce an authoritative conversation-list refresh per
instance. Do not infer terminal card status from `pet://sessions` alone because
finished sessions disappear from the active-session payload.
