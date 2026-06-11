# Detail Status Actions

## Scope

The mobile `mcode-app` conversation detail status banner now supports lightweight
context actions so users can react to stalled or broken runtime states directly
from the status surface.

## Architecture And Data Flow

The detail page still derives one primary banner from runtime state and bridge
health. The selected banner may now include an optional action key:

- `reconnect`: used for real-time bridge reconnecting or error states.
- `inspect`: used for long-running processing states.

`reconnect` calls `acpApi.reconnectRealtimeBridge(instanceKey)`, which cancels
any pending bridge reconnect timer, closes the current bridge connection if
present, and immediately reruns the shared bridge connection flow.

`inspect` stays local to the detail page. If plan data exists, it opens the
existing plan drawer. Otherwise, it jumps the user to the latest message area
so they can inspect the most recent tool execution or assistant output.

## UI Behavior

When the banner shows reconnecting or bridge error, it renders `立即重试`.
When the banner shows a long-running processing hint, it renders `查看计划` if a
plan exists, otherwise `查看最近一步`.

Actions are non-modal and do not replace the underlying runtime state. They only
help the user act on the current state faster.

## Compatibility

This change does not alter ACP server payloads. The manual reconnect action only
reuses the existing shared realtime bridge lifecycle on the client.

## Native iOS/Android Replication Guidance

Native clients should attach actions to the same top-level status surface rather
than introducing separate dialogs. Reconnect actions should trigger an immediate
transport retry for the active remote instance. Inspect actions should route to
the most relevant existing detail sub-surface, preferring plan/task views when
available.
