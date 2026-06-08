# Circle Tab Design

**Date:** 2026-06-09  
**Scope:** add a new mobile `圈子` tab to `mcode-app`, and add a backend `circle` content plugin skeleton under `xycloud/app/_content`  
**Primary Frontend Files:** `mcode-app/src/pages.json`, `mcode-app/src/pages/circles/index.vue`, `mcode-app/src/static/tabbar/*`  
**Primary Backend Path:** `D:\Repos\xystack\back-end\xycloud\app\_content\circle`  
**Reference Design:** UI MCP project `Web Page Optimizer`, screen `圈子 - iOS 风格社交动态`, with selective topic/ranking elements from the product-topic circle variants

---

## Problem

The app currently has four tabs: `连接`, `会话`, `待办`, and `我的`. There is no community surface for product topics, social updates, or lightweight discovery.

The backend also has no dedicated circle content plugin. Existing content modules such as `forum` are close structurally, but using `forum_post` directly would mix forum semantics with the new circle feed. The existing common `action` and `comment` plugins already provide interaction primitives and should be reused rather than duplicated.

## Goal

Add a `圈子` tab that visually matches the UI MCP circle social-feed direction while staying consistent with the app's current iOS-style theme variables.

The first frontend version uses mock data only. It should still be structured so real backend data can replace the mock feed later without rewriting the page layout.

Create a backend `circle` plugin skeleton that defines stable content APIs and data models for future integration. Likes and favorites use the existing `action` plugin, while comments use the existing `comment` plugin.

## Non-Goals

- Do not connect the frontend page to live backend APIs in this iteration.
- Do not implement post publishing, post detail, topic detail, or comment detail pages.
- Do not duplicate like, favorite, or comment storage inside the `circle` plugin.
- Do not modify unrelated existing tab behavior.
- Do not migrate existing `forum` data into `circle`.

## Chosen Direction

Use an independent `circle` module with a frontend mock-first page.

Frontend:

- Add `pages/circles/index` as a new tab page.
- Add `圈子` to `tabBar`, between `待办` and `我的`.
- Build a single-page feed that uses local mock arrays for topics, rankings, and posts.
- Reuse global theme variables such as `--mcode-page-bg`, `--mcode-card-bg`, `--mcode-primary`, `--mcode-soft-shadow`, and `upThemeCardStyle`.
- Implement local-only interaction state for like/favorite toggles so mock cards feel interactive.

Backend:

- Create `app/_content/circle` with `controller`, `model`, `service`, `admin`, and `install` folders following the `forum` plugin style.
- Use `circle_post` as the core feed model and `circle_topic` as the topic model.
- Enrich circle posts in service code with user info, action counts, comment counts, and current-user action states.
- Use `dataModel = circle_post` when reading or writing through `action` and `comment`.

## Frontend Design

### Page Layout

The page follows the UI MCP `圈子 - iOS 风格社交动态` draft:

1. Sticky-style top area with large `圈子` title.
2. Rounded search field for topic or post discovery.
3. Hero card for the main community prompt, including active member and topic metrics.
4. Horizontal topic chips or topic cards.
5. Compact hot ranking card.
6. Social feed cards with author, badges, text, images, tags, and action row.

The product-topic MCP variants are used only as inspiration for the hot ranking and topic-card density. The main page remains a social feed, not a product detail page.

### Mock Data

Mock data lives inside `pages/circles/index.vue` for the first pass. Keep it typed and grouped:

- `mockTopics`
- `mockRankingItems`
- `mockPosts`

Each post includes:

- `id`
- `author`
- `avatarText`
- `role`
- `time`
- `title`
- `content`
- `images`
- `tags`
- `topic`
- `likeCount`
- `commentCount`
- `favoriteCount`
- `liked`
- `favorited`

This shape should be close to the backend service output so API integration can later replace only the data source.

### Interaction

The first pass supports local mock interactions:

- Tap like toggles `liked` and adjusts `likeCount`.
- Tap favorite toggles `favorited` and adjusts `favoriteCount`.
- Tap comment shows a toast that the comment panel will be connected later.
- Tap create/post/topic/detail entries shows lightweight toasts or reserved navigation handlers.

No network calls are made from the frontend in this iteration.

### Tab Bar Icons

Add `circles.png` and `circles-active.png` under `src/static/tabbar`. Keep the style close to the existing small PNG tab icons and use the existing selected blue.

## Backend Design

### Plugin Structure

Create:

- `app/_content/circle/install/install.json`
- `app/_content/circle/install/install.php`
- `app/_content/circle/model/Post.php`
- `app/_content/circle/model/Topic.php`
- `app/_content/circle/service/Post.php`
- `app/_content/circle/service/Topic.php`
- `app/_content/circle/controller/Post.php`
- `app/_content/circle/controller/Topic.php`
- `app/_content/circle/admin/Post.php`
- `app/_content/circle/admin/Topic.php`

Admin files can start as thin CRUD-oriented classes modeled after nearby content modules. The key requirement is that the home API controller and service contracts are ready for frontend integration.

### Tables

`xy_circle_topic`:

- `gid`, `cloudId`, `id`
- `eid`
- `name`, `title`, `cover`, `description`
- `postCount`, `memberCount`
- `siteRec`, `sortnum`, `status`
- `createTime`, `deleteTime`

`xy_circle_post`:

- `gid`, `cloudId`, `id`
- `eid`, `uid`, `topicId`
- `cover`, `images`
- `title`, `content`, `contentType`, `tags`
- `viewCount`
- `status`, `reviewStatus`, `sortnum`
- `postTime`, `createTime`, `updateTime`, `deleteTime`

Do not store duplicate like/favorite/comment counts as the source of truth. Service responses can compute counts from `action` and `comment`. If counters are later needed for performance, they should be treated as derived cache fields.

### Public APIs

`GET /api/v1/circle/post/lists`

- Query: `topicId`, `siteRec`, `keyword`, `page`, `limit`
- Returns: `dataList`, `dataPage`, optional `topicInfo`, optional `hotTopics`

`GET /api/v1/circle/post/info/{id}`

- Returns: `info`
- Increments `viewCount`

`POST /api/v1/circle/post/add`

- Requires login.
- Validates `title` or `content`, and optional `topicId`.
- Creates a reviewed visible post by default unless later moderation rules change.

`GET /api/v1/circle/topic/lists`

- Returns active topics ordered by `sortnum desc, id desc`.

`GET /api/v1/circle/topic/info/{id}`

- Supports numeric `id` or `name`.

### Action and Comment Reuse

Likes:

- Existing endpoint: `/api/v1/action/action/set`
- Payload: `dataModel=circle_post`, `dataId=<post id>`, `actionType=1`

Favorites:

- Existing endpoint: `/api/v1/action/action/set`
- Payload: `dataModel=circle_post`, `dataId=<post id>`, `actionType=2`

Comments:

- Existing list endpoint: `/api/v1/comment/comment/lists?dataModel=circle_post&dataId=<post id>`
- Existing add endpoint: `/api/v1/comment/comment/add`
- Payload includes `dataModel=circle_post`, `dataId=<post id>`, `content`, and optional reply fields.

The `circle` service should read:

- `likeCount` from `action` where `actionType = 1` and `actionValue = 1`
- `favoriteCount` from `action` where `actionType = 2` and `actionValue = 1`
- `commentCount` from `comment` where `status = 1` and `reviewStatus = 1`
- `actionStates` for the current user from `action`

## Error Handling

Frontend mock errors are limited to reserved-action toasts.

Backend controllers should return the existing wrapped response style:

- `code = 200` for success
- `code = 0` for validation or domain failures
- `msg` with a user-readable Chinese message

Missing post/topic records should throw or return `不存在`, matching `forum` service behavior.

## Testing

Frontend verification:

- Run the available frontend type/build command if practical.
- Verify `pages.json` remains valid JSON.
- Verify the new tab icon paths exist.
- Manually inspect the page in H5 if a local dev target is available.

Backend verification:

- Run PHP syntax checks on new PHP files.
- Validate `install/install.json` is valid JSON.
- Confirm no `circle` code writes likes, favorites, or comments directly.

## Open Assumptions

- The current `mcode-app` theme plugin makes `upThemeVars`, `upThemePageStyle`, and `upThemeCardStyle` available globally, as used by existing pages.
- The backend module loader will discover `_content/circle` using the same conventions as `_content/forum`.
- Frontend live API integration will be a later step, so no frontend API client is added now.
