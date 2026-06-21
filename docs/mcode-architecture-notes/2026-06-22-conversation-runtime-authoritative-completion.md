# Conversation Runtime Authoritative Completion Payload

## Architecture

`mcode-app` `completeTurn` now accepts an optional final live-message payload from the `turn_complete` event and prefers it over the session's current `liveMessage` when promoting the assistant reply into completed local turns.

This is a compatibility path for transports that can deliver the final assistant snapshot together with completion. Existing stream-first behavior remains unchanged when the completion payload has no final live message.

## Protocol And Data Flow

No protocol requirement changed. The realtime normalizer now preserves optional fields from `turn_complete` if they exist:

- `live_message`
- `liveMessage`
- `final_live_message`
- `finalLiveMessage`

Runtime promotion order is:

1. build a completion idempotency key from turn id, event seq, final live-message id, or timestamp
2. map the final live-message payload using the same snapshot content mapper
3. if mapping succeeds, promote that content as the completed assistant turn
4. otherwise fall back to the session's current `liveMessage`

The promoted assistant turn still uses the existing completed-turn persistence and local fallback paths.

## UI Behavior

If the final stream chunk and completion arrive together, the completed assistant bubble uses the final payload content instead of an older in-memory live snapshot. This prevents the last text/thinking/tool chunk from disappearing during completion promotion.

If no final payload exists, UI behavior is unchanged.

## Compatibility

Backends that do not send final live content in `turn_complete` remain fully compatible.

Backends that do send it should use the same `live_message.content` block shape as session snapshots so web, iOS, and Android clients can share one mapper.

## Native iOS/Android Guidance

Native clients should prefer final live content from completion events when present, but keep current live state as the fallback. This should happen in the runtime turn-promotion layer, not in message-cell rendering.
