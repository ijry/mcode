# Detail Streaming: No Full-History Refresh Mid-Transmission

## Scope

Fixes a `mcode-app` conversation-detail case where, while an assistant turn was
actively streaming (typically a viewer/observer session, or a turn started from
another device), the runtime kept issuing full remote `get_folder_conversation`
pulls on almost every realtime event. Each pull re-parsed the whole session file
on the backend, persisted every turn, and reassigned the entire local turn
buffer. The repeated whole-list reassignment made the message list flicker and
the scroll position jump during streaming.

## Architecture And Data Flow

The runtime still backfills an *external* user turn that the local client never
sent optimistically (so the viewer can see the prompt that produced the live
reply). That backfill lives in `maybeBackfillExternalUserTurn` in
`mcode-app/src/stores/conversationRuntime.ts` and runs `calibrateAfterReplayGap`
(a full `get_folder_conversation` + persist + local reload).

The change makes that backfill **succeed at most once per in-progress turn**
instead of firing repeatedly for the turn's whole streaming lifetime:

- A new transient session field `externalTurnBackfilled` gates the backfill.
  While it is set **and the local turn buffer is non-empty**, streaming events do
  not trigger any further full pulls. The buffer check is important: if local
  turns are still empty (a viewer / fresh device opening an already in-progress
  conversation), the backfill keeps running until history arrives, so the user is
  never left staring at a blank list mid-stream. The guard only suppresses
  *re-pulling on top of an already-populated list*, which is the flicker source.
- After a backfill completes, the turn is considered "captured" — and the guard
  is set — when either the backend has reported an in-flight user turn id
  (`session.inFlightUserTurnId`), or the reloaded local turns contain one more
  `user` turn than before the pull. Either signal means the external prompt is
  now visible, so there is nothing more to backfill for this turn.
- The 1.5s throttle and the in-flight lock (`externalTurnBackfillInFlight`) are
  retained. They now only matter for the transient window before the first
  successful capture (e.g. the backend has not yet exposed the pending user
  message), so at most a few pulls happen before the guard latches.

The guard is reset at every turn boundary so the next turn can backfill once
more:

- `completeTurn` (turn finished)
- `turn_cancelled` realtime event
- `disconnect`
- the connection-adoption reset inside `connect` (when a conversation is
  re-bound to a different connection id)
- `clearCachedSessionState`

To further reduce render churn, the backfill now reassigns `session.localTurns`
only when the reloaded turns actually differ (compared by length and by each
turn's `id` / `status` / `timestamp` via `areLocalTurnsEquivalent`). An
identical reload no longer replaces the array reference, so the timeline
projection and the detail list do not re-render for a no-op refresh.

`turn_complete` behavior is unchanged: the completion path still runs
`calibrateAfterReplayGap` / `calibrateAfterTurnComplete` exactly as before to
pick up the final assistant turn and calibrate summary/stats. Only the
mid-stream, per-event backfill is rate-limited to once per turn.

The relay replay-miss path (`calibrateActiveConversationsAfterReplayMiss` →
`calibrateActiveConversationsForInstance`) is also unchanged. A genuine realtime
event gap still forces a calibration, because that is a recovery case, not
normal streaming.

## Realtime `user_message` event (external prompt without a full pull)

The backend broadcasts `AcpEvent::UserMessage { message_id, blocks }` (wire type
`user_message`) so OTHER clients viewing a conversation can synthesize the user
turn in real time when a prompt is sent from the desktop or another device. The
same prompt is also captured into `SessionState.pending_user_message` and shipped
on the live snapshot for clients attaching mid-turn.

`mcode-app` previously ignored this event entirely (`normalizeAcpEvent` dropped
unknown types via `default: return null`), so an externally-sent prompt only
appeared via a full `get_folder_conversation` backfill — slow, and the source of
the "only the assistant reply shows, not the user prompt" bug. Now:

- `normalizeAcpEvent` maps `user_message` to `{ messageId, blocks }`.
- `EventEnvelope.type` includes `"user_message"`.
- The runtime handles it in `applyRealtimeUserMessage`: it maps `blocks`
  (`{type:"text"}` / `{type:"image", data, mime_type}`) to content parts,
  synthesizes one `user` turn keyed by `message_id`, and appends it to
  `localTurns` (deduped by `(role, id)`). It skips the echo when the sender
  already has an optimistic turn, and skips when a turn with that id is already
  present.
- `hydrateLiveSnapshot` runs the same synthesis for `pending_user_message`, so a
  cold mid-turn attach also shows the external prompt (not just its id anchor).

With the external prompt now delivered by the realtime event and the snapshot,
the streaming-phase full pull is no longer the mechanism that surfaces it.

## UI Behavior

During an actively streaming turn the message list no longer flickers or jumps
because of repeated whole-buffer reloads. The external user prompt still appears
(once), the live assistant bubble keeps streaming, and the final turn is still
reconciled on completion.

Nothing changes for a locally-sent turn: those already have an optimistic user
turn, so the backfill early-returns as before.

## Compatibility

No ACP schema, SQLite schema, or realtime event payload changed.
`externalTurnBackfilled` is transient runtime-only state (like the existing
`externalTurnBackfill*` fields) and needs no migration. Backends that do not
expose an in-flight user turn id still work: the "one more local user turn"
signal latches the guard, and the turn-boundary resets keep it from starving a
later turn.

## Native iOS/Android Replication Guidance

Native clients should mirror the same runtime-level rule:

- Keep external-user backfill (full detail pull) for viewer/other-device turns,
  but make it succeed at most once per in-progress turn. Latch a per-session
  "already backfilled this turn" flag once the pending user turn becomes
  visible — either the backend reported an in-flight user turn id, or the
  reloaded local turns gained a user turn. Only let the flag suppress further
  pulls while the local buffer is non-empty; if local history is still empty,
  keep pulling so an observer is not shown a blank list.
- Reset that flag at every turn boundary: turn complete, turn cancelled,
  disconnect, connection re-bind, and cached-state cleanup.
- When reloading persisted turns after a pull, diff against the current buffer
  and only replace it when something actually changed, so a no-op refresh does
  not trigger a full list re-render mid-stream.
- Do not touch the turn-complete calibration or the realtime replay-miss
  recovery path; those must still do a full reconcile.
