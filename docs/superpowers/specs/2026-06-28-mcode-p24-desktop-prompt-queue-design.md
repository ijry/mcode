# MCode P24 Desktop Prompt Queue Design

## Background

P22 made MCode Desktop the session host for official CLI-backed agents and
rejects concurrent prompts with `turn_busy`. P23 lets any paired client cancel
the active turn. The next commercial-readiness gap is multi-device prompt
submission: phone, watch, and desktop clients can observe the same session, but
only the first active prompt can run. Later prompts currently fail instead of
being queued.

P24 adds a Desktop-hosted prompt queue for official CLI sessions. The queue is
owned by Desktop because Desktop owns the Codex/Claude process/session state.
Relay remains transport only.

## Goals

- Let a paired client submit a prompt while another prompt is active.
- Queue the prompt under the same Desktop CLI `sessionId` instead of returning
  `turn_busy`.
- Broadcast queue lifecycle events to all paired clients.
- Automatically start the next queued prompt after the active turn settles.
- Let a client cancel a queued prompt before it starts.
- Preserve existing direct Codeg/OpenCode behavior.

## Non-Goals

- Do not make relay the prompt queue owner.
- Do not persist queued prompts across Desktop restart in the first slice.
- Do not add mobile-side `codex` or `claude` target agents.
- Do not add a separate `acp_takeover` command.
- Do not queue prompts for direct Codeg/OpenCode unless those agents later
  adopt compatible queue events.

## Protocol

P24 is additive to the existing proxy/event protocol.

### Proxy Commands

`acp_prompt` behavior for `targetAgent = mcode-desktop` official CLI sessions:

- If no active turn exists for `sessionId`, Desktop starts the prompt normally.
- If an active turn exists and `queueIfBusy !== false`, Desktop enqueues the
  prompt and returns:

```json
{
  "status": "queued",
  "queued": true,
  "queueItemId": "queue-...",
  "queuePosition": 1,
  "sessionId": "desktop-session-1",
  "activeTurnId": "turn-live",
  "activeTurnOwnerClientId": "client-phone"
}
```

- If an active turn exists and `queueIfBusy === false`, Desktop keeps the P22
  behavior and returns `turn_busy`.

New command:

- `acp_cancel_queued_prompt`

Input:

```json
{
  "sessionId": "desktop-session-1",
  "queueItemId": "queue-...",
  "reason": "user_cancelled"
}
```

Output:

```json
{
  "status": "cancelled",
  "queueItemId": "queue-..."
}
```

### Events

Desktop emits ACP-style events through the existing `event_push` path:

- `turn_queued`
- `turn_queue_updated`
- `turn_dequeued`
- `turn_started`
- `turn_queue_cancelled`
- `turn_queue_failed`

Event data uses camelCase:

```json
{
  "sessionId": "desktop-session-1",
  "queueItemId": "queue-...",
  "queuePosition": 1,
  "queueLength": 2,
  "sourceClientId": "client-watch",
  "promptPreview": "fix tests",
  "createdAtMs": 1234567890
}
```

`turn_started` is emitted when a queued item becomes the active provider turn.
It includes both `queueItemId` and the new `activeTurnId`.

## Desktop Behavior

Desktop adds an in-memory queue keyed by CLI session id.

Queue item fields:

- `queueItemId`
- `sessionId`
- `runtime`
- `agentType`
- original `acp_prompt` payload
- `sourceClientId`
- `sourceDeviceName`
- `promptPreview`
- `createdAtMs`
- `status = queued | running | cancelled | failed`

When `dispatch_prompt_with_state` sees `turn_busy`, it enqueues the prompt
instead of failing, unless `queueIfBusy === false`.

When an active turn completes, fails, or is cancelled, Desktop checks the queue
for the same `sessionId`. If a queued item exists, Desktop starts it
asynchronously through the same prompt dispatch path. This preserves provider
serialization and keeps relay stateless.

Queue safety rules:

- Default max queue length per session: 20.
- If the queue is full, reject with `turn_queue_full`.
- Only queued items for the same `sessionId` are auto-started.
- Cancelling an active turn does not delete queued prompts.
- Cancelling a queued prompt never cancels the active provider process.

## App Behavior

The app continues sending `acp_prompt` normally. For Desktop gateway sessions,
the default behavior is queue-on-busy. If the proxy response says
`status = queued`, the detail page should not show a fatal send failure; it
should keep the draft visible as queued until `turn_started` or queue failure
events arrive.

The existing local draft queue remains a client-side composer feature. P24
Desktop queue is different: it is shared across all clients connected to the
same Desktop-hosted session.

App event handling:

- `turn_queued`: show shared queued state.
- `turn_queue_updated`: update queue count/positions.
- `turn_dequeued` / `turn_started`: mark the queued prompt as running.
- `turn_queue_cancelled`: remove queued state.
- `turn_queue_failed`: show recoverable error.

First slice may normalize and store the events without building a full queue
management UI, but it must avoid treating `status = queued` as send failure.

## Compatibility

- Existing P22 clients can opt out by sending `queueIfBusy = false`.
- Older Desktop builds still return `turn_busy`; app keeps existing busy copy.
- Direct Codeg/OpenCode paths are unaffected.
- Relay protocol remains unchanged.

## Security

- Pair/session authorization remains the access boundary.
- `clientId` is operational metadata, not authentication.
- Prompt previews should be short and bounded; full prompt-body audit remains an
  explicit enterprise feature, not part of P24.

## Testing

Desktop tests:

- Active turn plus second prompt returns `status = queued`.
- Queue full returns `turn_queue_full`.
- Cancelling a queued item emits queue cancellation and leaves active turn
  untouched.
- Ending an active turn starts the next queued item.

App tests:

- ACP normalizes queue lifecycle events.
- Runtime store records shared queue state.
- Prompt send treats queued response as accepted, not failed.
- Existing `turn_busy` copy still works when `queueIfBusy = false` or older
  Desktop returns busy.

Native iOS/Android replication:

- Treat Desktop prompt queue as shared session state, not local draft state.
- Persist local draft queue separately from Desktop queue events.
- Do not assume the current device owns queued items unless `sourceClientId`
  matches the local install id.

