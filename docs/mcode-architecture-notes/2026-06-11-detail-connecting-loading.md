# Detail Connecting Loading

## Scope

The mobile `mcode-app` conversation detail page now surfaces the ACP runtime
`connecting` state with an inline loading indicator below the navbar.

## Architecture And Data Flow

The detail page continues to derive connection state from the local conversation
runtime session. `session.status === "connecting"` maps to
`showConnectingIndicator`, which only controls presentation. No transport,
repository, event-stream, or protocol payload changes are introduced.

## UI Behavior

When the detail runtime is connecting, the page shows a non-blocking banner with
a spinner and the text `正在连接智能体...`. The existing navbar status label still
shows `连接中`. The banner disappears automatically when the runtime leaves the
`connecting` state.

The indicator is placed above the message list, so it remains visible without
covering messages, permission cards, queued drafts, or the composer. When the
plan-task floating panel is present, the banner keeps the existing right padding
pattern used by other top status strips.

## Compatibility

This is a presentation-only change. Existing sessions, cached conversation
data, and shared-live behavior are unchanged. The implementation uses uview-plus
runtime theme variables with the `--up-*` prefix and does not add new theme
aliases.

## Native iOS/Android Replication Guidance

Native clients should observe the same runtime status source used for the
detail navbar. Render a non-modal loading strip when the status is `connecting`,
hide it for all other statuses, and avoid blocking input or changing lifecycle
behavior. Use platform theme primary/card colors equivalent to `--up-primary`
and `--up-card-bg-color`.
