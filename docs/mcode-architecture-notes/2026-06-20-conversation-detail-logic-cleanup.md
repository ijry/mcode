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

Do not move ACP connection management, realtime authority, or SQLite calibration into these helpers.
