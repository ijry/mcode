# MCode P7-P21 Roadmap Status

## Purpose

This file records the commercial-readiness follow-up phases after the P1-P6
multi-provider routing foundation. It is the progress source of truth for work
that was intentionally left out of the first P1-P6 slices.

## Roadmap Status

| Phase | Goal | Current Status |
| --- | --- | --- |
| P7 | Raw TCP tunnel: mobile WebSocket to relay to desktop to loopback TCP, with stream ids, close/error frames, and loopback-only service validation. | Implemented first slice. Relay exposes authenticated `/v1/tunnel-tcp/:targetId/:port`; desktop bridges `tcp_connect/tcp_data/tcp_close/tcp_error` to configured loopback TCP services. |
| P8 | Official CLI full session lifecycle: `acp_connect`, session ids, restore/resume, cancellation, process lifecycle, and working directory management. | Implemented first slice. Desktop keeps an in-memory CLI session registry, exposes `acp_connect`, `acp_disconnect`, `acp_cancel`, `acp_get_session_snapshot`, and annotates `acp_prompt` state when a `sessionId` is supplied. |
| P9 | Official CLI event normalization: convert Codex/Claude streaming output into MCode ACP-style events, including tool/permission/question states where available. | Implemented first slice. Desktop normalizes CLI JSONL/text output into ACP-style events and forwards response `events` as relay `event_push` frames. |
| P10 | Desktop production hardening: reconnect/backoff, ACK/replay persistence, single-controller enforcement, diagnostics, crash recovery, and safe shutdown. | Implemented first slice. Desktop tracks reconnect/backoff, ACK event id, active controller id, safe shutdown intent, and exposes hardening diagnostics in health/UI. |
| P11 | Enterprise gateway operations: tenants, devices, connection revocation, audit event storage, and gateway access policy hooks. | Implemented first slice. Relay exposes admin-token protected device/session/audit APIs, supports target/session revocation, records audit events, and reports enterprise features/policy in gateway info. |
| P12 | Native/mobile commercial polish: diagnostics before pairing, tunnel/service entry UX, capability-gated flows, and native iOS/Android parity guidance. | Implemented first slice. App has desktop-agent capability helpers, gateway diagnostics, HTTP/TCP tunnel entry builders, and tests under the `agents/mcode-desktop` boundary. |
| P13 | Relay operational durability: persist gateway targets, sessions, revocation state, and audit events across relay restart without changing the wire protocol. | Implemented first slice. Relay supports optional JSON file persistence through `PAIRING_STORE_PATH`; default remains in-memory, pair offers stay short-lived, and health/info report storage mode without leaking paths. |
| P14 | Official CLI process lifecycle: realtime Codex stdout event push, cancellable active process, and session diagnostics for commercial desktop operation. | Implemented first slice. Desktop streams Codex stdout lines as `event_push`, keeps `proxy_response` compatibility, supports `acp_cancel` killing active Codex process, and exposes session event/exit/stderr diagnostics. |
| P15 | Official CLI interaction responses: capture permission/question pending state and resolve through MCode proxy commands without depending on unstable CLI stdin protocols. | Implemented first slice. Desktop records pending permission/question events, exposes `acp_respond_permission` and `acp_respond_question`, emits resolved ACP events, and shows pending interaction diagnostics. |
| P16 | Codex app-server JSON-RPC control channel: use `codex app-server --listen stdio://` for live interactive permission/question flows while keeping `codex exec --json` fallback. | Implemented first slice. Desktop has a newline JSON-RPC stdio transport, optional Codex app-server path, live interaction waiters, and app-server notification to ACP event conversion. |
| P17 | Codex app-server session reuse: keep one app-server client per Desktop CLI session, reuse provider thread ids, and cancel active turns through `turn/interrupt`. | Implemented first slice. Desktop stores per-session Codex app-server handles, reuses `thread/start` results across prompts, exposes provider thread/turn diagnostics, interrupts active turns on `acp_cancel`, and stops the process on `acp_disconnect`. |
| P18 | Claude CLI streaming session adapter: execute Claude official CLI prompts through Desktop with stdout event streaming, cancellation, diagnostics, and P15 pending-interaction integration. | Implemented first slice. Desktop runs Claude print-mode through a process-based adapter, streams normalized events, kills active Claude prompts on `acp_cancel`, and keeps live-control write-back disabled until a stable Claude control channel is verified. |
| P19 | Desktop/Relay recovery layer: relay replay persistence/miss signaling, Desktop outbound ACK queue, runtime snapshot, classified request failures, and recovery diagnostics. | Implemented first slice. Relay persists bounded replay windows when `REPLAY_STORE_PATH` is set, Desktop queues unacked event pushes with `localEventId`, Desktop snapshots recoverable runtime state through `MCODE_DESKTOP_STATE_PATH`, and health/UI expose recovery status. |
| P20 | App recovery UX: consume relay event checkpoints, replay-miss signals, classified gateway failures, and Desktop interrupted/stale recovery state in MCode app. | Implemented first slice. App reconnects relay event streams with `lastEventId`, records checkpoints after successful dispatch, shows replay-miss recovery warnings, maps classified gateway failures to actions, calibrates active conversations after replay gaps, and documents native replication behavior. |
| P21 | App relay checkpoint persistence: persist `lastRelayEventId` per `instanceKey` in app storage so reconnect survives app restart without changing relay or Desktop protocols. | Implemented first slice. App hydrates relay checkpoints from uni storage, persists successful wrapped-event checkpoints, persists replay-miss high-water marks, clears persisted checkpoints on reset, and keeps sensitive gateway data out of the checkpoint store. |

## P7 Implemented Scope

P7 keeps the existing HTTP tunnel path unchanged:

```text
/v1/tunnel/:targetId/:port/*
```

Raw TCP uses a separate authenticated WebSocket path:

```text
/v1/tunnel-tcp/:targetId/:port
```

The relay sends desktop upstream frames:

- `tcp_connect`: `{ streamId, port }`
- `tcp_data`: `{ streamId, dataBase64 }`
- `tcp_close`: `{ streamId }`
- `tcp_error`: `{ streamId, error }`

The first P7 implementation only allows desktop services bound to
`127.0.0.1`. Non-loopback exposure remains out of scope until an explicit
security confirmation and policy model exists.

Implemented behavior:

- Relay keeps one TCP stream per mobile WebSocket connection.
- Relay validates access token target id against the path target id.
- Relay forwards mobile WebSocket bytes as upstream `tcp_data`.
- Desktop opens configured `protocol = tcp` loopback services only.
- Desktop returns TCP bytes as upstream `tcp_data` with `dataBase64`.
- Desktop and relay both propagate close/error frames and clean stream state.
- Desktop UI lets the user choose `HTTP` or `TCP` for a local service.

## P8 Implemented Scope

P8 adds the first official CLI session lifecycle layer inside
`mcode-desktop`. Codex and Claude official CLIs are still not mobile-side
`targetAgent` values; they remain desktop runtimes under
`targetAgent = mcode-desktop`.

Desktop now keeps an in-memory `cliSessions` registry. Each session records:

- `sessionId`
- `runtime`
- `agentType`
- `workingDir`
- `status`
- `createdAtMs` / `updatedAtMs`
- `activeRequestId`
- `cancelRequested`
- `lastPromptPreview`
- `error`

Implemented proxy commands:

- `acp_connect`: creates a new CLI session or resumes an existing session id.
- `acp_disconnect`: marks a session disconnected and clears active request state.
- `acp_cancel`: marks a session canceled and sets `cancelRequested = true`.
- `acp_get_session_snapshot`: returns one session by id or all sessions.
- `acp_prompt`: when `sessionId` is supplied, validates the session runtime,
  injects `agentType` / `workingDir`, records running/completed/error status,
  and keeps the existing adapter dispatch boundary.

Working directory rules:

- Missing `workingDir` defaults to the desktop process current directory for a
  new session.
- Existing sessions keep their previous `workingDir` when resumed without a new
  value.
- Relative paths are resolved from the desktop process current directory.
- Non-directory paths are rejected before any official CLI process is started.

Current limitations:

- Session state is memory-only; durable replay and crash recovery are P10 scope.
- `acp_cancel` records cancellation intent but does not yet kill a live official
  CLI process because long-running process handles are still P9/P10 work.
- Claude prompt execution remains guarded by the adapter until command semantics
  and permission handling are implemented.

## P9 Implemented Scope

P9 adds a desktop-side event normalization layer for official CLI adapters. The
first slice is intentionally format-tolerant: it accepts JSONL records when the
CLI emits structured output, and falls back to plain text `stream_batch` events
when output is unstructured.

Normalized event envelope:

- `type`
- `connectionId`
- `data`

Supported normalized event types:

- `stream_batch`
- `tool_call`
- `tool_call_update`
- `permission_request`
- `permission_resolved`
- `question_request`
- `question_resolved`
- `usage_update`
- `status_changed`
- `turn_complete`
- `error`

Codex adapter behavior:

- `codex exec --json` stdout is parsed as JSONL when possible.
- Structured records are mapped into ACP-style events.
- Plain text lines are mapped into `stream_batch` text events.
- If a prompt produces events but no explicit completion event, desktop
  synthesizes `status_changed(idle)` and `turn_complete`.
- The proxy response keeps `stdout` / `stderr` for diagnostics and adds
  `events` / `eventCount` for normalized consumption.

Relay delivery behavior:

- `connect_upstream` inspects successful proxy response bodies.
- If the body has `events: []`, desktop sends one `event_push` frame per event
  before the original `proxy_response`.
- Relay already broadcasts `event_push` through the existing `/v1/events`
  path, so mobile clients can consume these as normal ACP events.

Current limitations:

- This is not yet true child-process line-by-line streaming; Codex still uses
  the current non-interactive process execution boundary.
- Event shape handling is defensive and format-tolerant because official CLI
  JSON records are not treated as a stable public API.
- Claude prompt execution remains gated, but the same normalizer can consume
  Claude-style JSONL/text once its adapter starts executing prompts.

## P10 Implemented Scope

P10 adds the first desktop production-hardening layer around the existing
gateway upstream.

Implemented desktop state:

- `upstreamReconnectAttempt`
- `upstreamNextRetryDelayMs`
- `lastAckEventId`
- `activeControllerId`
- `shutdownRequested`

Implemented behavior:

- `desktop_connect_gateway` starts a supervisor loop through
  `connect_upstream_until_stopped`.
- Connection failures record reconnect attempt count and exponential backoff
  delay, capped at 30 seconds.
- `mark_upstream_online` clears retry state.
- Relay `ack` frames update `lastAckEventId`.
- Relay `controller_attached` frames update `activeControllerId` and append a
  diagnostic entry.
- `shutdown_runtime` and tray shutdown set `shutdownRequested` before exiting,
  so the upstream supervisor can stop retrying.
- Desktop health snapshot and the connection page expose reconnect, ACK,
  controller, and shutdown diagnostics.

Current limitations:

- ACK state is in-memory only; durable replay persistence is still future work.
- Single-controller enforcement is represented as active controller tracking,
  but hard rejection of a second controller still belongs to a gateway policy
  slice.
- Crash recovery does not persist sessions or pending events across desktop
  process restart yet.

## P11 Implemented Scope

P11 adds the first enterprise operations layer to `mcode-relay`.

Config additions:

- `ADMIN_TOKEN`
- `ACCESS_POLICY`

Admin APIs:

- `GET /v1/admin/devices`
- `GET /v1/admin/sessions`
- `GET /v1/admin/audit-events`
- `POST /v1/admin/devices/:targetId/revoke`
- `POST /v1/admin/devices/:targetId/restore`
- `POST /v1/admin/sessions/:sessionId/revoke`

Implemented behavior:

- Admin APIs require `x-mcode-admin-token` or bearer token matching
  `ADMIN_TOKEN`.
- Pairing records device name from `x-mcode-device-name` and user-agent on the
  session.
- Session revocation blocks later proxy/tunnel/events/targets access.
- Target revocation marks the target revoked and revokes all active sessions for
  that target.
- Refresh token use is rejected after session or target revocation.
- Relay stores bounded in-memory audit events for session create/refresh and
  admin revoke/restore operations.
- `/health` stats include revoked sessions, revoked targets, and audit event
  count.
- `/v1/gateway/info` advertises enterprise device/session/audit/access-policy
  features and reports configured `accessPolicy`.

Current limitations:

- P11 state is in-memory; durable database-backed audit/session/device storage is
  still required for commercial production.
- `ACCESS_POLICY` is reported as a deployment hook but not yet a policy engine.
- There is no tenant model yet; all admin APIs operate on the single gateway
  instance.
- Admin authentication is a shared token suitable for first self-hosted slice,
  not full RBAC.

## P12 Implemented Scope

P12 adds the first mobile/native polish layer on the app side while preserving
agent-specific code isolation.

Implemented app module:

```text
mcode-app/src/agents/mcode-desktop/capabilities.ts
```

Implemented helpers:

- `getDesktopCapabilityLabels()`
- `hasDesktopCapability()`
- `diagnoseDesktopGatewayConnection()`
- `buildDesktopTunnelEntry()`

Implemented behavior:

- Desktop capability labels are owned by the `mcode-desktop` agent directory,
  not by shared connection presentation code.
- Gateway diagnostics detect direct desktop routes, missing gateway base URL,
  missing pair session, and missing capability metadata.
- HTTP tunnel entries build `/v1/tunnel/:targetId/:port/*` URLs.
- TCP tunnel entries build `/v1/tunnel-tcp/:targetId/:port` URLs.
- Tunnel entries are disabled unless the connection is `mcode-desktop/gateway`
  and has `desktop.tunnel.available`.
- Connection presentation delegates desktop capability chips to the desktop
  agent helper.

Current limitations:

- This is a helper/presentation first slice; no new mobile page is added yet for
  browsing multiple desktop services.
- The helper builds tunnel URLs but does not open WebSocket TCP sessions itself.
- Native iOS/Android clients should replicate these rules in their own platform
  code rather than sharing the TypeScript module directly.

## P13 Implemented Scope

P13 adds the first durable operational state layer to `mcode-relay`.

Config addition:

- `PAIRING_STORE_PATH`

Implemented behavior:

- When `PAIRING_STORE_PATH` is empty, relay keeps the previous in-memory
  `PairingStore` behavior.
- When `PAIRING_STORE_PATH` is set, relay persists a JSON snapshot after target,
  session, revocation, preference, and audit-event mutations.
- Persisted snapshot contains `targets`, `sessions`, and bounded
  `auditEvents`.
- Short-lived pair offers are intentionally not persisted; relay restart still
  invalidates pending pair codes.
- Invalid or unreadable JSON falls back to empty state instead of crashing relay
  startup.
- `/health` reports `storage.pairingStore = "memory" | "json-file"`.
- `/v1/gateway/info` reports the same storage mode under `deployment.storage`
  but never exposes the local file path.

Current limitations:

- JSON file persistence is a first commercial-hardening slice, not a
  horizontally scalable database layer.
- Concurrent multi-process relay instances must not share the same JSON file.
- There is no migration framework yet; future database-backed storage should
  implement the same `PairingStoreStorage` boundary.
- Pairing codes remain ephemeral by design and must be regenerated after relay
  restart.

## P14 Implemented Scope

P14 upgrades the desktop official CLI adapter from collect-then-return output to
a cancellable, streaming first slice.

Implemented behavior:

- `mcode-desktop` adds an optional runtime event sink used only by gateway
  upstream proxy handling.
- Codex `acp_prompt` now spawns `codex exec --json` with piped stdout/stderr
  instead of `Command::output()`.
- Each stdout line is normalized immediately into ACP-style events and sent to
  relay as `event_push`.
- The final `proxy_response` still includes `stdout`, `stderr`, `events`,
  `eventCount`, and now includes `streamedEventCount`, `exitCode`,
  `stderrPreview`, and `canceled`.
- Upstream post-response event forwarding skips the first `streamedEventCount`
  events to avoid duplicate mobile stream text, while still forwarding final
  completion/status events.
- `acp_cancel` looks up the active process control for the session, signals
  cancellation, kills the child process, and marks the session canceled.
- Desktop health/session state now includes `lastEventAtMs`, `exitCode`, and
  `stderrPreview`.
- Desktop Agents page shows latest session diagnostics so users can see active
  request, last event time, exit code, and stderr preview.

Current limitations:

- P14 streaming is line-based stdout streaming, not byte/token-level streaming.
- P14 implements real process cancellation for Codex CLI only.
- Claude prompt execution remains explicitly unsupported until command semantics
  and permission handling are verified.
- Permission/question events can be normalized if emitted, but responding to
  them through a live CLI stdin/control channel remains future work.

## P15 Implemented Scope

P15 adds the first response loop around normalized official CLI interaction
events while keeping official CLI protocol assumptions conservative.

Implemented behavior:

- Desktop session health includes `cliPendingInteractions`.
- Permission and question request events from final normalized CLI response
  events are captured into desktop pending interaction state.
- Each pending interaction records `interactionId`, `sessionId`, `kind`,
  `status`, timestamps, summary, original event data, and resolution metadata.
- `acp_respond_permission` validates `sessionId` and `requestId` /
  `interactionId`, marks the permission resolved, and returns a
  `permission_resolved` event.
- `acp_respond_question` validates `sessionId` and `questionId` /
  `interactionId`, marks the question resolved, and returns a
  `question_resolved` event.
- Existing desktop upstream response handling forwards returned `events[]` as
  `event_push`, so relay protocol does not change.
- Desktop Agents page shows pending interaction count and latest pending
  interaction summary.

Current limitations:

- P15 does not write permission/question responses to a live Codex or Claude
  stdin/control channel.
- Pending interaction capture happens from normalized response events; realtime
  mobile events still arrive immediately through P14 streaming.
- If official CLI interactive response protocols are later verified, adapter
  internals can consume the resolved state without changing MCode app/relay
  protocol.

## P16 Implemented Scope

P16 adds the first verified live control-channel path for Codex official CLI
without changing the app or relay protocol.

Implemented transport:

- `mcode-desktop/src-tauri/src/runtime/json_rpc.rs` implements newline-framed
  JSON-RPC 2.0 over child process stdio.
- The transport supports outbound requests, notifications, response matching by
  id, request timeouts, inbound server requests, and stderr preview capture.
- Inbound server requests are answered asynchronously, so app-server permission
  requests can block until the MCode user responds.

Implemented Codex app-server path:

- The app-server adapter is opt-in through
  `MCODE_DESKTOP_CODEX_APP_SERVER=1` or the test command override
  `MCODE_DESKTOP_TEST_CODEX_APP_SERVER_COMMAND`.
- The default command is `codex app-server --listen stdio://`.
- Desktop sends `initialize`, then `initialized`, then `thread/start`, then
  `turn/start`.
- App-server notifications such as `thread/started`, `turn/started`,
  `item/agentMessage/delta`, `item/started`, `item/completed`, usage updates,
  and `turn/completed` are converted to existing ACP-style events.
- Successful app-server responses return a compatible proxy body with
  `runtime`, `protocol = codex-app-server`, `status`, `events`, `eventCount`,
  and `streamedEventCount`.
- If app-server is disabled or fails and
  `MCODE_DESKTOP_CODEX_APP_SERVER_REQUIRED` is not set, desktop falls back to
  the existing `codex exec --json` path.

Implemented live interaction behavior:

- App-server inbound permission/question methods are converted immediately into
  `permission_request` or `question_request` ACP events.
- Desktop stores a live oneshot waiter in `cli_interaction_waiters` and also
  records the visible interaction in `cliPendingInteractions`.
- `acp_respond_permission` and `acp_respond_question` still return the P15
  resolved event, and additionally resolve the live waiter when one exists.
- Permission responses use provider-tolerant shapes for common app-server
  request sources such as `item/commandExecution/requestApproval`,
  `item/fileChange/requestApproval`, `item/permissions/requestApproval`, and
  `mcpServer/elicitation/request`.
- Final response pending capture skips events already counted by
  `streamedEventCount`, preventing a live-resolved interaction from being
  re-added as pending.

Current limitations:

- P16 keeps app-server opt-in until real-world Codex CLI version compatibility
  is validated.
- The app-server process is scoped to the current prompt turn in this first
  slice; durable provider thread reuse and crash recovery remain future work.
- Claude still does not use a live control channel in MCode Desktop.
- The notification mapper intentionally covers the common event subset first;
  richer Codex timeline items can be added behind the same ACP event boundary.

## P17 Implemented Scope

P17 changes the Codex app-server lifecycle from prompt-scoped to Desktop
session-scoped.

Implemented desktop state:

- `codexAppServerSessions` in `AppState`, keyed by MCode CLI `sessionId`.
- `CliRuntimeSession.protocol`
- `CliRuntimeSession.providerThreadId`
- `CliRuntimeSession.activeTurnId`
- `CliRuntimeSession.appServerActive`

Implemented behavior:

- The first Codex `acp_prompt` for a Desktop CLI session starts
  `codex app-server --listen stdio://`, initializes it, and calls
  `thread/start`.
- Later prompts for the same `sessionId` and `workingDir` reuse the existing
  JSON-RPC transport and provider `threadId`.
- If the transport is closed or the `workingDir` changes, Desktop stops the old
  app-server process and creates a fresh provider thread.
- Long-lived notification/request handlers use a per-turn context that is bound
  at prompt start and cleared at prompt completion, so each response still
  receives only that prompt's events.
- `turn/started` updates `activeTurnId`; `turn/completed` clears it.
- `acp_cancel` triggers the existing cancellation signal and, for app-server
  turns, sends `turn/interrupt` with `threadId` and `turnId`.
- If `turn/interrupt` cannot be sent or the provider does not settle quickly,
  Desktop stops the app-server transport and future prompts recreate it.
- `acp_disconnect` stops the persistent Codex app-server process for the
  session.

Compatibility:

- No relay or MCode app protocol changes.
- `codex exec --json` remains the fallback when app-server is disabled.
- Codex remains a Desktop capability under `targetAgent = mcode-desktop`, not a
  mobile direct target.

Current limitations:

- Provider thread mapping is memory-only and is lost when Desktop restarts.
- The app-server path remains opt-in until Codex CLI version compatibility is
  validated outside tests.
- Only Codex uses the live app-server control channel; Claude remains on the
  conservative adapter path.

## P18 Implemented Scope

P18 makes the Claude official CLI adapter usable without changing MCode app or
relay protocols. Claude still remains a Desktop capability under
`targetAgent = mcode-desktop`; it is not a mobile-side direct target.

Default command behavior:

- Production binary defaults to `claude`.
- Test override uses `MCODE_DESKTOP_TEST_CLAUDE_COMMAND`.
- Deployment override uses `MCODE_DESKTOP_CLAUDE_COMMAND`.
- Desktop builds the default print-mode shape as `claude -p <prompt>
  --output-format stream-json --verbose --include-partial-messages`.
- If the payload includes `permissionMode` / `permission_mode`, Desktop maps it
  to Claude `--permission-mode`.

Implemented behavior:

- `acp_prompt` works for `agentType = claude_code`.
- Desktop reads Claude stdout line by line and emits normalized ACP-style events
  through the existing realtime event sink.
- Final proxy responses include `runtime = "claude-cli"`,
  `protocol = "claude-cli-stdio"`, `status`, `canceled`, `exitCode`,
  `stderrPreview`, `stdout`, `stderr`, `events`, `eventCount`, and
  `streamedEventCount`.
- `acp_cancel` uses the existing `cli_processes` cancel registry to terminate
  an active Claude child process.
- Session snapshots record the protocol, last event time, exit code, stderr
  preview, and canceled/completed status through the existing P8/P14 session
  diagnostics.
- Permission/question records recognized in Claude output are captured into
  P15 `cliPendingInteractions`.
- `acp_respond_permission` and `acp_respond_question` resolve the MCode-visible
  pending state and emit resolved events, with `liveResolved = false`.

Compatibility:

- Relay wire protocol is unchanged.
- MCode app continues to consume `/v1/events` and `/v1/proxy/:command`.
- No official Claude credentials are sent to app or relay.
- Codex streaming and Codex app-server behavior remain unchanged.

Current limitations:

- P18 does not implement live write-back into Claude stdin or a Claude server
  protocol.
- The adapter relies on Claude CLI print-mode output remaining compatible enough
  for defensive normalization.
- A future phase can replace the internal process adapter with a verified
  Claude SDK/server protocol without changing app or relay.

Native iOS/Android guidance:

- Native clients should treat Claude exactly like other Desktop runtime
  sessions: `acp_connect`, `acp_prompt`, `/v1/events`, `acp_cancel`,
  interaction response commands, and `acp_disconnect`.
- Native clients should display `protocol = claude-cli-stdio` only as
  diagnostics, not as a business-logic branch.
- Native clients must not start Claude CLI directly or manage official Claude
  credentials.

## P19 Implemented Scope

P19 adds the first recovery layer for Desktop gateway connections without
changing the external agent model. Codex and Claude remain Desktop capabilities
under `targetAgent = mcode-desktop`.

Relay recovery behavior:

- `REPLAY_STORE_PATH` enables bounded JSON replay persistence with schema
  `mcode.relay.replay.v1`.
- `/v1/events` sends ready metadata containing replay window information and
  emits `replay_miss` when the requested checkpoint is outside the retained
  window.
- `event_push.localEventId` is stored in relay event frames and echoed in
  `ack.localEventId` so Desktop can remove confirmed local queue entries.
- Runtime proxy, tunnel, and TCP failures use classified request failure codes:
  `target_offline`, `desktop_replaced`, `session_revoked`, `request_timeout`,
  and `gateway_shutdown`.

Desktop recovery behavior:

- Desktop has a bounded outbound event queue with default limit 500.
- Realtime CLI event sink and proxy response `events[]` enqueue before sending
  `event_push`.
- Upstream reconnect replays unacked events in local order.
- `MCODE_DESKTOP_STATE_PATH` enables JSON runtime snapshots with schema
  `mcode.desktop.state.v1`.
- Snapshots include recoverable target/gateway/local service state, ACK
  checkpoints, queued outbound events, CLI session metadata, pending
  interactions, and bounded diagnostics.
- Running sessions restore as `interrupted`; pending interactions for those
  sessions restore as `stale`.
- Snapshots exclude pair offers, pair secrets, app/relay access tokens, refresh
  tokens, official CLI credentials, and live process handles.

UI and client behavior:

- Desktop connection UI displays local ACK id, relay event id, queued event
  count, recovery storage mode, replay support, and oldest queued local event.
- Desktop agent UI displays interrupted session and stale interaction counts.
- Native clients should store the last processed relay `eventId` per gateway
  connection and pass it as `lastEventId` on `/v1/events` reconnect.
- When `replay_miss` arrives, clients should show a recoverable warning and
  refresh session state; they must not reconnect as `codex` or `claude`.
- `target_offline` and `request_timeout` are retryable operation failures;
  `session_revoked` means the gateway session must be reset.

## P20 Implemented Scope

P20 closes the app-side recovery loop for P19 relay/Desktop signals. It remains
app-only: relay and Desktop wire protocols do not change, and official CLIs
remain Desktop capabilities under `targetAgent = mcode-desktop`.

Implemented behavior:

- `RelayGateway.connectEvents(..., { lastEventId })` appends a positive relay
  checkpoint to `/v1/events` reconnects.
- `acpApi` stores an in-memory relay checkpoint per `instanceKey`, separate
  from ACP conversation `seq`.
- Wrapped relay events advance the checkpoint only after successful dispatch;
  failed dispatch does not acknowledge progress in app state.
- `ready` clears stale recovery warnings and can refresh replay metadata.
- `replay_miss` updates realtime bridge health, shows recoverable detail-status
  copy, and calibrates active conversations bound to the affected `instanceKey`.
- Classified gateway failures map to actionable app copy for `target_offline`,
  `request_timeout`, `session_revoked`, `desktop_replaced`, and
  `gateway_shutdown`.
- Desktop interrupted/stale display helpers live under
  `mcode-app/src/agents/mcode-desktop`, preserving the agent-specific
  directory boundary.

Native iOS/Android replication rules:

- Store relay `eventId` checkpoints per authenticated gateway connection, not
  globally and not per ACP conversation.
- Pass `lastEventId` only when reconnecting the same gateway session context.
- Update the checkpoint after the wrapped event payload is handled, not when the
  WebSocket frame is received.
- Treat `replay_miss` as a recoverable state refresh, not as a conversation
  event.
- Keep Codex and Claude official CLIs behind `mcode-desktop` capabilities; do
  not add mobile-side `codex` or `claude` target agents.

## P21 Implemented Scope

P21 makes the P20 relay checkpoint survive app restart. It remains app-only:
relay and Desktop wire protocols do not change, and no new visible UI is added.

Implemented behavior:

- `relayCheckpointStore` owns the versioned `mcode_relay_checkpoints_v1`
  storage snapshot.
- `acpApi` hydrates the relay checkpoint before reconnect and persists it after
  successful dispatch.
- `replay_miss` persists the relay high-water mark when the relay provides a
  positive `lastEventId`.
- `clearRelayRecoveryState()` clears both memory recovery state and persisted
  checkpoint storage.
- The store never holds tokens, pair secrets, official CLI credentials, or raw
  relay payloads.

Native iOS/Android replication rules:

- Persist relay checkpoints in small key-value storage scoped by gateway
  instance identity.
- Store only `instanceKey`, positive relay `lastRelayEventId`, and `updatedAt`.
- Hydrate the checkpoint before opening `/v1/events`.
- Persist after successful wrapped-event handling, not on raw WebSocket receive.
- Never persist gateway tokens, official CLI credentials, or raw event payloads
  in checkpoint storage.

## Tracking Rules

- Every phase implementation must update
  `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`.
- Each phase should keep relay, desktop, and app protocol naming aligned on
  `targetAgent`, not `targetType`.
- Do not treat Codex or Claude official CLI as mobile-side `targetAgent`
  values; they remain `mcode-desktop` capabilities.
