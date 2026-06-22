# Circle Post Detail and Markdown Publishing

## Architecture

Circle post presentation now has two entry points: the existing feed tab and a
new standalone detail page. The feed owns pagination, search, topic filtering,
and quick comment popup behavior. The detail page owns a single post, full
Markdown body rendering, share metadata, actions, and an inline comment thread.

Post body rendering uses `up-markdown` in both feed cards and detail. Plain text
posts remain valid Markdown and render without migration.

## Protocol and Data Flow

The frontend circle service adds:

- `GET /v1/circle/post/info?id=<post id>` via `fetchCirclePost(postId)`.

The response is normalized through the same `CirclePost` path as feed lists. The
client accepts a post object directly, `data.post`, or `data.info`. Existing
action and comment APIs remain unchanged:

- `POST /v1/action/action/set` with `dataModel=circle_post`.
- `GET /v1/comment/comment/lists?dataModel=circle_post&dataId=<post id>`.
- `POST /v1/comment/comment/add` with `dataModel=circle_post`.

Publishing still sends `title`, `content`, `topicIds`, and `images` to
`POST /v1/circle/post/add`. Markdown image insertion uploads through the shared
`/v1/core/index/upload` endpoint and writes the returned URL into `content` as
`![图片](url)`. Attachment images continue to populate the post-level `images`
array.

Comment publishing uses the shared xycloud nested-reply protocol:

- New top-level comment: `pid=0`, `tpid=0`.
- Reply to a top-level comment: `pid=<top comment id>`, `tpid=0`.
- Reply to a child comment: `pid=<child comment id>`, `tpid=<top comment id>`.

Clients must treat `pid` as the direct reply target and `tpid` as the top-level
floor id. Successful top-level comments are inserted into the top-level comment
list; successful replies are appended to the `children` array of the matching
top-level comment and increment that comment's `replyCount`.

## UI Behavior

Feed post content is tappable and navigates to
`/pages/circles/detail?id=<post id>`. Like, comment, and favorite controls stop
event propagation and keep their original inline behavior.

The detail page supports loading, retryable error, missing-post, and loaded
states. Loaded state shows author metadata, optional title, Markdown body,
topics, image grid with preview, optimistic like/favorite actions, comments, and
a fixed bottom comment composer. Comments and child replies expose a `回复`
action. Selecting one changes the composer placeholder to the target author and
shows a cancel action. The feed comment popup uses the same behavior.

The publish page adds a Markdown toolbar above the native textarea:

- `加粗` inserts `**加粗文字**`.
- `斜体` inserts `*斜体文字*`.
- `代码` inserts `` `代码` ``.
- `链接` inserts `[链接文字](https://example.com)`.
- `图片` chooses and uploads one image, then inserts `![图片](url)`.

Snippet insertion uses the textarea cursor when the platform provides it on
blur; otherwise snippets append to the end of the content.

## Compatibility

No new dependency is required. `up-markdown` is already resolved by the
uview-plus easycom configuration. Styling continues to derive from uview runtime
theme variables with `--up-*`; no new `--mcode-*` color aliases are introduced.

The post detail route requires backend support for `/v1/circle/post/info`. If
the API returns non-200, the page shows a retry state instead of falling back to
list data, because shared links must be independently resolvable.

## Native iOS and Android Replication

Native clients should add a `CirclePostDetail` screen accepting `postId`. Fetch
the post through the same post-info endpoint and reuse the list post normalizer
so author, topics, action counts, images, and current-user action states stay
consistent.

Render Markdown with the platform Markdown renderer used elsewhere in the app.
Keep post-level attachment images separate from Markdown inline images. For
publish, implement toolbar operations as deterministic string insertion using
the active text selection if available, otherwise append to the content. The
Markdown image operation should upload first, then insert `![图片](url)`.

For comments, native clients should model a reply target with direct parent id,
top-level comment id, and target author name. The composer submits the protocol
fields above and clears the reply target after a successful send or when the
user taps cancel.
