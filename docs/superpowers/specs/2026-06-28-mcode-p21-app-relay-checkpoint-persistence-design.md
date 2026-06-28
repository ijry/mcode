# MCode P21 App Relay Checkpoint Persistence Design

## Goal

P21 makes the P20 app-side relay checkpoint survive app restart. P20 already
tracks `lastRelayEventId` in memory and passes it as `lastEventId` when the
realtime bridge reconnects. P21 persists that checkpoint locally so a
`mcode-desktop/gateway` connection can recover relay events after the mobile app
is killed, reloaded, or background-evicted.

## Non-Goals

- Do not change relay or Desktop wire protocol.
- Do not introduce mobile-side `codex` or `claude` target agents.
- Do not add VS Code or code-server assumptions.
- Do not persist relay access tokens, refresh tokens, pair secrets, official
  CLI credentials, raw relay event payloads, or Desktop runtime snapshots in the
  checkpoint store.
- Do not persist ACP conversation `seq` values in the relay checkpoint store.
- Do not add a SQLite table for this first slice; a small `uni` storage record
  is enough.

## Recommended Approach

Add a small app-side storage boundary:

```text
mcode-app/src/services/gateway/relayCheckpointStore.ts
```

The store owns serialization, validation, pruning, and clearing for relay
checkpoint records. `acpApi` remains the owner of realtime bridge recovery
state, but it hydrates `lastRelayEventId` from the store when creating a
per-`instanceKey` recovery state and persists new checkpoints after successful
event handling.

This keeps checkpoint persistence out of connection records. Connection records
contain configuration and credentials; relay checkpoints are runtime recovery
state. Keeping them separate reduces migration risk and avoids mixing non-secret
event cursors with gateway tokens.

## Storage Model

Storage key:

```text
mcode_relay_checkpoints_v1
```

Stored shape:

```ts
interface RelayCheckpointStorageSnapshot {
  version: 1
  checkpoints: RelayCheckpointRecord[]
}

interface RelayCheckpointRecord {
  instanceKey: string
  lastRelayEventId: number
  updatedAt: number
}
```

Rules:

- `instanceKey` is the same realtime remote instance key used by `acpApi`.
- `lastRelayEventId` must be a finite positive integer.
- `updatedAt` is Unix milliseconds from `Date.now()`.
- Invalid records are ignored during reads.
- The store keeps a bounded number of records, default `50`, ordered by newest
  `updatedAt`.
- Storage failures should not break realtime; they are best-effort warnings.

## Data Flow

Hydration:

```text
acpApi getOrCreateRelayRecoveryState(instanceKey)
  -> relayCheckpointStore.readRelayCheckpoint(instanceKey)
  -> seed recovery.lastRelayEventId when positive
  -> ensureRealtimeBridge passes checkpoint to RelayGateway.connectEvents()
```

Successful wrapped event:

```text
relay sends { eventId, channel, payload }
  -> acpApi dispatches payload
  -> dispatch succeeds
  -> acpApi updates memory lastRelayEventId
  -> acpApi persists { instanceKey, lastRelayEventId, updatedAt }
```

Failed wrapped event:

```text
relay sends { eventId, channel, payload }
  -> app dispatch throws
  -> memory checkpoint is not advanced
  -> persistent checkpoint is not advanced
```

Replay miss:

```text
relay sends { type: "replay_miss", requestedLastEventId, replayWindowStart, lastEventId }
  -> acpApi marks bridge health recoveryIssue = "replay_miss"
  -> acpApi triggers active conversation calibration
  -> if lastEventId is positive, acpApi stores it as the new relay high-water checkpoint
```

Persisting `replay_miss.lastEventId` does not mean the missing events were
handled. It means the app has accepted a state refresh path and should not keep
asking relay for an event id outside the retained replay window.

Clear/reset:

```text
acpApi.clearRelayRecoveryState(instanceKey)
  -> clears memory state for instanceKey
  -> clears persisted checkpoint for instanceKey

acpApi.clearRelayRecoveryState()
  -> clears all memory recovery states
  -> clears all persisted relay checkpoints
```

## Compatibility

- Direct Codeg/OpenCode connections do not use the relay checkpoint store.
- Existing P20 memory-only behavior remains valid if storage read/write fails.
- Existing `/v1/events?lastEventId=` semantics do not change.
- Relay `eventId` remains separate from ACP `seq`.
- Old stored values or malformed snapshots are ignored rather than migrated.
- `instanceKey` can include gateway URL and target identity, but must not be
  replaced by an access token or refresh token.

## UI Behavior

P21 does not add new visible UI. Existing P20 recovery indicators continue to
work:

- Bridge health can show the hydrated `lastRelayEventId`.
- Replay miss still shows a recoverable warning.
- Connection/retry behavior improves after app restart because reconnect can
  use the last persisted relay checkpoint.

Future diagnostics pages may display checkpoint age, but P21 should not add a
new page or settings switch.

## Security

- The checkpoint store must never include gateway `accessToken`,
  `refreshToken`, `pairSecret`, official CLI credentials, prompt text, event
  payloads, or Desktop runtime snapshots.
- `lastRelayEventId` is non-secret but scoped to an authenticated gateway
  connection; send it only to the same `instanceKey` context.
- Logs should mention only `instanceKey`, checkpoint id, and storage failure
  class. Do not log tokens or raw event payloads.

## Testing

P21 should add app unit tests covering:

- Store writes a valid checkpoint and reads it back.
- Store ignores zero, negative, non-finite, malformed, and wrong-version
  snapshots.
- Store prunes old records beyond the retention limit.
- `acpApi` hydrates `lastRelayEventId` from persistent storage.
- Successful wrapped event dispatch persists the new checkpoint.
- Failed dispatch does not persist the new checkpoint.
- `replay_miss` with positive `lastEventId` persists the relay high-water
  checkpoint while preserving replay-miss health.
- Clearing recovery state removes persisted checkpoints.

## Native iOS/Android Replication Guidance

Native clients should copy the behavior, not the TypeScript implementation:

- Use a small local key-value record or platform preferences storage for relay
  checkpoints.
- Scope checkpoints by the same stable gateway instance identity used for
  realtime reconnect.
- Store only positive relay `eventId` values and an update timestamp.
- Hydrate the checkpoint before opening `/v1/events`.
- Persist after successful event handling, not on raw WebSocket receive.
- On `replay_miss`, persist relay `lastEventId` only after starting the state
  refresh/calibration path.
- Never persist gateway tokens, official CLI credentials, or event payloads in
  the checkpoint record.
