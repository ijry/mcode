# MCode P23 Active Turn Control Design

## Goal

P23 adds operation-level control for active Desktop-hosted official CLI turns.
After P22, multiple clients can watch the same Codex/Claude turn and Desktop
rejects concurrent prompts with `turn_busy`. P23 lets any authenticated paired
client request cancellation of the current active turn, while Desktop remains
the session host and every subscribed client receives the same control-state
events.

This is the "takeover" foundation: another device does not steal a running
provider turn. It can cancel the active turn, wait for Desktop to settle the
official CLI process, then start the next prompt after the session becomes idle.

## Non-Goals

- Do not add a single-controller lease.
- Do not move official CLI ownership from Desktop to relay or app clients.
- Do not add mobile-side `codex` or `claude` target agents.
- Do not add prompt queueing.
- Do not create a separate `acp_takeover` command in the first slice.
- Do not expose official CLI credentials, local account tokens, pair secrets,
  or raw provider auth material to relay or MCode clients.
- Do not introduce VS Code or code-server assumptions.

## Recommended Approach

Keep `acp_cancel` as the public control command and make it multi-client aware.
Relay already forwards `clientId` from P22. Desktop should record which client
requested cancellation, emit lifecycle events, invoke the existing adapter
cancel path, and clear hosted active-turn state only after the adapter has
settled.

```text
Client B -> relay /v1/proxy/acp_cancel
  -> relay forwards source client identity
  -> Desktop records cancel request on active turn
  -> Desktop emits turn_cancel_requested to all clients
  -> Desktop interrupts/kills official CLI adapter
  -> Desktop emits turn_cancelled or turn_cancel_failed to all clients
  -> all clients update the same session state
```

## Control Model

Desktop session state should track:

```ts
interface DesktopHostedActiveTurn {
  sessionId: string
  activeTurnId: string
  ownerClientId: string | null
  startedAtMs: number
  cancelRequestedByClientId: string | null
  cancelRequestedAtMs: number | null
  cancelReason: string | null
}
```

Rules:

- Any authenticated paired client may request cancellation of an active turn on
  the same Desktop target.
- `clientId` remains diagnostics and operation metadata, not authentication.
- A cancel request is idempotent while the same turn is already cancelling.
  Desktop should return success with `status = "cancel_requested"` and the
  existing `cancelRequestedByClientId` instead of sending duplicate provider
  interrupts.
- If no active turn exists, `acp_cancel` keeps compatibility with the current
  behavior: mark the session canceled when a session exists and return success.
- After a turn is canceled or fails to cancel, Desktop must remove the hosted
  active-turn guard so future `acp_prompt` behavior is deterministic.
- A new prompt may start only after Desktop has emitted final cancel settlement
  and the active-turn guard is cleared.

## Protocol

`acp_cancel` remains the command name.

Recommended payload fields:

```json
{
  "sessionId": "desktop-session-1",
  "connectionId": "desktop-session-1",
  "reason": "user_cancelled_from_another_device",
  "sourceClientId": "mcode-client-phone"
}
```

Desktop response on accepted cancel:

```json
{
  "status": "cancel_requested",
  "sessionId": "desktop-session-1",
  "activeTurnId": "turn-123",
  "activeTurnOwnerClientId": "mcode-client-watch",
  "cancelRequestedByClientId": "mcode-client-phone",
  "cancelRequestedAtMs": 1782630000000
}
```

Desktop-originated events:

```json
{
  "type": "turn_cancel_requested",
  "connectionId": "desktop-session-1",
  "data": {
    "sessionId": "desktop-session-1",
    "activeTurnId": "turn-123",
    "activeTurnOwnerClientId": "mcode-client-watch",
    "cancelRequestedByClientId": "mcode-client-phone",
    "cancelRequestedAtMs": 1782630000000,
    "reason": "user_cancelled_from_another_device"
  }
}
```

```json
{
  "type": "turn_cancelled",
  "connectionId": "desktop-session-1",
  "data": {
    "sessionId": "desktop-session-1",
    "activeTurnId": "turn-123",
    "cancelRequestedByClientId": "mcode-client-phone",
    "status": "canceled"
  }
}
```

If adapter cancellation fails, Desktop should emit `turn_cancel_failed` with a
safe error summary and clear or rebuild the adapter according to provider
capability. The app should treat `turn_cancel_failed` as a recoverable session
error, not as pairing loss.

## Relay Behavior

- Continue forwarding P22 `clientId` and `client` metadata on `acp_cancel`.
- Continue broadcasting Desktop events to all subscribers for the target.
- Do not decide who is allowed to cancel beyond existing pair/session
  authorization.
- Do not store cancel ownership or turn lifecycle state in relay.
- Official and self-hosted gateways use the same protocol.

## Desktop Behavior

- Extract `sourceClientId` from relay metadata, as in P22.
- When `acp_cancel` targets an active hosted turn, update the active-turn record
  with cancel metadata before invoking adapter cancellation.
- Emit `turn_cancel_requested` before interrupting/killing the adapter so every
  client can update UI immediately.
- Reuse the existing Codex app-server `turn/interrupt` path and fallback stop
  behavior.
- Reuse the existing Claude/process cancellation path.
- Emit `turn_cancelled` after the adapter returns canceled, or
  `turn_cancel_failed` if Desktop cannot cancel safely.
- Expose cancel metadata in health/session snapshots:
  `cancelRequestedByClientId`, `cancelRequestedAtMs`, and `cancelReason`.

## App Behavior

- The cancel action stays visible to any client connected to a Desktop-hosted
  active turn.
- When the current client requests cancel, show "正在取消当前任务..." until final
  settlement.
- When another device requests cancel, show "其他设备正在取消当前任务。"
- On `turn_cancelled`, clear generating state and allow a new prompt.
- On `turn_cancel_failed`, show a recoverable error and keep the session
  refresh/reconnect actions available.
- The UI must not imply a device owns the full session. It may show the active
  turn owner and cancel requester as diagnostics.

## Compatibility

- Older apps can keep calling `acp_cancel(connectionId)`; Desktop should accept
  missing `sourceClientId` and use `unknown`.
- Older relays that do not forward `clientId` still allow basic cancellation
  through Desktop.
- Existing `canceled`/`cancelled` status handling remains valid.
- P23 is additive to P19/P20/P21 recovery and P22 multi-client identity.
- Direct Codeg/OpenCode paths are unaffected unless they later adopt the same
  cancel event names.

## Security

- Pair/session authorization remains the access boundary.
- `clientId` is not proof of identity. It must not be used for privileged
  authorization decisions.
- Event payloads may include client ids but must not include raw prompt bodies,
  official CLI tokens, environment variables, or provider credentials.
- Enterprise audit logs should record target id, session id, client id, command,
  result, and timestamps. Prompt-body audit must remain an explicit enterprise
  policy decision.

## Testing

P23 should add tests covering:

- Relay forwards `clientId` on `acp_cancel`.
- Desktop records cancel requester metadata for an active hosted turn.
- Desktop emits `turn_cancel_requested` before final cancellation.
- Desktop idempotently accepts duplicate cancel requests for the same active
  turn.
- Codex app-server cancellation still interrupts/stops the active provider turn.
- Claude/process cancellation still terminates the active process.
- App normalizes `turn_cancel_requested`, `turn_cancelled`, and
  `turn_cancel_failed` events.
- App shows different copy for local cancel request and another-device cancel
  request.
- Existing P22 `turn_busy` and first-responder-wins tests still pass.

## Native iOS/Android Replication Guidance

Native clients should copy these rules:

- Keep using the persistent per-install relay `clientId`.
- Continue sending cancel through `acp_cancel`; do not implement provider-level
  Codex/Claude cancellation on mobile.
- Treat `turn_cancel_requested` as a shared session state event for all devices.
- Disable duplicate cancel affordances while the turn is already cancelling.
- Only allow a new prompt after `turn_cancelled` or a refreshed session snapshot
  shows no active turn.
- Keep official CLI access under `targetAgent = mcode-desktop` with
  capabilities such as `agent.codex` and `agent.claude`.
