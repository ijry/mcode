# Circle Feed Real API And Topic Rendering

## Architecture

Circle posts use direct multi-topic assignment. A post owns `topicIds`, an
ordered comma-separated list of topic IDs on the backend and `number[]` on the
client. There is no post-topic relation table and no tag system for circle
posts.

The mcode circle page uses `up-tabs` with three panes: `最新`, `热门`, and
`话题`. `最新` and `热门` render post feeds. `话题` renders topic cards; selecting a
topic applies a `topicId` filter while posts still keep all topic IDs in
`topicIds`. Tabs are followed directly by the selected content panel; there is
no separate introduction or summary card between the tabs and the list.

Feed cards render username, backend-managed user title, and time. The time row
does not append a redundant single topic. Topic chips below content are derived
from `topicList/topicIds` and can show multiple topics.

Post images use `images` only. The old post-level `cover` single-image field is
removed from the circle post model; clients render `images` as a 1-9 image grid
and must not read or submit `cover` for posts.

## Protocol And Data Flow

The frontend calls the xycloud circle API through `src/services/circle.ts`:

- `GET /v1/circle/post/lists?order=latest|hot&keyword=&topicId=`
- `GET /v1/circle/topic/lists`
- `POST /v1/circle/post/add`
- `POST /v1/action/action/set`
- `GET /v1/comment/comment/lists?dataModel=circle_post&dataId=<post id>`
- `POST /v1/comment/comment/add`
- `POST /v1/core/index/upload`

Circle requests use the same xycloud origin resolver as account auth. Runtime
overrides from `VITE_XYCLOUD_BASE_URL` still take precedence; otherwise the
default API base URL is `https://getmcode.lingyun.net/api`.

Post list responses are normalized to `CirclePost` with `topicIds`,
`topicTitles`, `topicList`, optional `userTitle`, action counts,
`liked/favorited`, and `images`. Publish sends `content`, optional `title`,
direct `topicIds` as comma-separated IDs, and `images` as an array of uploaded
image URLs. The publish page uploads selected local images through
`/v1/core/index/upload` first, then submits the returned `data.url` values with
the post payload.

Feed pagination is page based. Initial latest/hot loads request page 1 with
limit 20. Page pull-down refresh reloads latest and hot from page 1; page
reach-bottom loads the next page for the active latest/hot tab and appends
deduplicated posts. The topic tab does not trigger feed pagination.

The comment action opens a bottom `up-popup` panel. The panel reads top-level
comments from the shared comment module with `dataModel=circle_post`, displays
up to 10 backend-provided child replies per top-level comment, and uses
`POST /v1/comment/comment/add` with `pid=0` and `tpid=0` for new top-level
comments. The backend validates 5-300 characters, so native clients should keep
the same minimum before enabling send. If the user switches posts while a
comment request is pending, stale responses must be ignored so they do not
overwrite the active panel.

The comment popup uses a fixed-height bottom sheet with the comment list inside
a `scroll-view`. The composer remains outside the scroll region so long comment
lists can scroll independently without hiding the input.

## Backend Shape

`xy_circle_post` stores `topicIds varchar(128)`. Topic filtering uses
`FIND_IN_SET(<topicId>, topicIds)`. `order=latest` sorts by sort number and post
time; `order=hot` sorts by view count first. Post media is stored only in
`images text` as a JSON array of URLs. `cover` is no longer part of
`xy_circle_post`.

`xy_circle_user_profile` stores circle-specific user title assignments:
`uid`, `title`, `titleBgColor`, `sortnum`, and `status`. The circle admin can
assign one active title profile per user. Post API responses include the active
profile as `userTitle: { title, bgColor }`.

## Publish Behavior

The publish page shows the content textarea and topic picker by default. The
title input is hidden until content length exceeds 200 characters. When visible,
the title remains optional. Empty titles are submitted as an empty string and
feed cards hide the title block when `trim(title)` is empty.

## Compatibility Considerations

This is an intentional direct architecture change, not a compatibility shim. New
clients should not send old single-topic fields, `tags`, or post `cover`; send
`topicIds` and `images` only. Backend demo SQL drops old `topicId`/`tags` and
post `cover` columns after migrating local demo data into the new shape.

Every circle SQL schema or seed-data change must also ship an independent
manual upgrade SQL file under the circle module `install/` directory. Aggregate
install/update scripts may keep the latest full state, but operators should be
able to apply a specific change by executing only its dated standalone SQL file,
for example `2026-06-20-circle-post-topic-ids.sql`,
`2026-06-20-circle-user-profile.sql`, and
`2026-06-20-circle-post-images.sql`.

## Native iOS/Android Replication Guidance

Native clients should model posts with `topicIds: number[]`, no tag array, and
optional `userTitle`. Use three top tabs for latest, hot, and topics, then show
the selected feed/topic content immediately below the tab bar. Render the title
chip after the username with `userTitle.bgColor`. Hide the publish title input
until body length is greater than 200, and hide feed titles when trimmed title is
empty. Upload selected local images before publishing, store the returned URL
array in `images`, and render up to nine images in a grid. Use a fixed-height
scroll container for comment panels so the input composer stays visible. Support
pull-down refresh and reach-bottom pagination for latest/hot feeds. Resolve
circle API requests through the same origin setting used for account APIs,
defaulting to `https://getmcode.lingyun.net/api` when no environment or
app-config override is present.
