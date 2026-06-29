# P40 Conversation Detail Live Scroll Stability Design

P40 fixes a user-visible Android issue in `mcode-app`: while realtime tunnel
events stream into the conversation detail page, periodic status/layout updates
can pull the page upward and expose bottom controls instead of keeping the live
turn pinned to the bottom.

## Root Cause

The detail page already separates user scroll state from programmatic bottom
follow. However `scheduleViewportSync()` still uses `lastMeasuredScrollTop` as
a generic fallback whenever the page is not considered near bottom. During live
output, Android can report stale page scroll values while long-wait/status,
composer, pending interaction, and message-delta watchers repeatedly schedule
viewport sync. The fallback `pageScrollTo(lastMeasuredScrollTop)` then pulls the
page back to an old position every few seconds.

## Scope

- Change viewport sync so routine realtime/layout updates only do two things:
  measure layout, or scroll to bottom when bottom-follow is enabled.
- Do not restore old `scrollTop` during ordinary viewport sync.
- Keep explicit restore paths intact: initial restore, history prepend anchor
  restore, manual scroll-to-bottom, and send-message bottom forcing.
- Add pure tests for the viewport sync decision.
- Do not change ACP, relay, Desktop, or message persistence protocols.

## Native Client Guidance

Native clients should avoid using stale pixel scroll offsets as a periodic
layout-sync fallback during live output. Programmatic scroll should only happen
for explicit restore/history actions or bottom-follow mode.
