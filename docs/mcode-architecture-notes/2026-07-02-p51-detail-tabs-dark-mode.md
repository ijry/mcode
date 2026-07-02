# 2026-07-02 P51 Detail Tabs Dark Mode

## Architecture

Conversation detail keeps the P44/P50 multi-tab shell and continues to render
the tab strip with `up-tabs` in `shapeMode="capsule"`. P51 scopes the
page-level style override for that tab strip: uview-plus' internal capsule item
background is forced transparent so the app-owned `.detail-tab-pill` remains
the only visible selected-tab surface. The outer tab bar itself is square-edged
and overrides the runtime card radius at this call site.

## Protocol And Data Flow

No backend, ACP, opened-tabs, SQLite, runtime, or routing changes. Tab data,
selection, swiper sync, slash command hydration, and local tab state persistence
continue to follow the existing detail tab flow.

## UI Behavior

In dark mode, the detail tab bar uses uview runtime variables for the container
background and border. The active tab visual is the blue pill inside the slot;
uview-plus' default white capsule active background no longer leaks above or
below it. The outer tab bar no longer has rounded corners. Light mode keeps the
same active-pill behavior.

The message list top offset reserves only the fixed top chrome, currently the
tabs strip. History loading/no-more text belongs to the interactive pane and is
not added again to the scroll-view margin, preventing a duplicated vertical gap
between the tabs and first message.

Mounted `ConversationDetailInteractivePane` instances receive the page-level
slash command list from the live snapshot. Each pane filters commands from its
own composer text and applies the selected command back into that pane's local
draft.

## Compatibility

The change is scoped to `.detail-tabs-bar` and does not affect other `up-tabs`
instances. The slash command panel remains client-only and reuses the existing
snapshot command normalization. It uses existing `--up-*` runtime theme
variables already present in the page and introduces no `--mcode-*` color
aliases.

## Native iOS/Android Replication

Native clients should treat the tab bar container and tab item selection as
separate layers. The container follows the current theme card/background and
border colors. The platform tab-control default selected background should be
disabled or made transparent when a custom selected pill is rendered inside the
item, otherwise dark mode can show light strips around the custom pill.

Native clients should pass the current snapshot's command list into each
mounted detail pane rather than storing slash state globally. The pane should
show command suggestions only when its local draft ends with a slash trigger and
write the selected command back to that same local draft.
