# Circle Post Menu Edit And Share

## Architecture

Circle posts now expose a shared action menu in both the feed and the detail
page. The menu always provides `分享`, and only shows `编辑` when the current
logged-in user id matches the post owner id.

Edit reuses the existing publish page in dual-mode. Create mode remains the
default, while edit mode is entered by routing with a post id and preloading the
existing post data before the form becomes interactive.

## Protocol And Data Flow

- Read detail: `GET /v1/circle/post/info/<id>`
- Create post: `POST /v1/circle/post/add`
- Edit post: `POST /v1/circle/post/edit/<id>`

Share does not call the backend. The client builds a deterministic clipboard
payload as:

- `<title or content excerpt>`
- `/pages/circles/detail?id=<id>`

Edit submits `title`, `content`, `topicIds`, and `images`. The backend validates
login, loads the post, verifies `uid` ownership, updates the record, and applies
topic `postCount` delta changes for added and removed topics.

## UI Behavior

- Feed card right-top three-dot icon opens an action sheet.
- Detail page keeps the top-right share icon and adds the same three-dot author
  menu inside the post header.
- `分享` copies the generated share text to clipboard and shows a toast.
- `编辑` navigates to `/pages/circles/publish?id=<id>`.
- Publish page in edit mode changes navbar/button copy to `编辑动态` and `保存`,
  pre-fills title, content, topics, and images, and blocks submit while images
  are still uploading.

## Compatibility

- Posts not owned by the current user never show the edit action in UI.
- Backend ownership validation is still authoritative even if a client calls the
  edit API directly.
- Existing create-post behavior is unchanged when no route id is present.
- Share target remains the same post detail route used elsewhere in the app.

## Native iOS And Android Replication

Native clients should use the same menu policy:

- always expose share
- expose edit only when `currentUserId == post.uid`

Clipboard share content should keep the same summary-plus-route format so copied
text is consistent across platforms. Edit should reuse the same post composer
screen with a create/edit mode flag, and the native client should expect the
backend to reject non-owner edits even if the local UI attempted to hide them.
