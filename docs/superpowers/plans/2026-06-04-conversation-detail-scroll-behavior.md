# Conversation Detail Scroll Behavior Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix conversation detail scrolling so first entry lands at the bottom, returning to the same conversation restores reading position, realtime updates only auto-follow near the bottom, and composer height changes keep the message list viewport in sync.

**Architecture:** Keep `scroll-view` as the only scrolling surface and separate programmatic scroll targets from persisted reading state. Store stable message anchors plus pixel scroll position in `conversationCache`, then route initial load, realtime updates, history prepend, and composer layout changes through one viewport-sync path inside the detail page.

**Tech Stack:** uni-app, Vue 3 Composition API, Pinia, TypeScript strict mode, uview-plus `up-textarea`

---

## File Structure

- **Modify:** `mcode-app/src/pages/conversation-detail/index.vue`
  - Replace index-based message anchors with stable message-id anchors.
  - Add persisted reading-state refs (`nearBottom`, `anchorMessageId`, restore flags).
  - Unify initial restore, realtime auto-follow, history prepend anchoring, and composer viewport syncing.
  - Bind `linechange` and `keyboardheightchange` from `up-textarea`.
- **Modify:** `mcode-app/src/stores/conversationCache.ts`
  - Extend cached conversation view state with `scrollTop`, `nearBottom`, and `anchorMessageId`.
- **Do Not Modify:** `mcode-app/src/services/db/repositories/runtimeRepository.ts`
  - This change intentionally stays in page-level cache; no SQLite migration is part of scope.

**Validation note:** `mcode-app` currently has no in-repo frontend unit test harness or existing app test files. Per repository constraints, do not introduce a brand-new test framework for this change. Validation for this plan uses `pnpm exec vue-tsc --noEmit`, `pnpm build:h5`, and manual interaction checks.

---

### Task 1: Extend cached reading state

**Files:**
- Modify: `mcode-app/src/stores/conversationCache.ts`
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`

- [ ] **Step 1: Add stable reading-state fields to the cache store**

Update the store interface so the detail page can persist actual reading state instead of overloading `scrollIntoView`.

```ts
export interface CachedConversationViewState {
  conversationId: number
  loadedTurnCount: number
  oldestLoadedSeq?: number
  hasMoreHistory: boolean
  scrollAnchor?: string
  scrollTop?: number
  nearBottom?: boolean
  anchorMessageId?: string
  composerText?: string
  draftQueue?: any[]
  attachments?: any[]
  queueExpanded?: boolean
}
```

- [ ] **Step 2: Add the new refs in the detail page state block**

Insert the new state next to the existing scroll refs so later steps can use one source of truth for reading position.

```ts
const scrollIntoView = ref("")
const scrollTop = ref(0)
const messageListHeight = ref(0)
const messageListViewportHeight = ref(0)
const hasInitialBottomScroll = ref(false)
const isRestoringScroll = ref(false)
const restoredInitialScroll = ref(false)
const lastMeasuredScrollTop = ref(0)
const anchorMessageId = ref("")
const shouldAutoFollowBottom = ref(true)
```

- [ ] **Step 3: Persist the new fields on hide and unload**

Replace the current `scrollAnchor`-only persistence payload so it writes the actual reading position.

```ts
cacheStore.persistViewState({
  conversationId: conversationId.value,
  loadedTurnCount: messages.value.length,
  oldestLoadedSeq: oldestLoadedCursor.value ?? undefined,
  hasMoreHistory: hasMoreHistory.value,
  scrollAnchor: scrollIntoView.value || undefined,
  scrollTop: lastMeasuredScrollTop.value || scrollTop.value || 0,
  nearBottom: shouldAutoFollowBottom.value,
  anchorMessageId: anchorMessageId.value || undefined,
  composerText: inputText.value,
  draftQueue: draftQueue.value.map((item) => ({ ...item })),
  attachments: attachments.value.map((item) => ({ ...item })),
  queueExpanded: queueExpanded.value,
})
```

- [ ] **Step 4: Run TypeScript validation for the new cache shape**

Run: `pnpm exec vue-tsc --noEmit`

Expected: command exits `0` with no TypeScript errors about `CachedConversationViewState`.

---

### Task 2: Switch to stable message anchors and restore rules

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`

- [ ] **Step 1: Replace index-based DOM ids with stable message ids**

Change the message list template so every message has a stable anchor even after history prepend.

```vue
<view
  v-for="(msg, index) in messages"
  :key="msg.id"
  :id="messageAnchorId(msg.id)"
  class="message-item"
>
  <MessageBubble
    :message="msg"
    :agent-type="currentAgentType"
    :showRegenerate="index === messages.length - 1 && msg.role === 'assistant'"
    @regenerate="regenerateLastMessage"
  />
</view>
```

- [ ] **Step 2: Add anchor helpers and a reusable bottom-target helper**

Add small helpers near the scroll utilities so every code path computes anchors the same way.

```ts
function messageAnchorId(messageId: string) {
  return `msg-${String(messageId).replace(/[^a-zA-Z0-9_-]/g, "_")}`
}

function getBottomAnchorId() {
  const tail = messages.value[messages.value.length - 1]
  return tail ? messageAnchorId(tail.id) : ""
}

function setProgrammaticAnchor(messageId: string) {
  anchorMessageId.value = messageId
  scrollIntoView.value = ""
  nextTick(() => {
    scrollIntoView.value = messageAnchorId(messageId)
  })
}
```

- [ ] **Step 3: Add restore helpers for cached scroll position**

Implement one restore path that decides whether to go to bottom, restore by `scrollTop`, or restore by stable anchor.

```ts
function hasCachedBottomState(cachedViewState: ReturnType<typeof cacheStore.restore>) {
  return Boolean(cachedViewState && cachedViewState.nearBottom)
}

function restoreScrollState(cachedViewState: ReturnType<typeof cacheStore.restore>) {
  if (!cachedViewState) {
    scrollToBottom(true)
    restoredInitialScroll.value = true
    return
  }

  if (cachedViewState.nearBottom) {
    scrollToBottom(true)
    restoredInitialScroll.value = true
    return
  }

  isRestoringScroll.value = true
  if (typeof cachedViewState.scrollTop === "number" && cachedViewState.scrollTop > 0) {
    scrollTop.value = cachedViewState.scrollTop
    lastMeasuredScrollTop.value = cachedViewState.scrollTop
  } else if (cachedViewState.anchorMessageId) {
    scrollIntoView.value = messageAnchorId(cachedViewState.anchorMessageId)
  }

  nextTick(() => {
    restoredInitialScroll.value = true
    isRestoringScroll.value = false
  })
}
```

- [ ] **Step 4: Change initial load completion to respect restore state**

Replace the unconditional `scrollToBottom(true)` in `finishInitialLoad()` with the new restore helper.

```ts
const finishInitialLoad = (
  cachedViewState: ReturnType<typeof cacheStore.restore>
) => {
  if (initialLoadFinished) return
  initialLoadFinished = true
  loading.value = false
  nextTick(() => {
    measureMessageListHeight()
    restoreScrollState(cachedViewState)
    hasInitialBottomScroll.value = true
  })
}
```

Update the existing call sites from:

```ts
finishInitialLoad()
```

to:

```ts
finishInitialLoad(cachedViewState)
```

- [ ] **Step 5: Preserve the first visible message during history prepend**

Swap the old index-based anchoring in `loadOlderTurns()` for a stable message-id anchor.

```ts
const firstVisibleMessageId = runtimeSession.localTurns[0]?.id || anchorMessageId.value || ""

runtimeSession.localTurns = [
  ...older.slice().reverse().map(mapPersistedTurnToMessage),
  ...runtimeSession.localTurns,
]

if (firstVisibleMessageId) {
  nextTick(() => {
    scrollIntoView.value = messageAnchorId(firstVisibleMessageId)
  })
}
```

- [ ] **Step 6: Run typecheck after the restore-flow refactor**

Run: `pnpm exec vue-tsc --noEmit`

Expected: command exits `0` with no template or script errors in `pages/conversation-detail/index.vue`.

---

### Task 3: Unify viewport measurement and realtime auto-follow

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`

- [ ] **Step 1: Fix message viewport measurement to use real geometry**

Replace the current approximate height math with the measured distance between the header bottom and input top.

```ts
function measureMessageListHeight() {
  const query = uni.createSelectorQuery()
  query
    .select(".toolbar")
    .boundingClientRect()
    .select(".history-status")
    .boundingClientRect()
    .select(".input-wrap")
    .boundingClientRect()
    .exec((rects: any[]) => {
      const toolbarRect = rects?.[0]
      const historyStatusRect = rects?.[1]
      const inputRect = rects?.[2]
      const toolbarBottom = Number(toolbarRect?.bottom || toolbarRect?.height || 0)
      const historyStatusBottom = Number(historyStatusRect?.bottom || 0)
      const inputTop = Number(inputRect?.top || 0)
      const headerBottom = historyStatusBottom || toolbarBottom
      const height = Math.max(0, inputTop - headerBottom)
      if (height > 0) {
        messageListViewportHeight.value = height
        messageListHeight.value = height
      }
    })
}
```

- [ ] **Step 2: Add one viewport-sync scheduler for all layout and data changes**

Add a single entry point so scroll behavior is consistent across realtime updates, composer expansion, and status-bar changes.

```ts
function scheduleViewportSync(forceBottom = false) {
  nextTick(() => {
    measureMessageListHeight()
    if (isRestoringScroll.value) return
    if (forceBottom || shouldAutoFollowBottom.value) {
      scrollToBottom(true)
      return
    }
    scrollTop.value = lastMeasuredScrollTop.value
  })
}
```

- [ ] **Step 3: Update the scroll handler to maintain reading-state refs**

Capture both the latest scroll position and the currently visible anchor while preserving the existing near-bottom threshold behavior.

```ts
function handleMessageScroll(event: any) {
  const scrollTopValue = Number(event?.detail?.scrollTop || 0)
  const scrollHeight = Number(event?.detail?.scrollHeight || 0)
  const viewportHeight = Number(messageListHeight.value || 0)

  lastMeasuredScrollTop.value = scrollTopValue
  scrollTop.value = scrollTopValue

  if (!scrollHeight || !viewportHeight) return

  const distanceToBottom = Math.max(0, scrollHeight - (scrollTopValue + viewportHeight))
  shouldAutoFollowBottom.value = distanceToBottom <= 72

  const visibleIndex = Math.max(
    0,
    messages.value.findIndex((item, index) => index === 0 || index === messages.value.length - 1)
  )
  const visibleMessage = messages.value[visibleIndex]
  anchorMessageId.value = visibleMessage?.id || anchorMessageId.value

  if (scrollTopValue <= 120) {
    void loadOlderTurns()
  }
}
```

Then tighten the anchor assignment so it uses the actual first rendered message when no more precise viewport-specific signal is available:

```ts
const visibleMessage = messages.value[0]
anchorMessageId.value = visibleMessage?.id || anchorMessageId.value
```

- [ ] **Step 4: Replace the length-only watcher with content-aware sync triggers**

Keep the runtime queue behavior, but move auto-follow to watchers that fire for stream deltas and composer layout changes.

```ts
watch(
  () => messages.value.map((msg) => ({
    id: msg.id,
    status: msg.status,
    content: JSON.stringify(msg.content || []),
  })),
  (_next, _prev) => {
    if (loading.value || !hasInitialBottomScroll.value || isRestoringScroll.value) return
    scheduleViewportSync()
  },
  { deep: true }
)

watch(
  () => historyStatusText.value,
  () => {
    scheduleViewportSync()
  }
)
```

- [ ] **Step 5: Keep user-send paths pinned to the latest message**

When the user sends a draft, keep the conversation focused on the live tail regardless of prior scroll state.

```ts
async function sendDraft(draft: QueuedDraft): Promise<boolean> {
  sending.value = true
  shouldAutoFollowBottom.value = true
  anchorMessageId.value = ""

  try {
    runtime.addOptimisticUserMessage(
      conversationId.value,
      buildOptimisticText(draft.text, fileAtts),
      imageAtts
    )
    scheduleViewportSync(true)
    await acpApi.acpPrompt(conn, blocks, folderId.value, conversationId.value)
    return true
  } finally {
    sending.value = false
  }
}
```

- [ ] **Step 6: Run typecheck after scroll-behavior refactor**

Run: `pnpm exec vue-tsc --noEmit`

Expected: command exits `0` with no errors after the watcher and measurement changes.

---

### Task 4: Bind composer height events and non-text layout triggers

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`

- [ ] **Step 1: Bind `up-textarea` line and keyboard events**

Extend the template so composer growth and keyboard movement feed the same viewport-sync path.

```vue
<up-textarea
  class="composer-textarea"
  v-model="inputText"
  placeholder="发送消息，输入 / 调出命令"
  autoHeight
  fixed
  :maxlength="10000"
  border="none"
  height="34rpx"
  :customStyle="{
    backgroundColor: 'transparent',
    background: 'transparent',
    padding: '0',
    borderColor: 'transparent',
  }"
  @linechange="scheduleViewportSync()"
  @keyboardheightchange="scheduleViewportSync()"
></up-textarea>
```

- [ ] **Step 2: Watch attachment, queue, and slash-panel layout sources**

Add watchers so all layout-affecting blocks share the same measurement path.

```ts
watch(
  () => [
    attachments.value.length,
    uploadQueue.value.length,
    draftQueue.value.length,
    queueExpanded.value,
    slashState.value.visible,
    filteredSlashCommands.value.length,
  ],
  () => {
    if (!hasInitialBottomScroll.value) return
    scheduleViewportSync()
  }
)
```

- [ ] **Step 3: Keep `scrollToBottom()` aligned with stable anchors**

Update the bottom-scroll helper to target the last message by stable id and to leave cached scroll position clean.

```ts
function scrollToBottom(force = false) {
  if (!messages.value.length) return
  if (!force && !shouldAutoFollowBottom.value) return

  shouldAutoFollowBottom.value = true
  anchorMessageId.value = ""
  const targetId = getBottomAnchorId()
  scrollIntoView.value = ""
  scrollTop.value += 100000

  nextTick(() => {
    scrollIntoView.value = targetId
  })
}
```

- [ ] **Step 4: Run typecheck and production build**

Run: `pnpm exec vue-tsc --noEmit && pnpm build:h5`

Expected:
- `vue-tsc` exits `0`
- `build:h5` completes without template or runtime compile errors

---

### Task 5: Manual verification sweep

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
- Modify: `mcode-app/src/stores/conversationCache.ts`

- [ ] **Step 1: Start the app locally for interaction checks**

Run: `pnpm dev:h5`

Expected: local uni-app dev server starts successfully.

- [ ] **Step 2: Verify first-entry bottom scroll**

Manual check:

```text
1. Open a conversation with existing history.
2. Confirm the last message is visible immediately.
3. Confirm no second jump pulls the page away from the bottom after load settles.
```

- [ ] **Step 3: Verify return-to-conversation restore**

Manual check:

```text
1. Scroll upward to an older position in the same conversation.
2. Navigate back to the conversation list.
3. Re-open the same conversation.
4. Confirm the page restores the previous reading position instead of forcing the bottom.
```

- [ ] **Step 4: Verify realtime follow and non-follow behavior**

Manual check:

```text
1. Stay near the bottom and trigger a streaming assistant response.
2. Confirm the list follows the stream as text grows.
3. Scroll upward away from the bottom.
4. Trigger another streaming response.
5. Confirm the list does not jump to the newest message.
```

- [ ] **Step 5: Verify composer-height synchronization**

Manual check:

```text
1. Enter multiple lines until the textarea grows.
2. Open attachments, slash suggestions, and the draft queue.
3. Confirm the message viewport shrinks with no bottom-message overlap.
4. Dismiss the extra UI and confirm the viewport expands back cleanly.
```

- [ ] **Step 6: Record any follow-up issues without broadening scope**

If manual checks reveal unrelated defects, capture them separately instead of extending this patch. Only keep fixes that directly affect conversation-detail scroll behavior.

---

## Self-Review

- **Spec coverage:** This plan covers stable anchors, cached restore state, initial load behavior, realtime auto-follow, composer height sync, history prepend stability, and validation steps from the approved design.
- **Placeholder scan:** No `TODO`, `TBD`, or “implement later” placeholders remain. Validation uses concrete commands that exist in `mcode-app/package.json` or local toolchain.
- **Type consistency:** The plan uses one naming set throughout: `scrollTop`, `nearBottom` via `shouldAutoFollowBottom`, `anchorMessageId`, `isRestoringScroll`, and `scheduleViewportSync`.

**Execution note:** Do not add a new test framework and do not commit changes unless the user explicitly asks for it.
