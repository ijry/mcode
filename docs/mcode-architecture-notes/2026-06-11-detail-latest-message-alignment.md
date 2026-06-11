# Detail Latest Message Alignment

## Scope

The mobile `mcode-app` conversation detail page now aligns its merged assistant
render item identity with desktop detail behavior so the visible latest message
matches the newest assistant turn.

## Architecture And Data Flow

The detail page keeps a mobile-only render projection that collapses consecutive
assistant turns into one displayed item. This projection is presentation-only
and does not change persisted turns.

When multiple assistant turns are merged, the merged render item must inherit
the latest assistant turn's identity fields for "latest message" semantics:

- `anchorId`
- rendered message `id`
- `timestamp`

The merged content still concatenates all assistant parts in order, but the
rendered item is now anchored to the last assistant turn rather than the first.

## UI Behavior

The latest message on mobile now follows the newest assistant turn in the merged
run, which keeps latest-message highlighting, scroll targeting, and other
"tail of conversation" behavior consistent with the desktop detail page.

## Compatibility

This change only affects render projection metadata. It does not change local
SQLite storage, realtime event handling, or remote protocol payloads.

## Native iOS/Android Replication Guidance

If native clients collapse adjacent assistant turns for presentation, the
collapsed item should inherit identity and ordering metadata from the latest
assistant turn in that run, not the earliest one.
