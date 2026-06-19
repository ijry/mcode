# Detail Connecting Operation Blocker

## Architecture

Conversation detail now treats `runtimeStatus === "connecting"` as a blocking transition state. The page keeps the existing runtime store status model and adds only a local presentation computed, `showConnectingOperationBlocker`, in `mcode-app/src/pages/conversation-detail/index.vue`.

## Protocol And Data Flow

No protocol, storage, or websocket payload changes are required.

1. The detail page reads the active conversation session from the runtime store.
2. `runtimeStatus` continues to derive from that session.
3. When the status is `connecting`, the template renders a fixed overlay below the navbar.
4. When the runtime leaves `connecting`, Vue removes the overlay and normal detail controls become interactive again.

## UI Behavior

The overlay displays `正在连接智能体...` with a loading spinner and blocks taps, scroll gestures, composer actions, toolbar actions, queue actions, and floating buttons inside the detail page. The navbar remains outside the overlay so users can still go back if connecting stalls.

`waiting_permission` and `waiting_question` are intentionally not blocked because those states require user input. `thinking` and `running_tool` also keep the existing waiting UI and stop action instead of using the connection blocker.

## Compatibility

This is a client-only visual/interaction change. It uses uview-plus runtime `--up-*` theme variables and does not introduce new app-specific theme aliases.

## Native iOS/Android Replication Guidance

Native clients should map the same runtime status to a modal page-level interaction blocker:

- Show it only for `connecting`.
- Start the overlay below the navigation bar so back navigation remains available.
- Absorb touch and scroll events over the detail content and composer.
- Hide it immediately when runtime status changes away from `connecting`.
- Do not block permission/question states because they require direct user action.
