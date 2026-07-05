# P64 Detail Scroll Follow Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent realtime assistant message updates from forcing the conversation detail page to the bottom after the user manually scrolls upward.

**Architecture:** Keep the existing `shouldAutoFollowBottom` and lower-right FAB model. Fix the near-bottom calculation so it uses a reliable viewport height, then let existing realtime watchers show `hasUnreadBelow` without calling bottom scroll when the user is away from the tail.

**Tech Stack:** Vue 3 Composition API, uni-app `scroll-view`, Vitest unit tests, existing `detailScrollState` presentation helpers.

## Global Constraints

- Normal user-facing replies and docs are Chinese by default; code identifiers and API names remain in English.
- Use existing `--up-*` runtime theme variables only; this fix does not add new theme aliases.
- Every mcode change must include or update a Markdown note under `docs/mcode-architecture-notes/`.
- Do not change ACP, realtime, SQLite, route, or opened-tab protocols.

---

## File Structure

- `mcode-app/src/pages/conversation-detail/detailScrollState.ts`: owns pure scroll state decisions. Add a helper that resolves whether a `scroll-view` position is near bottom.
- `mcode-app/tests/pages/conversation-detail/detailScrollState.spec.ts`: covers the missing `event.detail.height` case and threshold behavior.
- `mcode-app/src/pages/conversation-detail/index.vue`: parent shell path. Use measured message-list viewport height when `scroll-view` does not report a height.
- `mcode-app/src/pages/conversation-detail/ConversationDetailInteractivePane.vue`: multi-tab pane path. Apply the same helper and fallback as the shell.
- `docs/mcode-architecture-notes/2026-07-05-p64-detail-scroll-follow-guard.md`: records behavior, compatibility, and native replication guidance.

### Task 1: Pure Near-Bottom Decision

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/detailScrollState.ts`
- Modify: `mcode-app/tests/pages/conversation-detail/detailScrollState.spec.ts`

**Interfaces:**
- Produces: `resolveNearBottomState(input: { scrollTop: number; scrollHeight: number; viewportHeight?: number | null; fallbackViewportHeight?: number | null; threshold?: number | null }): { canMeasure: boolean; nearBottom: boolean; distanceToBottom: number }`
- Consumes: Existing unit test setup in `detailScrollState.spec.ts`.

- [ ] **Step 1: Write failing tests**

Add assertions inside `describe("detailScrollState", ...)`:

```ts
expect(resolveNearBottomState({
  scrollTop: 200,
  scrollHeight: 1200,
  viewportHeight: 500,
  threshold: 72,
})).toEqual({
  canMeasure: true,
  nearBottom: false,
  distanceToBottom: 500,
})

expect(resolveNearBottomState({
  scrollTop: 640,
  scrollHeight: 1200,
  viewportHeight: 500,
  threshold: 72,
})).toEqual({
  canMeasure: true,
  nearBottom: true,
  distanceToBottom: 60,
})

expect(resolveNearBottomState({
  scrollTop: 200,
  scrollHeight: 1200,
  viewportHeight: 0,
  fallbackViewportHeight: 500,
  threshold: 72,
})).toEqual({
  canMeasure: true,
  nearBottom: false,
  distanceToBottom: 500,
})

expect(resolveNearBottomState({
  scrollTop: 200,
  scrollHeight: 1200,
  viewportHeight: 0,
  fallbackViewportHeight: 0,
})).toEqual({
  canMeasure: false,
  nearBottom: false,
  distanceToBottom: 0,
})
```

- [ ] **Step 2: Run the focused test to verify failure**

Run: `pnpm test:unit -- --runTestsByPath tests/pages/conversation-detail/detailScrollState.spec.ts`

Expected: FAIL because `resolveNearBottomState` is not exported.

- [ ] **Step 3: Implement the pure helper**

Add to `detailScrollState.ts`:

```ts
export function resolveNearBottomState(input: {
  scrollTop: number
  scrollHeight: number
  viewportHeight?: number | null
  fallbackViewportHeight?: number | null
  threshold?: number | null
}) {
  const scrollTop = Math.max(0, Number(input.scrollTop || 0))
  const scrollHeight = Math.max(0, Number(input.scrollHeight || 0))
  const viewportHeight = Math.max(
    0,
    Number(input.viewportHeight || 0) || Number(input.fallbackViewportHeight || 0)
  )
  const threshold = Math.max(0, Number(input.threshold ?? 72))
  if (scrollHeight <= 0 || viewportHeight <= 0) {
    return { canMeasure: false, nearBottom: false, distanceToBottom: 0 }
  }
  const distanceToBottom = Math.max(0, scrollHeight - (scrollTop + viewportHeight))
  return {
    canMeasure: true,
    nearBottom: distanceToBottom <= threshold,
    distanceToBottom,
  }
}
```

- [ ] **Step 4: Run the focused test to verify pass**

Run: `pnpm test:unit -- --runTestsByPath tests/pages/conversation-detail/detailScrollState.spec.ts`

Expected: PASS.

### Task 2: Apply Reliable Viewport Height In Detail Pages

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
- Modify: `mcode-app/src/pages/conversation-detail/ConversationDetailInteractivePane.vue`

**Interfaces:**
- Consumes: `resolveNearBottomState(...)` from Task 1.
- Produces: Scroll handlers that set `shouldAutoFollowBottom` only when the viewport can be measured reliably.

- [ ] **Step 1: Import the helper in both Vue files**

Add `resolveNearBottomState` to the existing `./detailScrollState` import list in both files.

- [ ] **Step 2: Update the shell scroll handler**

In `index.vue`, replace the inline viewport fallback:

```ts
const currentViewportHeight = Math.max(
  0,
  Number(
    event?.detail?.height ||
    event?.detail?.scrollHeight - event?.detail?.deltaY - event?.detail?.scrollTop ||
    0
  )
)
```

with:

```ts
const currentViewportHeight = Math.max(0, Number(event?.detail?.height || 0))
```

Then replace the inline distance calculation with:

```ts
const nearBottomState = resolveNearBottomState({
  scrollTop: scrollTopValue,
  scrollHeight,
  viewportHeight: currentViewportHeight,
  fallbackViewportHeight: Math.max(0, detailViewportHeight.value - topChromeHeight.value),
})
if (nearBottomState.canMeasure) {
  shouldAutoFollowBottom.value = nearBottomState.nearBottom
  if (shouldAutoFollowBottom.value) {
    hasUnreadBelow.value = false
    const tail = renderMessageItems.value[renderMessageItems.value.length - 1]
    anchorMessageId.value = tail?.anchorId || ""
  }
}
```

- [ ] **Step 3: Update the pane scroll handler**

In `ConversationDetailInteractivePane.vue`, replace the inline viewport fallback with:

```ts
const currentViewportHeight = Math.max(0, Number(event?.detail?.height || 0))
```

Then use:

```ts
const nearBottomState = resolveNearBottomState({
  scrollTop: scrollTopValue,
  scrollHeight,
  viewportHeight: currentViewportHeight,
  fallbackViewportHeight: Math.max(
    0,
    Number.parseFloat(String((props.messageListPageStyle as { height?: string })?.height || "0"))
  ),
})
if (nearBottomState.canMeasure) {
  shouldAutoFollowBottom.value = nearBottomState.nearBottom
  if (shouldAutoFollowBottom.value) {
    hasUnreadBelow.value = false
    const tail = renderMessageItems.value[renderMessageItems.value.length - 1]
    anchorMessageId.value = tail?.anchorId || ""
  }
}
```

- [ ] **Step 4: Run focused tests**

Run: `pnpm test:unit -- --runTestsByPath tests/pages/conversation-detail/detailScrollState.spec.ts tests/pages/conversation-detail/detailLayoutPresentation.spec.ts`

Expected: PASS.

### Task 3: Document mcode Behavior

**Files:**
- Create: `docs/mcode-architecture-notes/2026-07-05-p64-detail-scroll-follow-guard.md`

**Interfaces:**
- Consumes: Final behavior from Tasks 1-2.
- Produces: Native iOS/Android replication guidance for scroll-follow behavior.

- [ ] **Step 1: Write the architecture note**

Create the note with sections:

```md
# P64 Detail Scroll Follow Guard

## Architecture

...

## Data Flow

...

## UI Behavior

...

## Compatibility

...

## Native iOS/Android Replication Guidance

...
```

- [ ] **Step 2: Run verification**

Run: `pnpm test:unit -- --runTestsByPath tests/pages/conversation-detail/detailScrollState.spec.ts tests/pages/conversation-detail/detailLayoutPresentation.spec.ts`

Expected: PASS.

Run: `git diff --stat`

Expected: changes are limited to the two scroll files, one test file, this plan, and one architecture note.
