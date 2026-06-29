# MCode P28 Official CLI Completion Design

## Purpose

P28 finishes the remaining commercial gap in `mcode-desktop` official CLI
support. P18 made Claude CLI usable, P14-P17 made Codex usable, and P22-P27
added shared-host, cancel, queue, and recovery behavior. P28 standardizes the
official CLI host layer so Codex and Claude both expose the same complete
Desktop-managed lifecycle: session creation, prompt streaming, permission and
question interactions, cancellation, reconnect/recovery, and durable diagnostics.

The external product model does not change:

- Codex and Claude official CLIs remain Desktop capabilities under
  `targetAgent = mcode-desktop`.
- `mcode-app` and `mcode-relay` continue to talk only ACP-style proxy/event
  protocol.
- Official CLI tokens, credentials, and process details stay local to Desktop.

## Scope

P28 covers the Desktop runtime behavior needed to treat official CLI sessions as
commercially usable hosted sessions:

- session open/close/reconnect semantics
- prompt dispatch and streaming
- permission and question requests
- cancellation and prompt interruption
- recovery after Desktop/relay reconnect
- diagnostics for process state, pending interactions, and stream health
- one shared adapter contract for Codex and Claude

P28 is not a new target-agent feature and does not change the app connection
model.

## Non-Goals

- Do not add mobile-side `codex` or `claude` target agents.
- Do not add VS Code or code-server assumptions.
- Do not move official CLI state into relay.
- Do not change the connection routing model added in P1-P6.
- Do not add new queue policy behavior; P24-P27 already own prompt queueing.
- Do not make the app understand CLI-specific process details.
- Do not invent a new official CLI wire protocol if the vendor does not expose
  one.

## Architecture

P28 introduces a single Desktop-side official CLI host abstraction that wraps
the existing Codex and Claude adapters behind a shared session lifecycle and
event contract.

```text
MCode app
  -> mcode-relay
  -> mcode-desktop
  -> official CLI host
  -> codex adapter | claude adapter
  -> local CLI process / provider runtime
```

The host owns:

- session registration and lookup
- active turn state
- pending permission/question state
- stdout/stderr normalization
- process cancellation
- reconnect recovery
- diagnostics snapshots

The adapters own only provider-specific details:

- command construction
- output parsing quirks
- capability-specific prompt flags
- vendor-specific termination behavior

The app sees the same ACP-style events regardless of provider. The relay remains
transport-only.

## Session Model

Each official CLI session is a Desktop-owned record with the minimum state
needed to survive reconnects and keep the UI consistent:

- `sessionId`
- `targetAgent = mcode-desktop`
- `agentType = codex | claude_code`
- `protocol`
- `status = idle | connecting | running | waiting_permission | waiting_question | canceled | failed | completed | interrupted`
- `activeTurnId`
- `activeTurnOwnerClientId`
- `lastPromptPreview`
- `lastEventAtMs`
- `pendingPermissionCount`
- `pendingQuestionCount`
- `exitCode`
- `stderrPreview`
- `recoverableState`

The session model must be provider-neutral. Codex and Claude can differ in how
they emit output, but the Desktop-hosted session state must not.

## Prompt Flow

Prompt execution follows the same high-level flow for both providers:

1. `acp_connect` opens or resumes a Desktop-hosted official CLI session.
2. `acp_prompt` submits a prompt to the host.
3. The host spawns or reuses the provider adapter process.
4. Provider stdout/stderr are normalized into ACP-style events.
5. Permission/question requests are recorded as pending interactions.
6. The host updates session diagnostics and emits terminal completion state.

For prompts submitted while a session is busy, P24/P25 queue semantics still
apply. P28 only ensures that once the prompt reaches the host, the provider
lifecycle is complete and consistent.

## Permission And Question Handling

P28 standardizes pending interaction handling so both official CLIs use the
same Desktop-visible interaction state:

- normalize provider output into `permission_request` and `question_request`
  events
- persist each pending interaction in the Desktop session snapshot
- expose a stable interaction id, request preview, and created time
- let any paired client respond through the existing ACP response commands
- broadcast resolved events back to all clients

The host must remain conservative:

- If a provider has no verified live response channel, the Desktop still
  resolves the MCode-visible state and marks `liveResolved = false`.
- If a provider later exposes a stable official approval channel, the adapter
  can add live write-back internally without changing the app protocol.

## Streaming Rules

P28 does not invent a new stream transport. It standardizes the provider
streaming boundary inside Desktop:

- stdout is parsed incrementally and normalized into ACP-style event batches
- structured output is preserved when available, but unknown records do not
  crash the adapter
- partial text, tool calls, status changes, and completion events must remain
  ordered and deduplicated
- stderr is captured for diagnostics and surfaced in session snapshots
- a reconnecting client should see the current visible session state, not a
  blank session

The host must preserve provider-specific timing without leaking provider
semantics into relay or app layers.

## Cancellation And Recovery

Cancellation remains a Desktop responsibility:

- `acp_cancel` targets the active prompt for the session
- active turn cancellation must stop the provider process or its equivalent
  cleanly
- queued prompts remain governed by P24-P27 behavior
- cancellation state must survive app reconnect long enough for the UI to show
  a stable final result

Recovery rules:

- If Desktop restarts, running official CLI turns become `interrupted`.
- Pending interactions from interrupted turns become stale diagnostics.
- A reconnecting app can refresh the session snapshot and see the current
  terminal state without replaying provider-private details.
- Relay replay/checkpoint behavior continues to operate independently of the
  official CLI host.

## Diagnostics

P28 requires richer Desktop diagnostics for official CLI sessions:

- current provider name
- protocol version
- session status
- active turn id and owner client id
- last prompt preview
- last event timestamp
- pending interaction counts
- exit code
- stderr preview
- recoverable interruption/cancellation reason

These diagnostics are for UI and recovery only. They are not credentials and
must not include raw tokens or secrets.

## Compatibility

P28 must remain additive:

- Existing Codex and Claude prompts continue to route through `mcode-desktop`.
- Relay wire protocol remains `proxy_request`, `proxy_response`, and
  `event_push`.
- The app continues to consume ACP-style events only.
- Older clients that do not understand the richer diagnostics should still see
  normal stream and completion behavior.

## Native iOS/Android Replication Guidance

Native clients should copy the session model, not the provider internals:

- Treat official CLI sessions as Desktop-hosted sessions.
- Render session lifecycle, pending interactions, cancellation state, and
  recovery state from the Desktop snapshot.
- Do not implement local Codex or Claude process management on mobile.
- Do not assume the exact stream parsing rules are stable across providers.
- If the snapshot says `interrupted`, surface that as a recoverable restart
  state and require a new prompt.

## Testing

P28 should add tests that prove both providers behave identically at the host
boundary:

- session open returns the same snapshot shape for Codex and Claude
- prompt streaming emits ordered ACP-style events for both providers
- permission/question requests become pending interactions
- `acp_cancel` stops the active provider session
- reconnect after Desktop restart yields `interrupted` rather than a fake
  resumable process
- diagnostics include provider name, protocol, last event time, and stderr
  preview

The test harness should use provider command overrides and fake binaries where
possible so the behavior can be verified without real CLI credentials.
