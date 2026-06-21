# Conversation Runtime In-Flight User Turn Id

## Architecture

`mcode-app` conversation runtime now preserves the backend in-flight user turn id on each open runtime session. The field is transient UI/runtime state and is not persisted to SQLite.

The timeline projector receives this id and uses it as an anchor when suppressing persisted assistant partials that are already covered by the active live assistant message. This keeps duplicate suppression scoped to the currently running user turn instead of relying only on the global timeline tail.

## Protocol And Data Flow

No schema migration is required. The runtime accepts the id from existing detail/snapshot metadata when present:

- conversation detail: `in_flight_user_turn_id` or `inFlightUserTurnId`
- live snapshot: `pending_user_message.message_id`, `pendingUserMessage.messageId`, `pendingUserMessage.id`, `in_flight_user_turn_id`, or `inFlightUserTurnId`

Detail metadata only changes runtime state when the response explicitly contains one of the in-flight id fields. A missing field leaves the current runtime value intact. A present null/empty field clears it.

Snapshot hydration follows the same rule, but older reconnect snapshots that are rejected by `event_seq` do not update this field. Runtime cleanup paths clear it when live state is cleared, a turn completes, a session is disconnected, or cached runtime state is reset.

Timeline projection now works in two stages:

1. If `inFlightUserTurnId` matches a local user turn, only assistant turns after that user and before the next user are candidates for suppression.
2. If no anchored assistant partial is removed, the older trailing assistant content-cover rule still runs as a compatibility fallback.

In both stages, suppression only applies while a non-placeholder live assistant message exists and only when the persisted assistant content is a prefix of the live content signature.

## UI Behavior

The detail page avoids showing the same assistant partial twice when a detail refresh or reconnect persists a partial response while the live stream for the same user turn is still active.

Queued or later user turns remain visible. Assistant turns outside the anchored in-flight user segment remain visible unless the legacy tail fallback applies.

## Compatibility

Backends that do not expose an in-flight user turn id remain compatible. Those clients continue to use the previous trailing assistant partial suppression behavior.

Clients should not derive this value from local optimistic user ids unless those ids are guaranteed to match backend persisted user message ids. In `mcode-app`, optimistic ids are local placeholders, so the authoritative sources are detail and snapshot metadata.

## Native iOS/Android Guidance

Native clients should mirror this in their runtime timeline layer:

- store `inFlightUserTurnId` as transient per-conversation runtime state
- hydrate it from conversation detail and live snapshot metadata only when the field is explicitly present
- ignore stale reconnect snapshots before applying the id
- clear it when live state is cleared or a turn completes
- when projecting messages, suppress covered assistant partials only in the segment after the matching user turn and before the next user turn
- keep the old tail-only suppression as a fallback for older servers that do not send the id
