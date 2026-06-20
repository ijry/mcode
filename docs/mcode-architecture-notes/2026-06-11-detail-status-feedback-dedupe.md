# Detail Status Feedback Dedupe

## Scope

The mobile `mcode-app` conversation detail page now avoids duplicated status
feedback between the top status banner and the composer-area inline feedback,
and it briefly acknowledges when the real-time bridge recovers.

## Architecture And Data Flow

The detail page keeps using the shared `detailStatusBanner` as the compact
status surface. Composer-area retry feedback remains available, but it is
suppressed when the top banner is already showing the same retry message.

Runtime send/error feedback is now an exception: ACP send failures must remain
visible below the composer even when the toolbar also shows the same text. See
`2026-06-19-detail-composer-error-surfacing.md`.

Bridge recovery is derived locally in the detail page by comparing the previous
bridge health state with the new state from `subscribeRealtimeBridgeHealth`.
When the state transitions from `reconnecting`, `error`, or `polling` back to
`connected`, the page stores a short-lived recovery timestamp.

## UI Behavior

When the real-time bridge reconnects successfully, the top banner shows
`实时连接已恢复` for 3 seconds, then disappears automatically if no higher-priority
status is active.

When the top banner already shows the current retry text, the composer area does
not render the same retry line again. Runtime error text is intentionally not
deduped from the composer because users need the failure reason next to the send
control, especially for status-only ACP failures such as `HTTP 423`.

## Compatibility

This is a presentation-layer refinement only. No ACP payloads, bridge protocols,
or persistence formats change.

## Native iOS/Android Replication Guidance

Native clients should treat the top status banner as the compact status surface,
show a short recovery acknowledgment after reconnect, suppress duplicated inline
retry text when it matches the active banner content, and keep ACP runtime/send
errors visible near the composer.
