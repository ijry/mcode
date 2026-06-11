# Detail Shell First Render

## Scope

The mobile `mcode-app` conversation detail page now renders its shell as soon as
a valid conversation id exists, even while the initial conversation data is still
loading.

## Architecture And Data Flow

The detail page previously used the top-level `loading` flag to switch the whole
page to `up-loading-page`. When local cache missed and remote detail hydration
was slow, this hid the navbar, status banner, message list, and composer until
`loadConversation()` finished.

The page now reserves the top-level empty state only for missing
`conversationId`. For valid conversations, it renders the normal detail shell
immediately. The message list owns the loading placeholder when there are no
renderable messages yet.

## UI Behavior

During initial loading with no messages, the message area shows a spinner and
`加载会话中...`. The navbar, detail status banner, and composer remain visible, so
users can see they have entered the conversation detail page even if local or
remote hydration is slow.

Once cached, local, live, or remote messages are available, the normal message
list renders without changing the runtime data flow.

## Compatibility

This is a presentation-layer change only. It does not alter local cache reads,
remote detail requests, realtime attach behavior, or persistence formats.

## Native iOS/Android Replication Guidance

Native clients should avoid blocking the whole detail page behind initial data
loads. Render the detail scaffold immediately after route validation, and put
loading placeholders inside the content region that is actually waiting for
data.
