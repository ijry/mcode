# Conversation Detail Logic Cleanup

## Architecture

`mcode-app` conversation detail keeps the same Vue page and runtime ownership, but pure presentation and normalization logic now lives in sibling TypeScript modules under `mcode-app/src/pages/conversation-detail/`.

The page remains responsible for lifecycle hooks, route parsing, gateway calls, store mutations, timers, scroll/layout measurement, persistence side effects, and `uni` UI feedback. Helper modules are deterministic and do not call `uni`, repositories, stores, gateways, or realtime transports.

## Protocol And Data Flow

No ACP, realtime, SQLite, opened-tab sync, local runtime, or draft persistence protocol changed.

The existing detail load order is unchanged:

1. route and connection context
2. local summary and persisted turns
3. persisted runtime and draft snapshot
4. optional remote detail metadata or calibration
5. realtime connection and snapshot hydration
6. composer config and slash command hydration

The extracted helpers only transform data already owned by the page.

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

Do not move ACP connection management, realtime authority, or SQLite calibration into these helpers.
