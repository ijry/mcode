# MCode P20 App Recovery UX Design

## Goal

P20 completes the mobile/app side of the P19 recovery layer. Relay and Desktop
already expose replay checkpoints, `replay_miss`, classified failures, queued
event ACK state, interrupted sessions, and stale interactions. P20 makes
`mcode-app` consume those signals so Desktop gateway users see a coherent
recovery experience after mobile reconnect, relay replay gaps, Desktop restart,
or gateway session revocation.

## Non-Goals

- Do not change relay or Desktop wire protocol.
- Do not introduce mobile-side `codex` or `claude` target agents.
- Do not add VS Code or code-server assumptions.
- Do not persist official CLI credentials, relay access tokens, refresh tokens,
  pair secrets, or Desktop runtime snapshots in new app storage.
- Do not build a new conversation sync protocol; use the existing realtime
  bridge, conversation calibration, and session snapshot paths.

## Architecture

P20 keeps the recovery logic at the app gateway boundary:

- `RelayGateway.connectEvents()` accepts an optional recovery checkpoint and
  connects to `/v1/events?lastEventId=<id>` when a relay checkpoint exists.
- `acpApi` owns per-remote-instance recovery state because it already owns
  realtime bridge lifecycle, reconnect/backoff health, and event dispatch.
- Relay wrapper frames are handled before ACP event normalization. The app
  dispatches payloads first, then records the wrapper `eventId` as the last
  successfully processed relay event.
- `replay_miss` updates realtime bridge health and triggers existing
  conversation calibration. It is not treated as an ACP conversation event.
- Classified gateway failures are normalized into user-facing retry or reset
  messages in shared gateway error helpers.
- Desktop-specific stale/interrupted presentation stays under
  `mcode-app/src/agents/mcode-desktop/` when it needs agent-specific helpers.

This keeps `targetAgent + routeMode` as the routing contract and avoids pushing
Desktop recovery branches into generic direct agent code.

## Data Flow

Normal reconnect flow:

```text
MCode app bridge disconnects
  -> acpApi schedules reconnect
  -> acpApi reads instance checkpoint lastRelayEventId
  -> RelayGateway connects /v1/events?lastEventId=lastRelayEventId
  -> relay sends ready/replay frames or live event frames
  -> app dispatches frame payload
  -> app records frame.eventId only after dispatch succeeds
```

Replay miss flow:

```text
relay sends { type: "replay_miss", requestedLastEventId, replayWindowStart, lastEventId }
  -> app marks bridge health recoveryIssue = "replay_miss"
  -> conversation detail shows recoverable warning
  -> app triggers existing conversation calibration / session refresh path
  -> app updates checkpoint to relay lastEventId only after refreshed state is accepted
```

Classified failure flow:

```text
/v1/proxy or tunnel returns { code, message }
  -> gateway error normalizer maps code to user action
  -> target_offline/request_timeout: retryable
  -> session_revoked: gateway session reset / re-pair required
  -> desktop_replaced: desktop upstream replaced; reconnect bridge
```

## Event Checkpoint Rules

- Checkpoints are scoped by realtime `instanceKey`, not by conversation id.
- Only relay wrapper `eventId` values update the checkpoint.
- The app must not update the checkpoint for `ready`, `replay_miss`, malformed
  frames, or payloads that fail dispatch.
- Direct connections continue without relay `lastEventId`.
- The checkpoint can remain memory-only in P20. It survives bridge reconnect in
  the same app process and page lifetime; durable app restart recovery remains a
  later app storage slice.
- The app must keep the existing ACP `seq` dedupe inside conversation runtime.
  Relay `eventId` and ACP `seq` are different sequences and must not be merged.

## UI Behavior

Conversation detail should surface recovery without hiding the current task:

- During reconnect, keep the existing realtime reconnect banner.
- If replay miss arrives, show a warning such as
  `实时事件有缺口，正在刷新会话状态。部分中间状态可能已跳过。`
- If recovery finishes and bridge reconnects, reuse the existing recovered
  banner, optionally with replay metadata in diagnostics.
- If the latest Desktop session status is `interrupted`, show it as a terminal
  interrupted state that requires a new prompt. Do not present it as resumable.
- If a permission/question interaction is `stale`, disable the response action
  and show that the original Desktop process has ended.
- `target_offline` and `request_timeout` should keep the retry action available.
- `session_revoked` should tell the user to reconnect or re-pair the gateway
  connection rather than retrying the same request indefinitely.

## Interfaces

Planned app-side additions:

```ts
export interface EventRecoveryOptions {
  lastEventId?: number | null
}

export interface RelayRecoveryMissFrame {
  type: "replay_miss"
  requestedLastEventId?: number | null
  replayWindowStart?: number | null
  lastEventId?: number | null
}

export interface RelayReadyFrame {
  type: "ready"
  replayWindowStart?: number | null
  lastEventId?: number | null
  replayAvailable?: boolean
}

export interface RelayWrappedEventFrame {
  eventId: number
  channel: string
  payload: unknown
  controllerId?: string | null
  localEventId?: number | null
}
```

`CodegGateway.connectEvents()` becomes additive:

```ts
connectEvents(
  onEvent: (event: unknown) => void,
  options?: EventRecoveryOptions
): Promise<EventChannelConnection>
```

Existing callers remain valid because `options` is optional.

`RealtimeBridgeHealth` gains additive recovery fields:

```ts
recoveryIssue?: "replay_miss" | null
lastRelayEventId?: number | null
replayWindowStart?: number | null
requestedLastEventId?: number | null
recoveryMessage?: string | null
```

## Compatibility

- Old relay frames without `eventId` still dispatch through the legacy path.
- Old gateways that ignore `lastEventId` still work because the query parameter
  is optional and only sent for relay mode with a known checkpoint.
- H5 WebSocket auth continues to use subprotocol token transport; native/uni
  runtimes continue to use headers.
- Direct Codeg/OpenCode events are unchanged.
- Desktop official CLI semantics remain hidden behind `targetAgent =
  mcode-desktop`.

## Security

- Do not log full access tokens, refresh tokens, or pair secrets in recovery
  diagnostics.
- Do not persist relay access tokens in the new checkpoint state.
- `lastEventId` is not a secret, but it is scoped to an authenticated session
  and should only be sent to the same relay base URL/instance key.
- `replay_miss` should not dump payload contents into UI diagnostics.

## Testing

P20 should add app unit tests covering:

- Relay event URL includes `lastEventId` when recovery options provide a finite
  positive checkpoint.
- Relay event URL omits `lastEventId` for missing, zero, negative, or direct
  mode checkpoints.
- `acpApi` records checkpoint only after wrapped event dispatch.
- `replay_miss` updates bridge health and does not call conversation event
  listeners as an ACP event.
- Classified gateway failures map to retry/reset user-facing messages.
- Detail status presentation returns a replay-miss warning state.
- Existing direct/gateway connection driver tests continue to pass.

## Native iOS/Android Replication Guidance

Native clients should copy these rules rather than the TypeScript modules:

- Keep one relay checkpoint per gateway connection instance.
- Pass `lastEventId` on `/v1/events` reconnect only when the checkpoint belongs
  to the same gateway session context.
- Update the checkpoint after successful event dispatch, not when a WebSocket
  message is merely received.
- Treat `replay_miss` as a recoverable state refresh signal.
- Do not reconnect as `codex` or `claude`; reconnect the same
  `mcode-desktop/gateway` connection.
- Disable stale permission/question responses after Desktop restart.
- Treat interrupted Desktop sessions as requiring a new prompt or reconnect
  action; do not claim official CLI process resume.
