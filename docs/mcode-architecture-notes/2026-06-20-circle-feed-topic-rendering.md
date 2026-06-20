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

## Protocol And Data Flow

The frontend calls the xycloud circle API through `src/services/circle.ts`:

- `GET /v1/circle/post/lists?order=latest|hot&keyword=&topicId=`
- `GET /v1/circle/topic/lists`
- `POST /v1/circle/post/add`
- `POST /v1/action/action/set`

Circle requests use the same xycloud origin resolver as account auth. Runtime
overrides from `VITE_XYCLOUD_BASE_URL` still take precedence; otherwise the
default API base URL is `https://getmcode.lingyun.net/api`.

Post list responses are normalized to `CirclePost` with `topicIds`,
`topicTitles`, `topicList`, optional `userTitle`, action counts, and
`liked/favorited`. Publish sends `content`, optional `title`, direct `topicIds`
as comma-separated IDs, and optional `images`.

## Backend Shape

`xy_circle_post` stores `topicIds varchar(128)`. Topic filtering uses
`FIND_IN_SET(<topicId>, topicIds)`. `order=latest` sorts by sort number and post
time; `order=hot` sorts by view count first.

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
clients should not send old single-topic fields or `tags`; send `topicIds`
only. Backend demo SQL drops old `topicId`/`tags` columns after migrating local
demo data into the new shape.

## Native iOS/Android Replication Guidance

Native clients should model posts with `topicIds: number[]`, no tag array, and
optional `userTitle`. Use three top tabs for latest, hot, and topics, then show
the selected feed/topic content immediately below the tab bar. Render the title
chip after the username with `userTitle.bgColor`. Hide the publish title input
until body length is greater than 200, and hide feed titles when trimmed title is
empty. Resolve circle API requests through the same origin setting used for
account APIs, defaulting to `https://getmcode.lingyun.net/api` when no
environment or app-config override is present.
