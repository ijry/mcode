# 2026-07-01 Detail iOS Scroll View Safe Area

## Architecture

Conversation detail keeps the multi-tab `swiper` shell and the internal message
`scroll-view`, but bottom spacing is now owned by one source: the measured
floating composer stack. The parent page measures the active swiper page's
`.composer-stack` and uses that height, plus the stack's actual distance from
the viewport bottom, as `.message-list__content` padding.

The outer detail document is not a scroll container. `.detail-container` is
fixed to the viewport and hides overflow, while the internal message
`scroll-view` owns vertical scrolling. This prevents iOS Safari and iOS Chrome
from rubber-band scrolling the page itself when the user drags on the composer,
which otherwise moves the absolute composer away from the screen bottom.

The timeline remains an internal `scroll-view`, not page-level scrolling. This
preserves independent scroll positions for each mounted `swiper` tab. Page-level
scrolling has only one global `scrollTop`, so it would require manual save and
restore on every tab switch and can visibly jump during `swiper` transitions.

Each mounted `ConversationDetailInteractivePane` owns the interaction state for
its tab. That includes the internal scroll position, the oldest loaded history
cursor, and the plan drawer state. The parent shell only measures the active
page and should not host interaction affordances that belong to one tab.

The `up-navbar` uses `placeholder=true`, so the navbar already occupies normal
document flow above the multi-tab `swiper`. The shell `swiper` therefore uses
`windowHeight - navbarHeight`; otherwise the page becomes
`navbarPlaceholder + windowHeight` tall and H5 can drag the outer page by roughly
one top bar. The tabs strip is `position: fixed`, so it is not subtracted from
the shell height. It is counted only as message-list top chrome so messages do
not render underneath it.

If `.composer-stack` cannot be measured, the page falls back to the older row
sum of status, input row, tool row, and a fixed gap.

## Protocol And Data Flow

No backend protocol changes. The only data flow change is local layout
measurement: the active `ConversationDetailInteractivePane` emits
`layout-change`, and the parent recalculates scroll padding from the active
page only.

Older-history loading is local to the active pane. The pane rebuilds its oldest
loaded DB cursor from `conversation_turns`, calls `getOlderTurns()` when the
internal message `scroll-view` reaches the top, prepends those turns into the
runtime session, and restores the previous first visible message via
`scroll-into-view`. This keeps each swiper tab's history paging independent.

## UI Behavior

The bottom anchor remains available for `scroll-into-view`, but it is now a
fixed 34rpx spacer and does not add `env(safe-area-inset-bottom)`. The composer
already includes the platform safe area in its real DOM height, so adding the
safe area again at the scroll anchor created an extra bottom gap in iOS
home-screen fullscreen mode.

Composer chrome changes, such as expanding the tool row or quick reply panel,
now trigger a layout sync so the scroll padding follows the current composer
height.

The compact plan pill in the input status row opens a bottom `up-popup` from the
same interactive pane. The drawer filters task state from the tab's own
messages and live content, so tapping a plan in one tab cannot show another
tab's plan data.

## Compatibility

H5 iOS standalone mode and normal Safari should no longer receive duplicated
bottom safe-area spacing inside the message scroll content. Normal browser H5,
app, and mini-program layouts keep the same scroll contract because they use the
measured composer height instead of hard-coded safe-area math.

iOS Safari and iOS Chrome expose different browser chrome heights, so web
implementations must not depend on page-level document scrolling for composer
placement. The page frame is locked; only the active timeline `scroll-view`
scrolls.

## Native iOS/Android Replication

Native clients should reserve message timeline bottom space from the measured
composer container height, including any safe-area padding already applied to
that composer. Do not add a second safe-area inset to the bottom scroll anchor.
The bottom anchor should be only a small breathing spacer used as a scroll
target.

Native clients that embed the detail page in a pager should keep the message
timeline as the only vertical scroll container. If a native navigation
placeholder is in layout flow above the pager, subtract it from the pager
height. Fixed tab strips should be treated as timeline top insets, not pager
height.

The composer should be positioned inside the locked pager frame. Each native
pager page should own its own timeline scroll state instead of sharing one
global page scroll position across tabs.
