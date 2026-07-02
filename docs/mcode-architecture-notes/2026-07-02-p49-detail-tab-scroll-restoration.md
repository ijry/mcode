# 2026-07-02 P49 Detail Tab Scroll Restoration

## Architecture

The conversation detail shell keeps the P47 multi-tab `swiper` host, but
vertical scroll affordances now belong to each mounted
`ConversationDetailInteractivePane`. The parent shell still owns navbar, tab
membership, active page selection, and active-page measurement. The child pane
owns its internal `scroll-view`, bottom-follow state, unread-below flag,
history cursor, history loading state, and the scroll-to-bottom FAB.

Each pane uses conversation-scoped DOM anchor ids for message anchors and the
bottom spacer. This prevents multiple mounted swiper pages from sharing
`message-list-bottom` or `msg-*` ids while `scroll-into-view` resolves a target.

## Protocol And Data Flow

No backend, ACP, realtime, SQLite, or opened-tabs protocol changes.

Realtime deltas still enter `conversationRuntime` by `conversationId`. The
active pane watches its own rendered timeline. When bottom-follow is enabled,
the pane re-arms `scroll-into-view` by clearing the current target and setting
the scoped bottom anchor on the next tick, so repeated streaming updates can
trigger a real scroll even when the target id is unchanged.

Older-history loading remains local SQLite pagination:

1. derive the oldest loaded cursor from the pane's local turns
2. call `getOlderTurns(conversationId, cursor, 20)` on top reach
3. prepend mapped turns into that conversation runtime session
4. restore the previous first visible message through a scoped message anchor

## UI Behavior

The top history row is visible again. It shows `上滑加载更早消息` when older
local turns exist, `历史加载中...` during pagination, and `没有更多历史了` when
the loaded runtime turns cover local history.

The lower-right FAB is rendered inside the active pane, not by the shell. It
appears only when the active pane has messages and is not in bottom-follow mode.
Tapping it resets the pane's unread flag and scrolls that pane to its scoped
bottom anchor.

## Compatibility

Existing route, opened-tabs, realtime, and local persistence contracts are
unchanged. The parent shell no longer renders a global scroll-to-bottom button,
so inactive mounted tabs cannot accidentally control the active visual pane.

Scoped anchor ids preserve the old unscoped values when no scope is supplied,
so older parent code and tests that still call `bottomAnchorId()` or
`messageAnchorId(id)` keep their previous output.

## Native iOS/Android Replication

In native paged detail screens, keep scroll position, bottom-follow state,
unread-below state, history cursor, history loading text, and scroll-to-bottom
button inside each page/controller. Do not put a global FAB in the pager host
unless it forwards to the active page's own scroll controller.

When a live message grows and the page is following bottom, force the scroll
target to refresh even if the logical bottom target is unchanged. Native
clients can do this by posting the scroll request after layout on each timeline
delta.
