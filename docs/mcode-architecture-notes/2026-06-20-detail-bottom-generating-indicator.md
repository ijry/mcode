# Detail Bottom Generating Indicator

## Scope

`mcode-app` conversation detail now shows a stronger bottom-of-thread activity
indicator while an existing conversation is generating a response.

## Architecture And Data Flow

The indicator is derived entirely from the existing local runtime session in
`mcode-app/src/pages/conversation-detail/index.vue`.

It is visible when:

- the detail page is not in initial loading
- at least one message is already rendered
- there is no pending permission or question interaction
- runtime status is `thinking` or `running_tool`

No ACP protocol, repository schema, cache format, realtime transport, or
conversation runtime state-machine change is required. `stream_batch` continues
to drive `thinking`, tool events continue to drive `running_tool`, and
`turn_complete` clears the indicator through the existing runtime status
transition.

## UI Behavior

The message list now renders a compact bottom pill directly above the bottom
anchor and fixed composer. It contains:

- a larger animated primary-color spinner/orb
- the explicit title `生成中`
- a secondary status line from the active model label, falling back to
  `正在整理回复` or `正在执行操作`
- three animated dots for continuous motion

The existing first-response empty waiting card remains unchanged and is used
only before any visible message exists. Permission and question cards continue
to take precedence, so the bottom generating indicator does not compete with
required user actions.

## Compatibility

This is presentation-only. Existing conversations, restored runtime snapshots,
shared live sessions, queued drafts, and token stats are unaffected.

The implementation uses uview-plus runtime theme variables with the `--up-*`
prefix for colors and backgrounds and does not introduce `--mcode-*` aliases.

## Native iOS/Android Replication Guidance

Native clients should render the same bottom-of-thread indicator when the
conversation has visible messages and runtime status is `thinking` or
`running_tool`, excluding permission/question waits.

Place it after the latest rendered message and before the composer safe-area
spacer. Use the platform primary color for the spinner and dots, card/background
theme colors for the pill, and remove it immediately when the runtime leaves
the generating states or a blocking interaction appears.
