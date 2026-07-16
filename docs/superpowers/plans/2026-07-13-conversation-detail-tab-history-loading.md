# Conversation Detail Tab History Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a per-tab “初始历史加载中...” status at the top of the conversation detail message list while a tab is syncing its initial history cursor, without hiding the latest loaded turn.

**Architecture:** Keep the state inside `ConversationDetailInteractivePane.vue`, because that component is the real per-tab message-list runtime. Add a small initial-history loading state that is guarded by the existing `historySyncToken`, then route all top history copy through the existing `historyStatusText` computed.

**Tech Stack:** Vue 3 Composition API, uni-app template syntax, Pinia runtime store, Jest source contract tests.

## Global Constraints

- Do not change the parent page's disabled legacy `ConversationDetailBody` branch.
- Do not change message protocol, backend APIs, database shape, or local storage schema.
- Keep latest/loaded messages visible while history state is loading.
- Keep each tab's initial history loading state inside its own `ConversationDetailInteractivePane` instance.
- Manual older-history loading feedback has higher priority than initial-history loading feedback.

---

## File Structure

- Modify: `mcode-app/src/pages/conversation-detail/ConversationDetailInteractivePane.vue`
- Responsibility: Own per-tab history status state, history status copy priority, loading icon visibility, and async token guards.
- Modify: `mcode-app/tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts`
- Responsibility: Source-level regression coverage proving history pagination and initial history loading stay inside the interactive pane.

---

### Task 1: Add Contract Coverage For Per-Tab Initial History Loading

**Files:**
- Modify: `mcode-app/tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts`

**Interfaces:**
- Consumes: Existing source contract test style using `fs.readFileSync(...)`.
- Produces: A failing test that requires `ConversationDetailInteractivePane.vue` to define per-pane initial history loading state, display “初始历史加载中...”, keep manual “历史加载中...” first, and use a shared busy computed for the loading icon.

- [ ] **Step 1: Add the failing test**

Append this test near the existing `"keeps history pagination inside the interactive pane"` case:

```ts
  it("keeps initial history loading feedback per interactive pane", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue"),
      "utf8"
    )

    expect(source).toContain("const initialHistoryLoading = ref(false)")
    expect(source).toContain("const historyStatusBusy = computed(() =>")
    expect(source).toContain('v-if="historyStatusBusy"')
    expect(source).toMatch(/if \(loadingOlder\.value\) return "历史加载中\.\.\."/)
    expect(source).toMatch(/if \(messages\.value\.length > 0 && initialHistoryLoading\.value\) return "初始历史加载中\.\.\."/)
    expect(source).toContain("function beginInitialHistoryLoading(conversationId: number, token: number)")
    expect(source).toContain("function finishInitialHistoryLoading(conversationId: number, token: number)")
    expect(source).toMatch(/const token = \+\+historySyncToken[\s\S]*beginInitialHistoryLoading\(targetConversationId, token\)[\s\S]*finally \{[\s\S]*finishInitialHistoryLoading\(targetConversationId, token\)/)
  })
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
cd mcode-app
npm run test:unit -- tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts
```

Expected: FAIL. The failure should mention at least one missing string such as `const initialHistoryLoading = ref(false)` or `初始历史加载中...`.

- [ ] **Step 3: Commit the failing test**

```bash
git add mcode-app/tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts
git commit -m "test: cover per-tab initial history loading"
```

---

### Task 2: Implement Per-Tab Initial History Loading State

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/ConversationDetailInteractivePane.vue`

**Interfaces:**
- Consumes: Existing `loadingOlder`, `historySyncToken`, `ensureHistoryCursorFromLoadedMessages()`, `messages`, and `historyStatusText`.
- Produces: `initialHistoryLoading`, `historyStatusBusy`, `beginInitialHistoryLoading(...)`, `finishInitialHistoryLoading(...)`, and `resetInitialHistoryLoading(...)`.

- [ ] **Step 1: Update the top loading icon condition**

Replace this template condition:

```vue
          v-if="loadingOlder"
```

with:

```vue
          v-if="historyStatusBusy"
```

- [ ] **Step 2: Add per-pane loading state**

Immediately after the existing `loadingOlder` ref:

```ts
const loadingOlder = ref(false)
const initialHistoryLoading = ref(false)
const hasMoreHistory = ref(false)
```

Immediately after the existing `historySyncToken` variable:

```ts
let historySyncToken = 0
let initialHistoryLoadingConversationId = 0
let initialHistoryLoadingToken = 0
let initialHistoryResolvedConversationId = 0
let preservingHistoryAnchor = false
```

- [ ] **Step 3: Add the shared busy computed and status priority**

Place this computed immediately before `historyStatusText`:

```ts
const historyStatusBusy = computed(() => loadingOlder.value || initialHistoryLoading.value)
```

Update `historyStatusText` to this exact priority:

```ts
const historyStatusText = computed(() => {
  if (loadingOlder.value) return "历史加载中..."
  if (messages.value.length > 0 && initialHistoryLoading.value) return "初始历史加载中..."
  if (messages.value.length > 0 && hasMoreHistory.value) return "上滑加载更早消息"
  if (messages.value.length > 0 && !hasMoreHistory.value) return "没有更多历史了"
  return ""
})
```

- [ ] **Step 4: Reset loading state when the pane's conversation changes**

Add this watcher near the other `watch(...)` blocks, before the watcher that calls `ensureHistoryCursorFromLoadedMessages()`:

```ts
watch(
  () => Number(props.conversationId || 0),
  (conversationId) => {
    resetInitialHistoryLoading(conversationId)
  },
  { immediate: true }
)
```

- [ ] **Step 5: Add token-guarded helper functions**

Place these helpers immediately before `ensureHistoryCursorFromLoadedMessages(...)`:

```ts
function beginInitialHistoryLoading(conversationId: number, token: number) {
  if (!conversationId || initialHistoryResolvedConversationId === conversationId) return
  initialHistoryLoadingConversationId = conversationId
  initialHistoryLoadingToken = token
  initialHistoryLoading.value = true
}

function finishInitialHistoryLoading(conversationId: number, token: number) {
  if (
    Number(props.conversationId || 0) !== conversationId ||
    initialHistoryLoadingConversationId !== conversationId ||
    initialHistoryLoadingToken !== token
  ) {
    return
  }

  initialHistoryResolvedConversationId = conversationId
  initialHistoryLoading.value = false
}

function resetInitialHistoryLoading(conversationId: number) {
  initialHistoryLoadingConversationId = conversationId
  initialHistoryLoadingToken = 0
  initialHistoryResolvedConversationId = 0
  initialHistoryLoading.value = false
}
```

- [ ] **Step 6: Wrap initial history cursor sync with the loading helpers**

In `ensureHistoryCursorFromLoadedMessages(...)`, keep the early empty-state return, but reset initial loading before returning:

```ts
  if (!targetConversationId || loadedTurnCount <= 0) {
    oldestLoadedCursor.value = null
    hasMoreHistory.value = false
    syncedHistoryConversationId = targetConversationId
    syncedHistoryLocalTurnCount = loadedTurnCount
    resetInitialHistoryLoading(targetConversationId)
    return
  }
```

After `const token = ++historySyncToken`, add:

```ts
  beginInitialHistoryLoading(targetConversationId, token)
```

Update the catch guard to include the current conversation check:

```ts
    if (token === historySyncToken && Number(props.conversationId || 0) === targetConversationId) {
      oldestLoadedCursor.value = null
      hasMoreHistory.value = false
    }
```

Add a `finally` block after the catch:

```ts
  } finally {
    finishInitialHistoryLoading(targetConversationId, token)
  }
```

The resulting function shape should be:

```ts
async function ensureHistoryCursorFromLoadedMessages(force = false) {
  const targetConversationId = Number(props.conversationId || 0)
  const loadedTurnCount = session.value.localTurns.length
  if (!targetConversationId || loadedTurnCount <= 0) {
    oldestLoadedCursor.value = null
    hasMoreHistory.value = false
    syncedHistoryConversationId = targetConversationId
    syncedHistoryLocalTurnCount = loadedTurnCount
    resetInitialHistoryLoading(targetConversationId)
    return
  }

  if (
    !force &&
    syncedHistoryConversationId === targetConversationId &&
    syncedHistoryLocalTurnCount === loadedTurnCount
  ) {
    return
  }

  const token = ++historySyncToken
  beginInitialHistoryLoading(targetConversationId, token)
  try {
    const [totalTurnCount, newestTurns] = await Promise.all([
      countConversationTurns(targetConversationId),
      getNewestTurns(targetConversationId, loadedTurnCount),
    ])
    if (token !== historySyncToken || Number(props.conversationId || 0) !== targetConversationId) return

    oldestLoadedCursor.value = getOldestCursorFromPersistedTurns(newestTurns)
    hasMoreHistory.value = totalTurnCount > newestTurns.length
    syncedHistoryConversationId = targetConversationId
    syncedHistoryLocalTurnCount = loadedTurnCount
  } catch (error) {
    console.warn("sync history cursor skipped", error)
    if (token === historySyncToken && Number(props.conversationId || 0) === targetConversationId) {
      oldestLoadedCursor.value = null
      hasMoreHistory.value = false
    }
  } finally {
    finishInitialHistoryLoading(targetConversationId, token)
  }
}
```

- [ ] **Step 7: Run the focused contract test**

Run:

```bash
cd mcode-app
npm run test:unit -- tests/pages/conversation-detail/conversationDetailBodyContract.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Run all unit tests**

Run:

```bash
cd mcode-app
npm run test:unit
```

Expected: PASS.

- [ ] **Step 9: Commit the implementation**

```bash
git add mcode-app/src/pages/conversation-detail/ConversationDetailInteractivePane.vue
git commit -m "fix: show per-tab initial history loading"
```

---

## Self-Review

- Spec coverage: The plan keeps state in `ConversationDetailInteractivePane.vue`, preserves visible loaded messages, gives manual `loadingOlder` copy priority, and token-guards async completion.
- Placeholder scan: No `TBD`, `TODO`, “similar to”, or unspecified test instructions remain.
- Type consistency: The test and implementation both use `initialHistoryLoading`, `historyStatusBusy`, `beginInitialHistoryLoading`, and `finishInitialHistoryLoading`.

