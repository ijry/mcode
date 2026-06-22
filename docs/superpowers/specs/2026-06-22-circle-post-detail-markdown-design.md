# Circle Post Detail Markdown Design

## Scope

Improve the mcode `圈子` flow with a shareable post detail page, Markdown rendering for post bodies, and common Markdown insertion tools on the publish page.

## Goals

- Add a post detail route that can be opened directly with `id=<post id>` and used as a share target.
- Render circle post `content` with `up-markdown` instead of plain text in feed cards and detail.
- Keep the existing attachment image grid, while adding Markdown toolbar operations for bold, italic, inline code, link, and uploaded image insertion.
- Preserve existing circle API contracts except for adding the documented post info read call.

## Architecture

The circle service remains the only frontend boundary to xycloud circle APIs. It gains `fetchCirclePost(postId)` that calls `GET /v1/circle/post/info?id=<post id>` and normalizes the response through the same post normalizer used by lists. If the backend returns either the post object directly or wraps it in `post`/`info`, the client accepts both.

The feed page remains responsible for list pagination, topic filtering, and inline comment popup behavior. Post cards add a body tap target that navigates to `/pages/circles/detail?id=<id>`. Action buttons use event stop modifiers so like, comment, and favorite actions do not navigate.

The new detail page owns one post and its comments. It reuses `fetchCirclePost`, `fetchCircleComments`, `publishCircleComment`, and `toggleCircleAction`. It exposes share metadata through uni-app share hooks where available, using the post title or a content excerpt and a path containing the post id.

Comment publishing follows the shared xycloud floor protocol: top-level comments send `pid=0,tpid=0`; replies to a top-level comment send `pid=<top comment id>,tpid=0`; replies to a child comment send `pid=<child comment id>,tpid=<top comment id>`. Feed popup and detail page both expose reply targets and append successful replies under the correct top-level comment.

The publish page keeps a native `textarea` for broad uni-app compatibility. Markdown operations mutate `content` by inserting snippets at the current cursor when cursor data is available, otherwise appending at the end. The Markdown image operation uploads through the existing `uploadCircleImage()` function and inserts `![图片](url)` into the content. The existing bottom image picker still uploads attachments into the post `images` array.

## UI Behavior

- Feed cards show Markdown-rendered content in the same visual card structure. Long rich content is still concise in the feed by layout, while the detail page shows the full body.
- Detail shows a custom navbar, author metadata, title, Markdown body, topics, image grid, actions, comment list, and a bottom comment composer.
- Comments and child replies show a `回复` action. When selected, the composer placeholder changes to the target author and a cancel action clears the reply target.
- Publish shows a Markdown toolbar directly above the body textarea. Toolbar operations are explicit buttons labeled `加粗`, `斜体`, `代码`, `链接`, and `图片`.
- The link action inserts `[链接文字](https://example.com)`.
- The image action opens the platform image picker, uploads one image, and inserts Markdown image syntax. Attachment image selection remains under the existing `图片` section.

## Compatibility

- No new runtime dependency is introduced; `up-markdown` is already available through uview-plus easycom.
- Theme styling uses `--up-*` runtime variables only. Local circle CSS variables may alias uview variables inside page scope, consistent with existing circle pages.
- The post info endpoint must support `GET /v1/circle/post/info?id=<id>`. Native clients should mirror this route and keep list/detail post normalization identical.
- Existing posts with plain text content render correctly through `up-markdown`.

## Testing

- Extend circle service tests for `fetchCirclePost` and accepted response shapes.
- Add a pure Markdown insertion helper with unit tests covering insertion at cursor, append fallback, and uploaded image snippet shape.
- Run targeted circle tests and a type/build check if feasible.
