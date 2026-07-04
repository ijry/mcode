# P63 Conversation Detail Cyber Mode Immersion Design

## Goal

The first P63 cyber mode pass is technically wired but visually misses the target. It looks like the regular light conversation UI with green text on top. This revision turns cyber mode into an intentionally immersive Matrix-style terminal screen.

## Observed Problems

- The page does not force a black terminal base; many cards, tabs, thinking blocks, input shells, and bubbles remain light.
- The binary rain has only a few low-opacity columns, so it reads as decoration instead of a full-screen computer interface.
- The streaming decode overlay is applied to every text part inside a streaming assistant turn. When a turn contains previous tool/thinking/text sections, multiple green overlays stack over old content.
- Cyber styles are split across scoped component boundaries, so selectors in the page stylesheet do not reliably restyle child component internals.

## Selected Approach

Keep the existing storage key, menu toggle, runtime phase derivation, and DOM-based renderer. Strengthen the presentation layer only:

- Make `.page--cyber` an explicit black/green terminal skin, not a tinted version of the default theme.
- Add deep cyber selectors from the page-level stylesheet for child component internals that are imported through `ConversationDetailInteractivePane.vue`.
- Increase the density, opacity, and phase behavior of `ConversationDetailCyberRain.vue`.
- Restrict `MessageBubble` decode to the latest text part of the active streaming assistant message.
- Add a `bubble-wrap--cyber` class so message bubble scoped styles can own bubble-level terminal styling instead of relying only on parent selectors.

## Visual Contract

When enabled:

- The screen base is black or near-black.
- Navbar, tabs, message area, composer, panels, and message bubbles use dark translucent terminal surfaces.
- Green is the dominant signal color: `#00ff41` for active text/glow and darker greens for borders.
- The atmosphere includes scanlines and a denser field of vertical `0/1` rain.
- Historical content stays readable; only the currently streaming assistant tail decodes.

## Decode Contract

`MessageBubble.vue` should render cyber decode only when:

- `cyberModeEnabled` is true
- `cyberActive` is true
- message role is `assistant`
- message status is `streaming`
- the part is the latest non-empty text part in that message
- the text is not complex markdown

All older text parts in the same streaming turn render normally with terminal styling.

## Data And Compatibility

No ACP, realtime, SQLite, opened-tab, route, or runtime schema changes. The global storage key remains `mcode_detail_cyber_mode_v1`. Background-image storage remains untouched and hidden only while cyber mode is active.

## Testing

Add or update source-contract tests to assert:

- the rain component has denser column data and phase-specific styling
- page cyber styles include terminal black base, scanline overlays, deep child selectors, and composer/bubble darkening
- `MessageBubble` has `bubble-wrap--cyber` and latest-text-only decode logic
- existing P63 tests still pass
