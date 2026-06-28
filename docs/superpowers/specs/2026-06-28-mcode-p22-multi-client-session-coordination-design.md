# MCode P22 Multi-client Session Coordination Design

## Goal

P22 makes `mcode-desktop` the session host for official CLI-backed agents while
allowing multiple MCode clients to connect at the same time. Phone, watch, and
desktop clients can all observe the same active Codex/Claude CLI turn in real
time, regardless of which client started it. Write actions are coordinated per
Desktop-hosted session so official CLI state stays ordered and safe.

## Non-Goals

- Do not add mobile-side `codex` or `claude` target agents. Official CLI agents
  remain Desktop capabilities exposed under `targetAgent = mcode-desktop`.
- Do not reject a second client merely because another client is already
  connected.
- Do not make relay the official CLI session owner.
- Do not build queued turn execution in the first slice.
- Do not add VS Code or code-server assumptions.
- Do not expose official CLI credentials, local tokens, or pair secrets to the
  app or relay.

## Recommended Approach

Desktop owns the agent session. Relay owns multi-client transport. App clients
own presentation and user actions.

```text
MCode client A -> relay -> mcode-desktop -> Codex/Claude CLI session
MCode client B -> relay -> same mcode-desktop session
MCode client C -> relay -> same mcode-desktop session

Desktop publishes current turn events
  -> relay broadcasts to all subscribed clients for that target/session
  -> every client renders the same live stream and pending interactions
```

`/v1/events` must allow multiple subscribers for the same Desktop target. Relay
assigns or accepts a stable `clientId` for each app connection and forwards it
on mutating requests. Desktop uses that source identity only for diagnostics and
operation coordination; it does not make the client the session owner.

## Coordination Model

Desktop maintains runtime state per official CLI session:

```ts
interface DesktopHostedSessionState {
  targetId: string
  agentCapability: "agent.codex" | "agent.claude" | string
  sessionId: string
  activeTurnId: string | null
  activeTurnOwnerClientId: string | null
  activeTurnStartedAt: number | null
  pendingInteractions: Array<{
    interactionId: string
    kind: "permission" | "question"
    status: "pending" | "resolved" | "cancelled"
    responderClientId?: string | null
  }>
}
```

Rules:

- Any authenticated paired client may subscribe to events for the paired target.
- Any client may start a turn when `activeTurnId` is empty.
- When a turn starts, Desktop records `activeTurnOwnerClientId` for diagnostics.
- While a turn is active, another `acp_prompt` returns `turn_busy` instead of
  queueing or running concurrently.
- All clients receive the full live turn stream, status changes, tool events,
  pending permission/question prompts, and final completion/error events.
- Permission/question responses are first-valid-responder-wins. Desktop accepts
  the first valid response, marks the interaction resolved with
  `responderClientId`, and broadcasts the resolved event to every client.
- Clients that receive a resolved interaction must disable local response
  controls and show that the request was handled by another device when
  applicable.
- Cancel/takeover is operation-level, not connection-level. A later slice may
  add explicit cancel-current-turn behavior; P22 first slice only exposes enough
  state for diagnostics and busy copy.

## Relay Behavior

Relay remains a transport gateway:

- Preserve multiple `/v1/events` subscribers per target.
- Attach `clientId` to event connections. If the app provides
  `x-mcode-client-id` or `clientId`, relay validates and reuses it; otherwise it
  creates one.
- Include `clientId` on proxied mutating requests to Desktop, for example in a
  header or request metadata field.
- Broadcast Desktop-originated session events to every subscriber of the target.
- Keep replay/checkpoint behavior independent from client ownership. A
  reconnecting device can replay missed events without stealing session state.
- Do not enforce a single controller lease.

Recommended control/error payload for busy turns:

```json
{
  "code": "turn_busy",
  "message": "another device is running a turn",
  "activeTurnId": "turn-123",
  "activeTurnOwnerClientId": "client-phone",
  "retryable": true
}
```

HTTP status should be `409` for prompt attempts rejected by `turn_busy`.

## Desktop Behavior

Desktop is the authority for official CLI session lifecycle:

- Detect and run Codex/Claude official CLI adapters as Desktop capabilities.
- Keep official CLI credentials local to Desktop.
- Track active turn state and pending interactions per hosted session.
- Convert CLI output into unified MCode events and push them upstream to relay.
- Reject concurrent prompt attempts with `turn_busy`.
- Accept the first valid permission/question response and broadcast resolution.
- Expose health/diagnostics fields such as `subscriberCount`,
  `activeTurnId`, `activeTurnOwnerClientId`, and pending interaction counts.

Desktop may continue to expose `activeControllerId` as a legacy diagnostic, but
P22 semantics should prefer `activeTurnOwnerClientId` and must not treat a
single client as the owner of the whole Desktop target.

## App Behavior

App clients are peer viewers/controllers for the same Desktop-hosted session:

- Multiple devices may remain connected to the same Desktop target.
- Every device renders the active turn stream even when another device started
  the turn.
- When `acp_prompt` receives `turn_busy`, show copy such as:

```text
其他设备正在执行任务，请等待当前任务完成。
```

- When a pending permission/question is resolved elsewhere, disable the action
  controls and show copy such as:

```text
该请求已由其他设备处理。
```

- The UI must not imply the current client owns the whole session. It may show
  "由其他设备发起" or equivalent diagnostics when `activeTurnOwnerClientId`
  differs from the local `clientId`.
- Existing direct Codeg/OpenCode clients are unaffected; this behavior is for
  Desktop-hosted official CLI capabilities.

## Compatibility

- Old apps that do not send `clientId` still work because relay can assign one.
- Old relays that do not attach `clientId` still allow basic single-client
  behavior; Desktop should tolerate missing source identity and use `unknown`.
- Existing P19/P20/P21 replay and checkpoint behavior remains valid.
- Existing `controller_attached` diagnostics are not a coordination contract.
  New code should not build single-controller rejection from them.
- Official and self-hosted gateways use the same multi-client protocol.

## Security

- `clientId` is operational metadata, not authentication. Authorization still
  comes from pairing/session tokens.
- Never send official CLI tokens or local account secrets through relay.
- Busy and interaction-resolution events may include client ids, but should not
  include raw device names unless the user explicitly configured a display name.
- Audit logs should record target id, session id, client id, operation type,
  and result without raw credentials or prompt bodies unless an enterprise
  deployment explicitly enables prompt auditing.

## Testing

P22 should add tests covering:

- Relay accepts multiple `/v1/events` subscribers for one Desktop target.
- Relay assigns/reuses `clientId` and forwards it on proxy calls.
- A Desktop-hosted session broadcasts one client's turn stream to every client.
- A second `acp_prompt` during an active turn returns `turn_busy`.
- Permission/question response is first-valid-responder-wins.
- App error normalization maps `turn_busy` to the approved Chinese copy.
- App event handling disables resolved interactions handled by another device.
- Existing relay replay/checkpoint tests still pass.

## Native iOS/Android Replication Guidance

Native clients should copy these rules:

- Generate and persist a per-install `clientId` for gateway connections.
- Always subscribe to the Desktop target event stream even when another device
  started the active turn.
- Treat `turn_busy` as a recoverable state, not a disconnected/error state.
- Disable permission/question controls when a resolved event arrives from any
  device.
- Keep Codex and Claude official CLI entries under
  `targetAgent = mcode-desktop` with capabilities `agent.codex` and
  `agent.claude`; do not create native mobile-side official CLI agents.
