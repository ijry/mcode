# 2026-07-11 P68 Detail Send Tab Reset Guard

## Architecture

Conversation detail keeps the multi-tab shell (`up-tabs` + `swiper`) and one
`ConversationDetailInteractivePane` per mounted conversation. Remote
`opened_tabs` remains the membership/order source of truth, but page identity
and the currently focused tab on this device stay local.

Backend `save_opened_tabs` fully replaces tab rows and reassigns auto-increment
`id` values. That means remote row ids are not stable across ordinary tab
writes, including CAS saves triggered by prompt/open/sync paths.

## Protocol And Data Flow

No ACP, SQLite, or `opened_tabs` schema change.

When a detail page receives a refreshed `opened_tabs` snapshot:

1. membership and order are rebuilt from the snapshot
2. swiper/page keys are derived from `conversationId`, not remote `tabId`
3. the active page is re-resolved by the current local `conversationId`
4. only if that conversation disappeared does the shell fall back to a safe
   index within the new list

This keeps send/stream activity from remounting every pane just because remote
tab row ids changed.

## UI Behavior

- Sending a message no longer remounts the whole detail shell.
- The currently focused tab stays selected after send/sync even when remote
  `tabId` values rewrite and even when another client marks a different tab as
  `is_active`.
- Switching, closing, and opening tabs continue to use conversation identity
  for page state.

## Compatibility

Compatible with existing remote `opened_tabs` payloads. Older clients that key
by `tabId` can still remount on CAS rewrite; current clients treat
`conversationId` as the stable page identity.

## Native iOS/Android Replication

Native page controllers/view pagers must key pages by conversation id, never by
the remote opened-tab row id. After any `tabs://changed` snapshot, reselect the
page that matches the conversation currently being viewed. Do not jump to the
first tab merely because remote ids or `is_active` changed.
