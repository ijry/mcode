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

Tab change events follow the same identity rule. If a component event carries
both a numeric index and `conversationId`, the detail page resolves the current
index from `conversationId` first and treats the index as fallback only. This
prevents a desktop-created session from shifting tab order and making a stale
index switch the mobile page to the wrong conversation.

When a tab switch arrives while the shell is already switching or the active
conversation is still loading, the target switch is queued but the local
`activeIndex`/swiper `current` is not advanced yet. Visual selection changes
only when the shell can update `conversationId`, `folderId`, runtime state, and
navbar title in the same switch path. This prevents the tab strip from showing a
new conversation while the navbar and active runtime still point to the old one.

This keeps send/stream activity from remounting every pane just because remote
tab row ids changed.

## UI Behavior

- Sending a message no longer remounts the whole detail shell.
- The currently focused tab stays selected after send/sync even when remote
  `tabId` values rewrite and even when another client marks a different tab as
  `is_active`.
- The currently focused tab also stays selected when desktop opens a new
  conversation that shifts the remote tab order.
- Rapid tab taps during loading no longer make the tab strip advance ahead of
  the navbar/current conversation and then snap back.
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

Native tab-bar callbacks should also prefer conversation identity over event
indexes whenever both are present. Treat index-only events as best-effort
fallbacks after the rendered page list has been reconciled.

If a native detail controller is busy loading or already applying a page switch,
store the requested target as pending but keep the selected segment/page on the
currently loaded conversation until the controller can atomically swap the
conversation model and navigation title.
