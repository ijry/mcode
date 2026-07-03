# 2026-07-03 P52 Detail More Menu Background

## Architecture

Conversation detail keeps the existing custom `up-navbar` and adds a right-side
`more-dot-fill` trigger. The trigger opens a local dropdown menu owned by
`pages/conversation-detail/index.vue`. Two actions route into existing pages:
`模型供应商` reuses the remote settings route builder for
`pages/model-providers/index`, and `文件夹管理` reuses the current connection id
to open `pages/projects/index`.

`背景图自定义` stays inside the detail page instead of adding a new page. The
page stores one shared background image per remote-instance-key detail
workspace, so every opened tab in the same detail shell sees the same local
background.

The same dropdown also owns current-tab conversation actions. These actions are
scoped to the active detail tab only: rename changes the current conversation
title, status change writes the selected conversation summary status, and delete
removes the current conversation after confirmation.

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
- page stores `{ url, updatedAt }` in local storage under an instance-scoped
  shared key
- page restores that key on page load and on active detail-tab conversation
  switch, so switching tabs keeps the same background visible
- older conversation-scoped keys are read only as a compatibility fallback and
  are migrated into the shared key when encountered

If the saved file path becomes invalid, the image `error` handler clears the
stored background entry automatically.

Current-tab conversation actions reuse the existing desktop gateway commands:

- `update_conversation_title` with `{ conversationId, title }`
- `update_conversation_status` with `{ conversationId, status }`
- `delete_conversation` with `{ conversationId }`

After rename/status/delete, the mobile client marks the conversation list dirty
so overview pages refresh. Status changes also patch the local conversation
summary cache when available. Delete additionally marks the local summary
deleted, clears the runtime session for the deleted conversation, removes the
conversation from the opened-tabs snapshot via `save_opened_tabs`, then switches
to the neighboring tab or returns to the conversation list if no tabs remain.

## UI Behavior

The top-right icon is always visible on the P52 conversation detail navbar.
Tapping it opens a right-aligned dropdown menu with these entries in order:

1. `模型供应商`
2. `文件夹管理`
3. `背景图自定义`
4. `重命名`
5. `更改状态`
6. `删除`

`模型供应商` opens the existing model-provider management page for the current
connection. `文件夹管理` opens the existing project list page for the current
connection. `背景图自定义` opens a second native action sheet. When no custom
background exists, it only offers `选择背景图`; once a background exists, it also
offers `清除背景图`.

`重命名` opens an editable modal seeded with the active tab title. `更改状态`
opens a native action sheet with `进行中`, `待处理`, `已完成`, `已取消`, and
`失败`, mapped to `in_progress`, `pending_review`, `completed`, `cancelled`,
and `failed`. `删除` opens a destructive confirmation modal before calling the
gateway delete command.

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
and individual tab pills all switch to translucent surfaces. Larger content
panels now use roughly 35-40% solid fill with 10-12rpx blur, while compact
controls and file chips use roughly 32-36% solid fill with 6-8rpx blur. Compact
pills such as tool-group summaries, in-message plan blocks, and individual tab
pills keep the transparent fill and border but intentionally skip blur so they
stay crisper. Message bubbles are more transparent than the surrounding
composer chrome: assistant bubbles use roughly 30% card fill, and user bubbles
use roughly 54% primary fill with a lighter `0.1rem` blur so the photo remains
visible behind chat content. The composer input row is intentionally lighter
inside the outer `input-wrap`: the `+` button, text input well, and expanded
tool icons use roughly 22% card fill with 6rpx blur, while active send/loading
buttons use roughly 48% primary fill instead of an opaque blue. The
implementation changes only panel backgrounds and borders, not container
`opacity`, so text, markdown, icons, and bubble content remain fully opaque.
The bottom `composer-safe-area` spacer stays transparent so the background
image can continue through the safe-area region instead of being patched with a
solid page-color block.
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

Existing clients may already have backgrounds stored under the old
`remote-instance + conversation-id` key. New implementations should first read
the shared `remote-instance + shared` key, then fall back to the current active
conversation's old key only when the shared key is absent. A clear action should
write an empty shared marker and remove known old opened-tab keys, otherwise the
old value can reappear on the next tab switch.

The change uses existing `--up-*` runtime theme variables only and does not add
new `--mcode-*` color aliases.

## Native iOS/Android Replication

Native clients should keep the menu as a conversation-detail navbar overflow
action, not a global setting. The routing inputs are the current conversation's
stored connection record id.

Native clients should scope rename/status/delete to the active tab. Deletion
must be confirmed, should remove the deleted conversation from the opened-tab
model, and should then activate the nearest remaining tab. If no tab remains,
return to the conversation overview. Status labels should map to the same
summary status values listed above so web, iOS, and Android overviews stay
consistent.

Background customization should be stored locally per remote instance detail
workspace, not per conversation and not pushed to the server. Native clients
should prefer copying the chosen image into app-managed persistent storage, then
restore the shared background on conversation open and active-tab switch. If the
file disappears, clear the stored reference automatically instead of showing a
broken image.

If native clients mirror this behavior, they should blend the same foreground
panels rather than fading their full containers. Keep text alpha at 100%, use
lighter fills for message bubbles and composer inner controls than for the
outer composer chrome, and avoid blurring compact summary pills. Do not fade
the entire message list container, otherwise foreground readability drops too
much on photos.
