# 2026-07-17 Conversation List Live Preview Safari Stability

## Architecture

The conversation list live preview remains an optional, default-off feature. The
list can attach to at most five in-progress conversations, but card preview text
is now treated as a bounded projection of live runtime state rather than the full
assistant stream.

## Protocol And Data Flow

No backend protocol changes are introduced. Realtime events still update
`conversationRuntime.sessions[conversationId].liveMessage`; the list converts
that live message into a single preview string capped at 180 characters and keeps
the newest tail of the stream.

Subscription reconciliation and bulk-selection cleanup use lightweight card
signatures derived from connection groups, search text, conversation id, and
runtime status. They do not read `liveMessage.content`, so token-by-token stream
updates no longer trigger subscription coordination work.

## UI Behavior

Long generated text in a live card preview is truncated with a leading `...`.
This preserves the latest visible content while preventing `MarqueeText` from
measuring and duplicating an ever-growing string on every stream update. Waiting
permission/question and running-tool labels are unchanged.

## Compatibility

Existing stored preferences and ACP event payloads are unchanged. Users with
live preview disabled see no behavior change. Users with it enabled get the same
card-level live signal with bounded text and less Safari layout pressure.

## Native iOS/Android Replication

Native clients should never bind the full assistant stream into a conversation
list row. Project live content into a short, fixed-length preview string, prefer
the newest tail for long output, and keep subscription eligibility checks based
on conversation identity/status rather than live text content.
