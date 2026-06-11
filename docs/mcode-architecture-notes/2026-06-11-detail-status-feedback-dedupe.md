# Detail Status Feedback Dedupe

## Scope

The mobile `mcode-app` conversation detail page now avoids duplicated status
feedback between the top status banner and the composer-area inline feedback,
and it briefly acknowledges when the real-time bridge recovers.

## Architecture And Data Flow

The detail page keeps using the shared `detailStatusBanner` as the primary
status surface. Composer-area retry and error feedback remain available, but
they are suppressed when the top banner is already showing the same retry or
error message.

Bridge recovery is derived locally in the detail page by comparing the previous
bridge health state with the new state from `subscribeRealtimeBridgeHealth`.
When the state transitions from `reconnecting`, `error`, or `polling` back to
`connected`, the page stores a short-lived recovery timestamp.

## UI Behavior

When the real-time bridge reconnects successfully, the top banner shows
`实时连接已恢复` for 3 seconds, then disappears automatically if no higher-priority
status is active.

When the top banner already shows the current retry or error text, the composer
area does not render the same retry or error line again. This keeps the detail
page readable while preserving composer-local feedback for statuses that are not
currently elevated to the top banner.

## Compatibility

This is a presentation-layer refinement only. No ACP payloads, bridge protocols,
or persistence formats change.

## Native iOS/Android Replication Guidance

Native clients should treat the top status banner as the primary status surface,
show a short recovery acknowledgment after reconnect, and suppress duplicated
inline retry/error text when it matches the active banner content.
