# P64 Detail Scroll Follow Guard

## Architecture

Conversation detail keeps the existing bottom-follow model: each detail view owns `shouldAutoFollowBottom`, `hasUnreadBelow`, and its scroll-to-bottom FAB. P64 only fixes how the page decides whether the user is near the bottom.

The near-bottom calculation now lives in `detailScrollState.resolveNearBottomState(...)`. It uses `scroll-view`'s reported viewport height when available and falls back to the measured message-list viewport height. It no longer derives viewport height from `scrollHeight - deltaY - scrollTop`, because that expression can become equal to the remaining distance during manual upward scroll and incorrectly mark the user as still at bottom.

## Data Flow

1. `scroll-view` emits `scrollTop`, `scrollHeight`, and sometimes `height`.
2. The shell `index.vue` passes `height` plus `detailViewportHeight - topChromeHeight` as fallback.
3. `ConversationDetailInteractivePane.vue` passes `height` plus parsed `messageListPageStyle.height` as fallback.
4. `resolveNearBottomState(...)` returns `canMeasure`, `nearBottom`, and `distanceToBottom`.
5. The page updates `shouldAutoFollowBottom` only when `canMeasure` is true.
6. Realtime message watchers keep using the existing rule: if `shouldAutoFollowBottom` is false and an assistant delta arrives, set `hasUnreadBelow` and do not scroll.

## UI Behavior

When the user is at the tail, streaming assistant updates still follow the bottom automatically.

When the user manually scrolls upward, subsequent realtime assistant updates no longer pull the viewport back to the bottom. The lower-right scroll-to-bottom FAB remains visible, and its unread dot appears when assistant content changes below the current reading position.

Tapping the FAB clears the unread flag, re-enables bottom-follow, and scrolls to the bottom anchor.

## Compatibility

No ACP, realtime, SQLite, opened-tabs, route, or persistence protocol changes.

The helper is pure presentation logic and preserves the existing 72 px near-bottom threshold. If neither the event height nor the measured fallback height is available, the page leaves the previous bottom-follow state unchanged instead of guessing.

## Native iOS/Android Replication Guidance

Native clients should keep bottom-follow state inside each detail controller/page. On scroll:

1. Read `scrollTop`, total content height, and actual viewport height from the native scroll view.
2. If viewport height is unavailable, use the last measured message-list viewport height.
3. Compute `distanceToBottom = max(0, contentHeight - (scrollTop + viewportHeight))`.
4. Set `nearBottom = distanceToBottom <= 72`.
5. Only auto-scroll realtime deltas when `nearBottom` is true.
6. When `nearBottom` is false, show the page-local scroll-to-bottom button and an unread-below indicator instead of changing the scroll position.
