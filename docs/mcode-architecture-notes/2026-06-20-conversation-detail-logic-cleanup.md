# Conversation Detail Logic Cleanup

## Architecture

`mcode-app` conversation detail keeps the same Vue page and runtime ownership, but pure presentation, normalization, and connection-resolution logic now lives in sibling TypeScript modules under `mcode-app/src/pages/conversation-detail/`.

The page remains responsible for lifecycle hooks, route parsing, gateway calls, store mutations, timers, scroll/layout measurement, persistence side effects, and `uni` UI feedback. Helper modules are deterministic and do not call `uni`, repositories, stores, gateways, or realtime transports.

Within the page, the conversation load path is now split into small page-local helpers for route auth sync, local SQLite hydration, remote detail metadata hydration, initial remote detail persistence, live snapshot loading, snapshot metadata persistence, and slash command hydration. These helpers still live in `index.vue` because they coordinate page refs, repositories, gateways, and runtime stores.

Connection key construction, stored connection normalization, stored connection lookup, and remote instance descriptor construction are pure helper logic in `detailConnectionResolution.ts`. The page still owns `uni` storage reads, auth store mutation, gateway creation, and relay-session persistence.

## Protocol And Data Flow

No ACP, realtime, SQLite, opened-tab sync, local runtime, or draft persistence protocol changed.

The existing detail load order is unchanged:

1. route and connection context
2. local summary and persisted turns
3. persisted runtime and draft snapshot
4. optional remote detail metadata or calibration
5. realtime connection and snapshot hydration
6. composer config and slash command hydration

The extracted helpers only transform data already owned by the page. This now includes local SQLite persisted turn rows: `detailDataNormalization.ts` maps sorted persisted parts into renderable `MessageTurn` content without changing repository queries or storage schema.

The page-local load helpers preserve the same fallback behavior: local summary/runtime state is preferred for a warm start, remote detail metadata is fetched only when no managed session or resume id exists, and live snapshot metadata is persisted only when the snapshot can be trusted by conversation lookup, existing resume id, or managed external id.

Connection resolution preserves the existing direct and relay identity rules: connection keys normalize trailing slashes, direct instance principals prefer inline tokens before token-store fallbacks, and relay principals prefer target id, then refresh token, then access token, then anonymous relay fallback.

Draft restore and persistence snapshot shaping is also pure normalization logic. Restore precedence remains cached view state, local draft snapshot, then persisted runtime JSON; queue expansion still prefers explicit cached/local flags and otherwise opens when restored queued drafts exist.

Runtime presentation helpers now own compact token formatting, queued-draft labels, optimistic attachment text, stoppable runtime status checks, live activity signatures, and network-like error detection. These helpers do not mutate runtime state and should be safe to mirror in native UI layers.

Status presentation helpers now own retry text, network reachability hints, toolbar/banner status state, waiting-state copy, bottom generating copy, and runtime dot labels/classes. The Vue page passes the uview theme resolver into these helpers so color variables still come from `--up-*` runtime theme variables.

Scroll state helpers now own initial turn limit selection, oldest-history cursor derivation, message anchor id normalization, render-anchor resolution for merged assistant turns, and the pure choice of initial scroll restore action. The page still owns DOM measurement, selector queries, and `uni.pageScrollTo` calls.

Composer presentation helpers now own detail composer summaries, active model status labels, config-row expansion decisions, immutable selection updates, persisted-selection payload shaping, and the list of mode/config values that should be applied when a realtime connection appears. The page still owns cache reads/writes, gateway discovery, ACP `set_mode` / `set_config_option` calls, and toast feedback.

Slash command helpers now own slash trigger detection, filtering, default descriptions, composer text insertion, preset passthrough, and snapshot command normalization. The page still owns the composer refs and decides when to show or write command text.

Draft queue helpers now own queued draft construction, prompt block construction, attachment splitting, prompt-start status checks, and queue-process eligibility. The page still owns realtime connection recovery, PC tab readiness, optimistic runtime mutation, ACP `prompt` calls, watcher lifetimes, toast feedback, and queue mutation side effects.

Attachment upload helpers now own image/file picker payload normalization, upload endpoint/header construction, and uploaded-attachment response shaping. The page still owns platform chooser calls, `uni.uploadFile`, progress mutation, toast feedback, and auth/descriptor lookup.

## UI Behavior

There are no template, copy, style, or theme-variable changes. Message rendering still merges adjacent assistant turns the same way, plan-task badges keep the same counts and labels, permission command extraction keeps the same default text, and ask-question answers keep the same submitted payload shape.

## Compatibility

Existing local cache records, draft snapshots, attachment payloads, turn rows, ACP payloads, and realtime events remain compatible. Malformed backend or local-storage data still falls back to empty arrays or safe defaults rather than throwing.

## Native iOS/Android Guidance

Native clients can mirror these helpers as pure presentation/normalization utilities:

- keep runtime, networking, storage, and UI side effects in the screen/controller layer
- merge adjacent assistant turns before rendering message cells
- parse task lists from plan content and task/todo tool calls into ordered task models
- split permission descriptions into text and command blocks before display
- build ask-question responses from a local selection map
- normalize backend turns, agent aliases, restored drafts, and restored attachments defensively
- map persisted local turn rows into message parts with stable part-index ordering
- keep screen-level load orchestration explicit: hydrate local cache first, optionally hydrate remote metadata, connect realtime, then apply the live snapshot and slash commands
- derive remote instance descriptors from stored connection records without mutating auth or storage inside the pure helper
- restore composer text, queued drafts, attachments, and queue expansion using the same cache, local snapshot, and runtime fallback order
- compute runtime badges, queue labels, token summaries, optimistic attachment copy, and network-failure hints with side-effect-free presentation helpers
- derive banner, toolbar, waiting, and generating status copy from runtime status, bridge health, retry state, long-wait timers, and model labels without changing realtime behavior
- choose history cursors and restore-scroll targets in pure helpers, then execute actual page scrolling in the Vue screen layer
- keep composer configuration UI derivation pure, then apply selected mode/options through ACP only from the page/controller layer
- normalize slash commands from live snapshots and update composer text through pure string helpers before assigning it in the screen
- build prompt input blocks and draft queue decisions in pure helpers, while leaving actual send/retry/runtime mutation in the screen/controller layer
- normalize picked files and upload responses in pure helpers, while leaving platform file picking and upload tasks in the screen/controller layer

Do not move ACP connection management, realtime authority, or SQLite calibration into these helpers.
