# Detail Tab Switch Responsiveness

## Scope

Conversation detail tab switching now prioritizes immediate visual selection and
limits mounted page work to the active tab window.

## UI Behavior

- The swiper only mounts the active tab plus its immediate left and right
  neighbors. This keeps adjacent swipe targets ready without rendering every
  opened conversation.
- Tab selection state updates before heavy conversation loading is deferred.
  If another conversation is still loading, the highlight/swiper position moves
  immediately while the conversation identity load remains queued.
- Inactive pre-mounted panes do not load project metadata or model config until
  they become active.

## Protocol And Data Flow

No ACP protocol, relay/direct gateway route, persistence schema, or websocket
frame changes. Existing conversation/runtime loading is preserved; the change
only reduces when non-visible panes are mounted or initialized.

## Compatibility

Native iOS and Android clients should mirror this with a pager cache window of
three pages: previous, current, and next. Keep tab highlight/page position local
and immediate, then run heavier conversation hydration asynchronously. Do not
initialize every opened tab just because it appears in the tab strip.
