# Conversation Runtime Completion Visibility

## Architecture

`mcode-app` now keeps the completed assistant reply visible before running any slow post-completion replay calibration.

The runtime `completeTurn` path persists the promoted optimistic/live turns, reloads local turns from SQLite, then clears `liveMessage`. Only after the completed turn is already visible does it run replay-gap calibration for external-user backfill.

## Protocol And Data Flow

No ACP payload or database schema changes are required.

Completion order is:

1. resolve the final live assistant content from the completion event or current `liveMessage`
2. persist completed optimistic/live turns locally
3. reload local turns and expose the completed assistant in the runtime timeline
4. clear live/in-flight runtime fields
5. run replay-gap calibration and reload local turns again if it backfills external user turns

This preserves the previously added authoritative final chunk behavior. The difference is only the ordering around slow calibration.

## UI Behavior

The last streaming assistant message no longer disappears for several seconds at turn completion. It transitions from streaming/live rendering to completed local rendering immediately; later remote calibration may update history metadata or backfill the matching user turn, but it should not create an empty tail gap.

## Compatibility

Existing cached conversations and relay/direct transports remain compatible. The change is client-runtime ordering only.

## Native iOS/Android Guidance

Native clients should never clear the live assistant tail before a completed local replacement is available. Promote or reload the completed turn first, then clear live state, then run slower server reconciliation in the background.
