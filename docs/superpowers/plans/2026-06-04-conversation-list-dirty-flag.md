# Conversation List Dirty Flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace unconditional list-page force refresh on `onShow` with a lightweight dirty-flag mechanism so only known-mutating flows bypass the existing 15-second overview throttle.

**Architecture:** Add a tiny shared module under `services/conversation` that only tracks whether the conversation list needs a forced refresh. Mutation and detail-exit paths mark the list dirty; the conversations page consumes that flag in `onShow` and decides whether to call `loadOverviewData({ force: true })` or reuse the existing throttled path.

**Tech Stack:** uni-app, Vue 3 Composition API, TypeScript, existing conversation services

---

### Task 1: Add the dirty-flag module

**Files:**
- Create: `mcode-app/src/services/conversation/conversationListRefresh.ts`

- [ ] **Step 1: Create the shared dirty-flag module**

```ts
let conversationListDirty = false

export function markConversationListDirty() {
  conversationListDirty = true
}

export function consumeConversationListDirty() {
  const dirty = conversationListDirty
  conversationListDirty = false
  return dirty
}

export function peekConversationListDirty() {
  return conversationListDirty
}
```

- [ ] **Step 2: Verify the file stays dependency-free**

Check that `conversationListRefresh.ts` imports nothing and exports only:
- `markConversationListDirty`
- `consumeConversationListDirty`
- `peekConversationListDirty`

Expected: no reactive store, no `uni.setStorageSync`, no Pinia dependency.

### Task 2: Use dirty consumption on the conversations page

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`

- [ ] **Step 1: Import the dirty-flag helpers**

Add this import near the existing conversation-service imports:

```ts
import { consumeConversationListDirty } from "@/services/conversation/conversationListRefresh"
```

- [ ] **Step 2: Gate `onShow` refresh by the dirty flag**

Replace the unconditional force-refresh:

```ts
onShow(() => {
  void loadOverviewData({ force: true })
  syncCateTabHeight()
})
```

with:

```ts
onShow(() => {
  const shouldForceRefresh = consumeConversationListDirty()
  void loadOverviewData(shouldForceRefresh ? { force: true } : undefined)
  syncCateTabHeight()
})
```

- [ ] **Step 3: Keep explicit refresh paths unchanged**

Do not change these already-correct paths:

```ts
loadOverviewData({ force: true })
```

They should remain in:
- pull-to-refresh handler
- `loadData()`
- post-create success path

Expected: explicit user or mutation refreshes still bypass throttling immediately.

### Task 3: Mark the list dirty when leaving conversation detail

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`

- [ ] **Step 1: Import the dirty-flag marker**

Add:

```ts
import { markConversationListDirty } from "@/services/conversation/conversationListRefresh"
```

- [ ] **Step 2: Mark dirty in `onHide`**

Update the lifecycle block to:

```ts
onHide(() => {
  persistDetailRuntimeState()
  if (conversationId.value) {
    markConversationListDirty()
  }
})
```

- [ ] **Step 3: Mark dirty in `onUnload`**

Update the lifecycle block to:

```ts
onUnload(() => {
  persistDetailRuntimeState()
  if (conversationId.value) {
    markConversationListDirty()
    runtime.clearSession(conversationId.value)
  }
})
```

Expected: returning from detail marks the list stale without introducing a second data path.

### Task 4: Mark the list dirty for list mutations

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`

- [ ] **Step 1: Import the marker alongside the consumer**

Use one combined import:

```ts
import {
  consumeConversationListDirty,
  markConversationListDirty,
} from "@/services/conversation/conversationListRefresh"
```

- [ ] **Step 2: Mark dirty after create succeeds**

Insert before the forced reload:

```ts
markConversationListDirty()
await loadOverviewData({ force: true })
```

inside the `confirmCreate()` success path.

- [ ] **Step 3: Mark dirty after rename succeeds**

Insert before `await loadData()`:

```ts
markConversationListDirty()
await loadData()
```

inside the rename success branch.

- [ ] **Step 4: Mark dirty after delete succeeds**

Insert before `await loadData()`:

```ts
markConversationListDirty()
await loadData()
```

inside the delete success branch.

Expected: local list mutations keep current behavior and also ensure the next page re-entry remains fresh.

### Task 5: Verify behavior and guard against regressions

**Files:**
- Modify: none

- [ ] **Step 1: Review the final diff**

Run:

```bash
git diff -- mcode-app/src/services/conversation/conversationListRefresh.ts mcode-app/src/pages/conversations/index.vue mcode-app/src/pages/conversation-detail/index.vue
```

Expected: only dirty-flag wiring changes; no unrelated behavior edits.

- [ ] **Step 2: Run targeted TypeScript validation**

Run:

```bash
pnpm --dir mcode-app exec tsc --noEmit
```

Expected: the command may still show pre-existing project issues, but it must not introduce new errors attributable to:
- `conversationListRefresh.ts`
- `pages/conversations/index.vue`
- `pages/conversation-detail/index.vue`

- [ ] **Step 3: Manually verify the dirty-flag behavior**

Check these flows:
1. Open conversations page, then switch to a non-detail page and back within 15 seconds.
2. Open conversation detail, then return within 15 seconds.
3. Create a conversation and confirm it appears immediately.
4. Rename a conversation and confirm title refresh.
5. Delete a conversation and confirm it disappears.

Expected:
- non-dirty `onShow` paths respect throttling
- detail-return and mutation paths still force fresh data
