# MCode P19 Desktop/Relay Recovery Design

## Purpose

P19 turns the P10/P13 reliability slices into a commercial recovery layer for
MCode Desktop gateway connections. P18 made both Codex and Claude official CLI
adapters usable through Desktop; the next weakest production boundary is
reliability across disconnects, relay restarts, and Desktop restarts.

The goal is to make transient failures diagnosable and recoverable without
changing the external connection model. MCode app still connects to
`targetAgent = mcode-desktop`, relay still forwards frames, and official CLI
credentials stay local to Desktop.

## Problem

Current behavior is good enough for a first slice but not commercial-grade:

- Relay already has per-target replay buffers for `/v1/events`, but replay
  state is memory-only and mobile replay is limited to the current relay
  process lifetime.
- Desktop tracks `lastAckEventId`, reconnect attempts, and active controller,
  but outbound `event_push` frames are not queued durably before ACK.
- Desktop CLI sessions, pending interactions, diagnostics, and local service
  configuration are memory-only.
- If Desktop disconnects while a prompt is streaming, events generated during
  the offline window can be lost unless the adapter is still connected to relay.
- Pending proxy/tunnel requests time out, but the failure reason is not
  classified as retryable, offline, replaced upstream, or revoked session.

P19 should reduce data loss and make recovery behavior explicit.

## Recommended Approach

Implement a layered recovery model:

1. Relay keeps its current live replay behavior but adds replay metadata,
   window-miss signaling, and optional JSON persistence for event replay
   buffers.
2. Desktop introduces an outbound event queue that assigns local sequence ids,
   keeps unacknowledged `event_push` frames, and replays them after reconnect
   until relay ACKs the matching local id.
3. Desktop persists recoverable runtime state, including CLI session metadata,
   pending interactions, last ACK, local services, diagnostics, target id, and
   gateway config.

This is more useful than only increasing relay replay size because it covers the
harder failure: Desktop loses upstream connectivity while local CLI output is
still being produced.

## Non-Goals

- Do not add mobile-side `codex` or `claude` target agents.
- Do not make relay parse official CLI semantics.
- Do not persist official CLI credentials or tokens in relay.
- Do not persist live process handles; after Desktop restart, active CLI turns
  are marked interrupted and require a new prompt.
- Do not implement enterprise RBAC or tenant policy in P19.
- Do not implement a database storage engine; JSON persistence is enough for
  this phase and must keep a later database backend possible.

## Architecture

P19 introduces two independent but compatible recovery boundaries.

Relay event replay:

```text
desktop event_push -> relay eventId assignment -> replay buffer -> mobile /v1/events
mobile reconnect with lastEventId -> replay or replay_miss
```

Desktop outbound queue:

```text
runtime event -> Desktop queued event(localEventId)
  -> upstream event_push(localEventId)
  -> relay stores/broadcasts and sends ack(localEventId, eventId)
  -> Desktop removes queued event
```

Desktop restart recovery:

```text
Desktop boot -> load runtime snapshot
  -> restore target/gateway/local services/session metadata/pending interactions
  -> mark previously running CLI sessions interrupted
  -> reconnect upstream
  -> replay queued unacked events
```

## Relay Protocol Additions

P19 should keep existing frames compatible and add optional fields:

- `event_push`: may include `localEventId`.
- `ack`: may include `localEventId` and relay-assigned `eventId`.
- `/v1/events` ready frame may include `replayWindowStart`, `lastEventId`, and
  `replayAvailable`.
- `/v1/events` may send `replay_miss` when `lastEventId` or `Last-Event-Id` is
  older than the retained window. The payload should be
  `{ requestedLastEventId, replayWindowStart, lastEventId }`.

Existing clients that ignore these fields continue to work. Native clients can
use `replay_miss` to show “some events may be missing; refresh session state”.

## Relay Persistence

Relay should extend the existing optional JSON persistence boundary instead of
adding a new storage system:

- Add config `REPLAY_STORE_PATH`. Do not reuse `PAIRING_STORE_PATH`.
- Use schema marker `schema = "mcode.relay.replay.v1"`.
- Persist per-target replay buffers and event sequence counters.
- Keep bounded replay windows. Default retained events per target: `1000`.
- Never persist access tokens, refresh tokens, pair codes, or official CLI
  credentials.
- Health and `/v1/gateway/info` should report replay storage mode without
  exposing local paths.

## Desktop Runtime Snapshot

Desktop should add an optional JSON snapshot file controlled by
`MCODE_DESKTOP_STATE_PATH`. The snapshot should use
`schema = "mcode.desktop.state.v1"` and include:

- `targetId`
- `displayName`
- `gatewayConfig`
- `relayUrl`
- `localServices`
- `lastAckLocalEventId`
- `lastRelayEventId`
- queued outbound events that are safe to replay
- CLI session metadata
- pending interactions
- bounded diagnostics

The snapshot should exclude:

- official CLI credentials
- access/refresh tokens
- live process handles
- JSON-RPC transport state
- raw prompt text beyond the existing preview

On load, sessions that were `running` become `interrupted`. Pending
interactions remain visible but are marked `stale` if their owning session was
interrupted.

## Desktop Outbound Event Queue

Desktop should queue events at the event-sink boundary before sending them to
upstream:

- Assign a monotonic `localEventId`.
- Persist queued events before send when persistence is enabled.
- Send `event_push` with `localEventId`.
- Remove the queued event only after relay ACKs that `localEventId`.
- On reconnect, resend queued events in local id order.
- Keep a bounded queue. Default retained queued events: `500`.
- If the queue overflows, drop the oldest unacked event, record
  `recovery_queue_overflow`, and surface the loss in health diagnostics.

If relay does not understand `localEventId`, Desktop should fall back to current
best-effort behavior and keep diagnostics saying reliable ACK is unavailable.

## Request Recovery

P19 should classify pending proxy/tunnel/TCP failures:

- `target_offline`
- `desktop_replaced`
- `session_revoked`
- `request_timeout`
- `gateway_shutdown`

Relay should reject or fail pending requests with these reasons when Desktop
disconnects, is replaced, or target/session revocation happens. Mobile clients
can use these reason codes later, but P19 does not require app UI changes.
For HTTP proxy requests, the reason should appear in the existing error body as
`{ code, message }`. For WebSocket tunnel/TCP requests, relay should send a
terminal error frame with the same `code` before closing the stream when the
protocol allows it.

## UI And Diagnostics

Desktop health should expose:

- recovery storage mode
- queued outbound event count
- oldest queued local event id
- last relay ACK local event id
- last relay event id
- replay mode supported/unsupported
- interrupted session count
- stale pending interaction count

The existing Desktop connection/agents pages can display these diagnostics
without new navigation.

## Testing

P19 should include:

- Relay unit tests for replay miss detection and persisted replay buffers.
- Relay integration tests for pending request failure reason on desktop
  disconnect/replacement.
- Desktop Rust tests for snapshot save/load and running-session interruption.
- Desktop upstream tests for queued event replay after reconnect and ACK-based
  queue removal.
- Compatibility tests proving old ACK frames still work.

Full verification should include:

- `cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml`
- `cd mcode-desktop && npm test && npm run build`
- `cd mcode-relay && npm test`
- `cd mcode-app && npm run test:unit`
- `git diff --check`

## Compatibility

P19 is additive:

- Existing relay/mobile clients that ignore new replay metadata continue to
  work.
- Existing Desktop event streaming continues when persistence is disabled.
- `targetAgent` remains `mcode-desktop`.
- Codex and Claude official CLI adapters remain internal Desktop capabilities.

## Open Risks

- JSON persistence is not a substitute for a clustered database. It is suitable
  for first commercial hardening and single-instance enterprise gateways only.
- Replaying queued events after a long outage can duplicate events if relay ACK
  state was lost. Protocol should include `localEventId` so relay can dedupe per
  target in a later phase if needed.
- After Desktop restart, live official CLI processes cannot be resumed. P19
  should surface this as interrupted state rather than pretending the turn can
  continue.
