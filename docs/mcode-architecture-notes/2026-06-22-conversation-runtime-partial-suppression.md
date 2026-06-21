# Conversation Runtime Partial Assistant Suppression

## Architecture

`mcode-app` now suppresses one narrow class of duplicate assistant output in the runtime timeline projection: a trailing persisted assistant turn whose content is already covered by the active `liveMessage`.

The logic lives in `mcode-app/src/stores/conversationTimeline.ts`, alongside existing timeline phase projection and `(role, id)` dedupe. The runtime store still owns mutable session state; the detail page and message bubble renderer continue to consume an already projected message list.

## Protocol And Data Flow

No ACP payload, realtime event, or SQLite schema changes are required.

Projection order remains:

1. persisted/local turns
2. optimistic user turns
3. streaming live assistant turn
4. role/id dedupe

Before step 1 is emitted, the projection checks the local turn tail. If the last local turn is an assistant message and the active live assistant content starts with the same normalized content signature, that local assistant tail is removed from the visible timeline. User turns before it remain visible.

This is intentionally conservative. It only suppresses the trailing assistant turn and only while a real live assistant message exists. Completed assistant turns with different content remain visible.

## UI Behavior

The detail page no longer shows the same assistant prefix twice when a remote detail refresh persists a partial assistant response while the live stream also carries that same response.

Normal completed history is unchanged. If the active live response does not cover the trailing assistant content, both the completed assistant turn and live turn render.

## Compatibility

Existing cached turns remain compatible. The suppression is render-time only and does not delete or mutate SQLite rows.

When the live message clears after completion, persisted history renders normally again.

## Native iOS/Android Guidance

Native clients should implement this in their conversation timeline projection layer:

- inspect only the last persisted/local turn
- suppress it only when it is an assistant turn
- compare normalized content signatures against the active live assistant content
- keep preceding user turns visible
- do not delete local database records for this suppression
