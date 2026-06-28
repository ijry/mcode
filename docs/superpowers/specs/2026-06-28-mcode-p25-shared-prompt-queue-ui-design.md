# MCode P25 Shared Prompt Queue UI Design

## Background

P24 added the Desktop-hosted prompt queue for official CLI sessions and made the
app normalize queue lifecycle events into `session.sharedPromptQueue`. The queue
is functional but mostly invisible: users only see transient queued copy, not a
clear shared queue list or a way to cancel queued prompts from the app.

P25 makes the shared Desktop queue visible and manageable in the conversation
detail page. It does not change Desktop scheduling ownership: Desktop remains
the queue host, relay remains transport-only, and the app only renders shared
queue state plus sends queued-item cancel commands.

## Goals

- Show Desktop queued prompts in the conversation detail page.
- Keep the Desktop shared queue visually distinct from the local composer draft
  queue.
- Let any paired client cancel a queued prompt before it starts.
- Keep queue state synchronized from P24 lifecycle events, not from local UI
  assumptions.
- Provide testable presentation helpers so native clients can reproduce the same
  behavior.

## Non-Goals

- Do not change Desktop queue scheduling, ordering, or auto-start behavior.
- Do not persist queued prompts on the app or Desktop in P25.
- Do not implement queue reordering, priority, bulk cancel, or queue ownership
  policies.
- Do not add mobile-side `codex` or `claude` target agents.
- Do not merge the shared Desktop queue into the local draft queue data model.

## UX Behavior

The conversation detail composer area will have two separate queue surfaces:

- Local draft queue: existing `draftQueue`, labelled as pending local sends.
- Desktop shared queue: new queue panel backed by `session.sharedPromptQueue`.

Shared queue collapsed bar:

- Visible when `session.sharedPromptQueue.count > 0`.
- Copy: `Desktop 队列 N`.
- Secondary copy shows the first queued prompt preview when present; otherwise
  it shows `等待当前任务完成后执行`.
- Tapping toggles expanded state.

Shared queue expanded panel:

- One row per `sharedPromptQueue.items`.
- Row content:
  - position: `#1`, `#2`, etc.
  - prompt preview, falling back to `队列任务`.
  - source device, falling back to `其他设备` or `当前设备` when
    `sourceClientId` matches the local relay client id.
  - created time formatted with the existing queue time style.
  - action: `取消`.
- Any paired client can cancel any queued item. This follows P23 active-turn
  cancellation semantics and avoids a queue item becoming unmanageable when the
  submitter device is offline.

Cancel interaction:

- Tapping `取消` calls `acp_cancel_queued_prompt`.
- While the cancel request is in flight, disable that row's cancel action and
  show `取消中`.
- Do not remove the row optimistically. The row disappears only after
  `turn_queue_cancelled`, `turn_dequeued`, `turn_started`, or
  `turn_queue_failed` updates runtime state.
- On request failure, keep the row and show a recoverable toast:
  `取消队列任务失败，请稍后重试`.

## App Protocol Boundary

Add an app API method:

```ts
acpCancelQueuedPrompt(
  connectionId: string,
  queueItemId: string,
  sessionId?: string | null
): Promise<any>
```

It sends:

```json
{
  "connectionId": "conn-1",
  "sessionId": "conn-1",
  "queueItemId": "queue-1",
  "reason": "user_cancelled"
}
```

`sessionId` defaults to `connectionId` because Desktop CLI session ids and app
connection ids are the same in the current Desktop gateway path. If a future
snapshot exposes a distinct session id, the caller can pass it explicitly.

The app must not assume a successful HTTP response is final queue state.
Realtime events remain authoritative.

## Presentation Helpers

Create focused helpers for the detail page:

- `hasSharedPromptQueue(queue): boolean`
- `sharedPromptQueueTitle(queue): string`
- `sharedPromptQueueSummary(queue): string`
- `sharedPromptQueueItemPreview(item): string`
- `sharedPromptQueueItemSource(item, localClientId): string`
- `isSharedPromptQueueCancelDisabled(queueItemId, cancellingIds): boolean`

These helpers keep string rules testable and give native clients a clear
behavior map without reading the Vue template.

## Error Handling

- Missing `connectionId`: hide cancel actions because the app cannot address the
  Desktop session.
- Missing `queueItemId`: render the row but hide cancel because no stable item
  identity exists.
- Cancel request failure: leave runtime queue untouched, clear local
  in-flight-cancel state, and show a toast.
- Stale row after cancel attempt: allowed until Desktop emits the next queue
  event; the app should not locally delete queue rows.
- Replay miss: existing P20 calibration behavior remains responsible for
  refreshing session state. P25 does not introduce a separate queue snapshot
  endpoint.

## Compatibility

- Older Desktop builds that do not emit P24 queue events simply never show the
  shared queue UI.
- Older Desktop builds that do not support `acp_cancel_queued_prompt` will return
  a proxy error; the app surfaces the recoverable cancel failure toast.
- Direct Codeg/OpenCode paths are unaffected unless they later emit compatible
  queue events.
- Existing local draft queue behavior remains unchanged.

## Testing

App unit tests:

- Presentation helper tests for title, summary, item preview, local/remote
  source labels, and cancel-disabled state.
- API test or gateway mock test that verifies `acpCancelQueuedPrompt` sends
  `acp_cancel_queued_prompt` with `connectionId`, `sessionId`, `queueItemId`,
  and `reason`.
- Conversation detail helper tests should not require full Vue rendering.

Manual verification:

- Simulate `turn_queued` events and confirm the shared queue bar appears.
- Expand the panel and confirm queued rows show preview, source, and time.
- Trigger cancel and confirm row action changes to `取消中`, then disappears only
  after `turn_queue_cancelled`.

## Native iOS/Android Replication

- Render Desktop shared queue separately from local draft sends.
- Use `queueItemId` as the stable row key.
- Allow any paired device to cancel any queued item.
- Do not remove rows optimistically after cancel; wait for queue lifecycle
  events.
- Hide cancel action if no `connectionId` or `queueItemId` is available.
- Keep official CLI behavior under `targetAgent = mcode-desktop`; do not create
  direct Codex or Claude target agents.
