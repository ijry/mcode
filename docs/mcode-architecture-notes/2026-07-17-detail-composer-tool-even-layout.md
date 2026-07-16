# Detail Composer Tool Even Layout

## Scope

The conversation detail bottom composer tool row keeps all visible tools evenly
distributed across the available composer width. This applies to image, file,
quick reply, model config, and stop controls.

## UI Behavior

- `.input-tool-row` remains a single horizontal flex row with a small fixed gap.
- Each `.input-tool-btn` uses equal flex weight (`flex: 1`) and `min-width: 0`,
  so adding or removing tools does not leave the row left-packed.
- Icon capsules keep their fixed visual size inside the equal-width hit targets.
- Translucent, sweet, summer, and cyber themes reuse the same layout contract and
  only change colors/backgrounds.

## Protocol And Data Flow

No ACP, relay/direct gateway, websocket, persistence, draft, queue, attachment,
or permission data flow changes. The change only affects composer tool row
presentation.

## Compatibility

The layout uses standard flex behavior supported by H5 and uni-app app builds.
Native iOS and Android clients should render the same row as equal-weight
children with fixed-size centered icon capsules, not as fixed-width buttons
packed from the left.
