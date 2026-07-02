# 2026-07-02 Detail Composer Safe Area Style

## Architecture

Conversation detail still keeps the message timeline inside
`ConversationDetailBody` and measures the active `.composer-stack` from the
parent shell. The bottom safe area is now a separate full-width
`.composer-safe-area` layer below the floating composer card.

The input card no longer owns `env(safe-area-inset-bottom)` padding. It is
positioned above the safe area with `bottom: calc(env(safe-area-inset-bottom) +
10rpx)`, while the safe area layer uses `--up-page-bg-color` so page atmosphere
gradients and translucent card effects do not tint the system gesture region.

## Protocol And Data Flow

No backend, database, or runtime protocol changes. The parent page continues to
measure `.composer-stack` and includes its real bottom offset when calculating
message-list bottom padding.

## UI Behavior

The bottom composer appears as a compact floating card above the device safe
area. The safe area remains a stable page-color strip instead of part of the
card background or blur. Expanding tools or composer panels keeps the same
measurement flow because the measured stack height and bottom offset still
reflect the rendered DOM.

## Compatibility

H5, app, and mini-program targets keep the existing `env(safe-area-inset-bottom)`
contract. Devices without a bottom inset get only the small visual breathing
space below the card. Dark mode follows uview runtime variables through
`--up-page-bg-color`, `--up-card-bg-color`, and `--up-border-color`; no new
`--mcode-*` aliases are introduced.

## Native iOS/Android Replication

Native clients should render the composer as a floating card above the platform
safe-area inset. Fill the actual safe-area strip with the page background color,
not the card background or decorative page atmosphere. Timeline bottom padding
should reserve both the measured composer height and the safe-area offset so the
latest message can scroll above the card.
