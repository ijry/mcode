# 2026-07-03 P52 Detail More Menu Background

## Architecture

Conversation detail keeps the existing custom `up-navbar` and adds a right-side
`more-dot-fill` trigger. The trigger opens a local dropdown menu owned by
`pages/conversation-detail/index.vue`. Two actions route into existing pages:
`模型供应商` reuses the remote settings route builder for
`pages/model-providers/index`, and `文件夹管理` reuses the current connection id
to open `pages/projects/index`.

`背景图自定义` stays inside the detail page instead of adding a new page. The
page stores one background image per remote-instance-key plus conversation id,
so different conversations can keep different local backgrounds even when they
belong to the same connection.

## Protocol And Data Flow

No ACP, xycloud, relay, SQLite schema, or backend contract changes. The menu
actions only consume the already-routed connection context from the conversation
detail page.

Background image data flow is fully client-local:

- user taps the navbar `more-dot-fill` button
- app opens a right-aligned dropdown menu
- user taps `背景图自定义`
- app opens a local action sheet for `选择背景图` or `清除背景图`
- image selection uses `uni.chooseImage`
- app tries `uni.saveFile` when the platform supports persistent local files
- page stores `{ url, updatedAt }` in local storage under a conversation-scoped
  key
- page restores that key on page load and on active detail-tab conversation
  switch

If the saved file path becomes invalid, the image `error` handler clears the
stored background entry automatically.

## UI Behavior

The top-right icon is always visible on the P52 conversation detail navbar.
Tapping it opens a right-aligned dropdown menu with these entries in order:

1. `模型供应商`
2. `文件夹管理`
3. `背景图自定义`

`模型供应商` opens the existing model-provider management page for the current
connection. `文件夹管理` opens the existing project list page for the current
connection. `背景图自定义` opens a second native action sheet. When no custom
background exists, it only offers `选择背景图`; once a background exists, it also
offers `清除背景图`.

When a background image is set, the detail atmosphere layer renders that image
behind the existing blobs and adds a light scrim so title text, tabs, and
message surfaces stay readable in light and dark themes. The current web
implementation keeps the image base layer at roughly 95% opacity and reduces
the page-color scrim blend to roughly 16%, so the photo itself remains visible
while foreground panels still carry the readability treatment.

When a background image exists, translucency moves to foreground panels instead
of the whole scroll viewport. Assistant and user message bubbles, tool-group
summary pills, in-message plan blocks, the waiting card, bottom generating
pill, permission / question cards, slash panel, upload queue, attachment file
chips, composer panel, input status pill, bottom `input-wrap`, top tabs bar,
and individual tab pills all switch to roughly 50% translucent surfaces. Most
larger panels keep light borders and blur, while compact pills such as
tool-group summaries, in-message plan blocks, and individual tab pills keep the
transparent fill and border but intentionally skip blur so they stay crisper.
User bubbles keep a lighter blur at `0.1625rem` so the primary-color fill still
separates from the photo background without becoming too foggy. The
implementation changes only panel backgrounds and borders, not container
`opacity`, so text, markdown, icons, and bubble content remain fully opaque.
Tab titles stay single-line and truncate with ellipsis instead of wrapping when
the available capsule width becomes tight. The web implementation also
normalizes embedded line breaks and repeated whitespace in tab titles before
rendering them into the capsule.

## Compatibility

This is a client-only enhancement. Existing conversation routes continue to work
as long as they already pass the stored `connectionId` into the detail page.

Platforms without reliable persistent file support still work: the page falls
back to the chosen local path, but persistence depends on the platform's temp
file lifetime. Platforms that support `uni.saveFile` keep the background across
future app launches more reliably.

The change uses existing `--up-*` runtime theme variables only and does not add
new `--mcode-*` color aliases.

## Native iOS/Android Replication

Native clients should keep the menu as a conversation-detail navbar overflow
action, not a global setting. The routing inputs are the current conversation's
stored connection record id.

Background customization should be stored locally per
`remote-instance + conversation-id`, not pushed to the server. Native clients
should prefer copying the chosen image into app-managed persistent storage, then
restore it on conversation open and active-tab switch. If the file disappears,
clear the stored reference automatically instead of showing a broken image.

If native clients mirror this behavior, they should blend the same foreground
panels to roughly 50% opacity and keep text alpha at 100%, including top tab
containers and compact in-message summary pills. Do not fade the entire message
list container, otherwise foreground readability drops too much on photos.
