# MCode P25 Shared Prompt Queue UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show and cancel Desktop-hosted shared prompt queue items from the MCode conversation detail page.

**Architecture:** P24 already stores Desktop shared queue state on `session.sharedPromptQueue`. P25 adds an app API wrapper for `acp_cancel_queued_prompt`, testable presentation helpers, and a conversation-detail UI panel that renders shared queue items separately from local draft queue items. Desktop remains the queue owner and realtime queue events remain authoritative.

**Tech Stack:** TypeScript, Vue/uni-app, Pinia runtime store, Jest unit tests, existing ACP gateway protocol.

## Global Constraints

- Use `targetAgent`, never `targetType`.
- Do not change Desktop queue scheduling, queue ownership, or auto-start behavior.
- Do not persist queued prompts in P25.
- Do not add mobile-side `codex` or `claude` target agents.
- Do not merge Desktop shared queue state into the local `draftQueue`.
- Every mcode change must update `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`.
- Keep app theme styling on uview-plus `--up-*` runtime variables; do not add `--mcode-*` aliases.

---

## File Structure

- Modify `mcode-app/src/api/acp.ts`: add `acpCancelQueuedPrompt(...)` and a test-only request hook.
- Create `mcode-app/tests/api/acpQueuedPromptCancel.spec.ts`: verify command payload.
- Modify `mcode-app/src/pages/conversation-detail/detailRuntimePresentation.ts`: add shared queue presentation helper types/functions.
- Modify `mcode-app/tests/pages/conversation-detail/detailRuntimePresentation.spec.ts`: test shared queue helper copy and cancel-disabled state.
- Modify `mcode-app/src/pages/conversation-detail/index.vue`: add shared queue state, UI, and cancel handler.
- Modify `mcode-app/src/pages/conversation-detail/index.scss`: add shared queue styles using `--up-*` variables.
- Modify `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`: update P25 status from planned to implemented.
- Modify this plan file as tasks complete.

## Task 1: ACP Queued Prompt Cancel API

**Files:**
- Modify: `mcode-app/src/api/acp.ts`
- Create: `mcode-app/tests/api/acpQueuedPromptCancel.spec.ts`

**Interfaces:**
- Produces: `acpApi.acpCancelQueuedPrompt(connectionId: string, queueItemId: string, sessionId?: string | null): Promise<any>`
- Produces test hook: `acpApi.__setRequestHookForTest(hook: ((endpoint: string, data: any) => any) | null): void`

- [ ] Step 1: Add a private request hook field to `AcpApiClient`.

In `mcode-app/src/api/acp.ts`, inside `class AcpApiClient`, add:

```ts
private requestHookForTest: ((endpoint: string, data: any) => any) | null = null
```

- [ ] Step 2: Add `acpCancelQueuedPrompt` near `acpCancel`.

Add this method after `acpCancel(connectionId: string)`:

```ts
async acpCancelQueuedPrompt(
  connectionId: string,
  queueItemId: string,
  sessionId?: string | null
): Promise<any> {
  return await this.request("/acp_cancel_queued_prompt", {
    connectionId,
    sessionId: sessionId || connectionId,
    queueItemId,
    reason: "user_cancelled",
  })
}
```

- [ ] Step 3: Route private requests through the test hook.

At the top of `private async request(endpoint: string, data: any): Promise<any>`, before reading `useAuthStore()`, add:

```ts
if (this.requestHookForTest) {
  return await this.requestHookForTest(endpoint, data)
}
```

- [ ] Step 4: Add the public test hook method near other `__...ForTest` methods.

Add this method in `AcpApiClient` near `__setReplayMissCalibrationHookForTest(...)`:

```ts
__setRequestHookForTest(
  hook: ((endpoint: string, data: any) => any) | null
) {
  this.requestHookForTest = hook
}
```

- [ ] Step 5: Write the API unit test.

Create `mcode-app/tests/api/acpQueuedPromptCancel.spec.ts`:

```ts
import { acpApi } from "@/api/acp"

describe("acpApi queued prompt cancellation", () => {
  afterEach(() => {
    acpApi.__setRequestHookForTest(null)
  })

  it("sends acp_cancel_queued_prompt with explicit session id", async () => {
    const calls: Array<{ endpoint: string; data: any }> = []
    acpApi.__setRequestHookForTest((endpoint, data) => {
      calls.push({ endpoint, data })
      return { status: "cancelled" }
    })

    await expect(
      acpApi.acpCancelQueuedPrompt("conn-1", "queue-1", "session-1")
    ).resolves.toEqual({ status: "cancelled" })

    expect(calls).toEqual([{
      endpoint: "/acp_cancel_queued_prompt",
      data: {
        connectionId: "conn-1",
        sessionId: "session-1",
        queueItemId: "queue-1",
        reason: "user_cancelled",
      },
    }])
  })

  it("defaults session id to connection id", async () => {
    const calls: Array<{ endpoint: string; data: any }> = []
    acpApi.__setRequestHookForTest((endpoint, data) => {
      calls.push({ endpoint, data })
      return { status: "cancelled" }
    })

    await acpApi.acpCancelQueuedPrompt("conn-1", "queue-1")

    expect(calls[0].data.sessionId).toBe("conn-1")
  })
})
```

- [ ] Step 6: Run focused API test.

Run:

```bash
cd mcode-app
npm run test:unit -- --runTestsByPath tests/api/acpQueuedPromptCancel.spec.ts
```

Expected: PASS.

- [ ] Step 7: Commit Task 1.

```bash
git add mcode-app/src/api/acp.ts mcode-app/tests/api/acpQueuedPromptCancel.spec.ts docs/superpowers/plans/2026-06-28-mcode-p25-shared-prompt-queue-ui.md
git commit -m "feat(app): add queued prompt cancel api"
```

## Task 2: Shared Queue Presentation Helpers

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/detailRuntimePresentation.ts`
- Modify: `mcode-app/tests/pages/conversation-detail/detailRuntimePresentation.spec.ts`

**Interfaces:**
- Produces type: `SharedPromptQueueViewItem`
- Produces type: `SharedPromptQueueViewState`
- Produces helpers:
  - `hasSharedPromptQueue(queue: SharedPromptQueueViewState | null | undefined): boolean`
  - `sharedPromptQueueTitle(queue: SharedPromptQueueViewState | null | undefined): string`
  - `sharedPromptQueueSummary(queue: SharedPromptQueueViewState | null | undefined): string`
  - `sharedPromptQueueItemPreview(item: SharedPromptQueueViewItem | null | undefined): string`
  - `sharedPromptQueueItemSource(item: SharedPromptQueueViewItem | null | undefined, localClientId?: string | null): string`
  - `sharedPromptQueuePositionLabel(item: SharedPromptQueueViewItem | null | undefined, fallbackIndex?: number): string`
  - `isSharedPromptQueueCancelDisabled(queueItemId: string | null | undefined, cancellingIds: Set<string> | string[]): boolean`

- [ ] Step 1: Add shared queue types and helpers.

In `detailRuntimePresentation.ts`, after `queueStatusText(...)`, add:

```ts
export interface SharedPromptQueueViewItem {
  queueItemId?: string | null
  sessionId?: string | null
  queuePosition?: number | null
  sourceClientId?: string | null
  sourceDeviceName?: string | null
  promptPreview?: string | null
  createdAtMs?: number | null
}

export interface SharedPromptQueueViewState {
  count?: number | null
  items?: SharedPromptQueueViewItem[] | null
}

export function hasSharedPromptQueue(
  queue: SharedPromptQueueViewState | null | undefined
) {
  return Number(queue?.count || 0) > 0 || Number(queue?.items?.length || 0) > 0
}

export function sharedPromptQueueTitle(
  queue: SharedPromptQueueViewState | null | undefined
) {
  const count = Math.max(0, Math.trunc(Number(queue?.count || queue?.items?.length || 0)))
  return `Desktop 队列 ${count}`
}

export function sharedPromptQueueSummary(
  queue: SharedPromptQueueViewState | null | undefined
) {
  const first = queue?.items?.[0]
  const preview = String(first?.promptPreview || "").trim()
  return preview || "等待当前任务完成后执行"
}

export function sharedPromptQueueItemPreview(
  item: SharedPromptQueueViewItem | null | undefined
) {
  const preview = String(item?.promptPreview || "").trim()
  return preview || "队列任务"
}

export function sharedPromptQueueItemSource(
  item: SharedPromptQueueViewItem | null | undefined,
  localClientId?: string | null
) {
  const sourceClientId = String(item?.sourceClientId || "").trim()
  const normalizedLocalClientId = String(localClientId || "").trim()
  if (sourceClientId && normalizedLocalClientId && sourceClientId === normalizedLocalClientId) {
    return "当前设备"
  }
  const deviceName = String(item?.sourceDeviceName || "").trim()
  return deviceName || "其他设备"
}

export function sharedPromptQueuePositionLabel(
  item: SharedPromptQueueViewItem | null | undefined,
  fallbackIndex = 0
) {
  const position = Number(item?.queuePosition)
  if (Number.isFinite(position) && position > 0) {
    return `#${Math.trunc(position)}`
  }
  return `#${Math.max(1, Math.trunc(fallbackIndex) + 1)}`
}

export function isSharedPromptQueueCancelDisabled(
  queueItemId: string | null | undefined,
  cancellingIds: Set<string> | string[]
) {
  const normalized = String(queueItemId || "").trim()
  if (!normalized) return true
  if (Array.isArray(cancellingIds)) return cancellingIds.includes(normalized)
  return cancellingIds.has(normalized)
}
```

- [ ] Step 2: Import helpers in `detailRuntimePresentation.spec.ts`.

Extend the existing import:

```ts
import {
  buildLiveActivitySignature,
  buildOptimisticText,
  draftSummary,
  formatQueueTime,
  formatTokenCountK,
  hasSharedPromptQueue,
  isSharedPromptQueueCancelDisabled,
  isStoppableRuntimeStatus,
  looksLikeNetworkFailure,
  queueStatusText,
  sharedPromptQueueItemPreview,
  sharedPromptQueueItemSource,
  sharedPromptQueuePositionLabel,
  sharedPromptQueueSummary,
  sharedPromptQueueTitle,
} from "@/pages/conversation-detail/detailRuntimePresentation"
```

- [ ] Step 3: Add shared queue presentation tests.

Append this test to `detailRuntimePresentation.spec.ts`:

```ts
it("formats shared Desktop prompt queue copy", () => {
  const queue = {
    count: 2,
    items: [
      {
        queueItemId: "queue-1",
        queuePosition: 1,
        sourceClientId: "client-phone",
        sourceDeviceName: "Phone",
        promptPreview: "run tests",
        createdAtMs: new Date(2026, 0, 1, 9, 5).getTime(),
      },
      {
        queueItemId: "queue-2",
        queuePosition: 2,
        sourceClientId: "client-watch",
        sourceDeviceName: "Watch",
        promptPreview: "",
      },
    ],
  }

  expect(hasSharedPromptQueue(queue)).toBe(true)
  expect(sharedPromptQueueTitle(queue)).toBe("Desktop 队列 2")
  expect(sharedPromptQueueSummary(queue)).toBe("run tests")
  expect(sharedPromptQueueItemPreview(queue.items[1])).toBe("队列任务")
  expect(sharedPromptQueueItemSource(queue.items[0], "client-phone")).toBe("当前设备")
  expect(sharedPromptQueueItemSource(queue.items[1], "client-phone")).toBe("Watch")
  expect(sharedPromptQueueItemSource({ queueItemId: "queue-3" }, "client-phone")).toBe("其他设备")
  expect(sharedPromptQueuePositionLabel(queue.items[0], 0)).toBe("#1")
  expect(sharedPromptQueuePositionLabel({ queueItemId: "queue-3" }, 2)).toBe("#3")
})

it("detects shared queue cancel disabled state", () => {
  expect(isSharedPromptQueueCancelDisabled("", new Set())).toBe(true)
  expect(isSharedPromptQueueCancelDisabled("queue-1", new Set(["queue-1"]))).toBe(true)
  expect(isSharedPromptQueueCancelDisabled("queue-1", ["queue-2"])).toBe(false)
})
```

- [ ] Step 4: Run focused presentation test.

Run:

```bash
cd mcode-app
npm run test:unit -- --runTestsByPath tests/pages/conversation-detail/detailRuntimePresentation.spec.ts
```

Expected: PASS.

- [ ] Step 5: Commit Task 2.

```bash
git add mcode-app/src/pages/conversation-detail/detailRuntimePresentation.ts mcode-app/tests/pages/conversation-detail/detailRuntimePresentation.spec.ts docs/superpowers/plans/2026-06-28-mcode-p25-shared-prompt-queue-ui.md
git commit -m "feat(app): add shared prompt queue presentation"
```

## Task 3: Conversation Detail Shared Queue UI

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
- Modify: `mcode-app/src/pages/conversation-detail/index.scss`

**Interfaces:**
- Consumes: Task 1 `acpApi.acpCancelQueuedPrompt(...)`
- Consumes: Task 2 presentation helpers
- Produces: detail page shared queue panel and `cancelSharedPromptQueueItem(queueItemId: string, sessionId?: string | null): Promise<void>`

- [ ] Step 1: Extend presentation imports in `index.vue`.

Update the `detailRuntimePresentation` import to include:

```ts
hasSharedPromptQueue,
isSharedPromptQueueCancelDisabled,
sharedPromptQueueItemPreview,
sharedPromptQueueItemSource,
sharedPromptQueuePositionLabel,
sharedPromptQueueSummary,
sharedPromptQueueTitle,
```

- [ ] Step 2: Import relay client identity.

Add this import near other service imports:

```ts
import { getRelayClientId } from "@/services/gateway/relayClientIdentity"
```

- [ ] Step 3: Add local shared queue UI state.

After `const queueExpanded = ref(false)`, add:

```ts
const sharedPromptQueueExpanded = ref(false)
const cancellingSharedQueueItemIds = ref<Set<string>>(new Set())
```

- [ ] Step 4: Add shared queue computed state.

After `const session = computed(...)`, add:

```ts
const sharedPromptQueue = computed(() => session.value?.sharedPromptQueue || null)
const showSharedPromptQueue = computed(() => hasSharedPromptQueue(sharedPromptQueue.value))
const sharedPromptQueueItems = computed(() => sharedPromptQueue.value?.items || [])
const sharedPromptQueueHeaderText = computed(() => sharedPromptQueueTitle(sharedPromptQueue.value))
const sharedPromptQueueSummaryText = computed(() => sharedPromptQueueSummary(sharedPromptQueue.value))
const localRelayClientId = computed(() => getRelayClientId())
```

- [ ] Step 5: Add a helper to replace the cancelling set reactively.

After `removeDraft(id: string)`, add:

```ts
function setSharedQueueItemCancelling(queueItemId: string, cancelling: boolean) {
  const normalized = String(queueItemId || "").trim()
  if (!normalized) return
  const next = new Set(cancellingSharedQueueItemIds.value)
  if (cancelling) {
    next.add(normalized)
  } else {
    next.delete(normalized)
  }
  cancellingSharedQueueItemIds.value = next
}
```

- [ ] Step 6: Add cancel action handler.

After `setSharedQueueItemCancelling(...)`, add:

```ts
async function cancelSharedPromptQueueItem(queueItemId?: string | null, sessionId?: string | null) {
  const normalizedQueueItemId = String(queueItemId || "").trim()
  const connectionId = firstString(session.value?.connectionId)
  if (!connectionId || !normalizedQueueItemId) return
  if (isSharedPromptQueueCancelDisabled(
    normalizedQueueItemId,
    cancellingSharedQueueItemIds.value
  )) return

  setSharedQueueItemCancelling(normalizedQueueItemId, true)
  try {
    await acpApi.acpCancelQueuedPrompt(
      connectionId,
      normalizedQueueItemId,
      firstString(sessionId) || connectionId
    )
  } catch (error) {
    uni.showToast({
      title: "取消队列任务失败，请稍后重试",
      icon: "none",
      duration: 3000,
    })
  } finally {
    setSharedQueueItemCancelling(normalizedQueueItemId, false)
  }
}
```

- [ ] Step 7: Add the shared queue template block.

In the composer area, after the local draft queue panel and before `<view class="input-main-row">`, insert:

```vue
<view
  v-if="showSharedPromptQueue"
  class="shared-queue-bar"
  @click="sharedPromptQueueExpanded = !sharedPromptQueueExpanded"
>
  <view class="shared-queue-bar__left">
    <up-icon name="order" size="14" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
    <view class="shared-queue-bar__copy">
      <text class="shared-queue-bar__title">{{ sharedPromptQueueHeaderText }}</text>
      <text class="shared-queue-bar__summary u-line-1">{{ sharedPromptQueueSummaryText }}</text>
    </view>
  </view>
  <up-icon
    :name="sharedPromptQueueExpanded ? 'arrow-up' : 'arrow-down'"
    size="12"
    :color="upThemeVar('--up-light-color', '#c0c4cc')"
  ></up-icon>
</view>

<view v-if="sharedPromptQueueExpanded && showSharedPromptQueue" class="shared-queue-panel">
  <view
    v-for="(item, index) in sharedPromptQueueItems"
    :key="item.queueItemId || index"
    class="shared-queue-item"
  >
    <view class="shared-queue-item__position">
      {{ sharedPromptQueuePositionLabel(item, index) }}
    </view>
    <view class="shared-queue-item__body">
      <text class="shared-queue-item__text u-line-2">
        {{ sharedPromptQueueItemPreview(item) }}
      </text>
      <view class="shared-queue-item__meta">
        <text>{{ sharedPromptQueueItemSource(item, localRelayClientId) }}</text>
        <text v-if="item.createdAtMs">{{ formatQueueTime(item.createdAtMs) }}</text>
      </view>
    </view>
    <view
      v-if="session?.connectionId && item.queueItemId"
      class="shared-queue-op"
      :class="{ 'shared-queue-op--disabled': isSharedPromptQueueCancelDisabled(item.queueItemId, cancellingSharedQueueItemIds) }"
      @click.stop="cancelSharedPromptQueueItem(item.queueItemId, item.sessionId)"
    >
      {{ isSharedPromptQueueCancelDisabled(item.queueItemId, cancellingSharedQueueItemIds) ? "取消中" : "取消" }}
    </view>
  </view>
</view>
```

- [ ] Step 8: Add shared queue styles using `--up-*` variables.

In `index.scss`, after existing `.queue-op` styles and before `.input-main-row`, add:

```scss
.shared-queue-bar {
  margin-bottom: 10rpx;
  padding: 12rpx 14rpx;
  border-radius: 16rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
  border: 1rpx solid color-mix(in srgb, var(--up-primary, #2979ff) 28%, var(--up-card-bg-color, #ffffff) 72%);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.shared-queue-bar__left {
  display: flex;
  align-items: center;
  gap: 10rpx;
  min-width: 0;
}

.shared-queue-bar__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2rpx;
}

.shared-queue-bar__title {
  font-size: 23rpx;
  color: var(--up-primary, #2979ff);
  font-weight: 600;
}

.shared-queue-bar__summary {
  font-size: 20rpx;
  color: var(--up-tips-color, #909193);
  max-width: 520rpx;
}

.shared-queue-panel {
  margin-bottom: 12rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.shared-queue-item {
  padding: 12rpx;
  border-radius: 14rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  border: 1rpx solid var(--up-border-color, #dadbde);
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
}

.shared-queue-item__position {
  flex-shrink: 0;
  font-size: 20rpx;
  color: var(--up-primary, #2979ff);
  font-weight: 600;
  padding-top: 2rpx;
}

.shared-queue-item__body {
  flex: 1;
  min-width: 0;
}

.shared-queue-item__text {
  display: block;
  font-size: 23rpx;
  color: var(--up-main-color, #303133);
  line-height: 1.4;
}

.shared-queue-item__meta {
  margin-top: 6rpx;
  display: flex;
  align-items: center;
  gap: 12rpx;
  font-size: 20rpx;
  color: var(--up-tips-color, #909193);
}

.shared-queue-op {
  font-size: 20rpx;
  color: #fa3534;
  padding: 6rpx 10rpx;
  border-radius: 999rpx;
  background-color: color-mix(in srgb, #fa3534 10%, var(--up-card-bg-color, #ffffff) 90%);
  flex-shrink: 0;

  &--disabled {
    color: var(--up-tips-color, #909193);
    background-color: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
    pointer-events: none;
  }
}
```

- [ ] Step 9: Run type/build-adjacent focused tests.

Run:

```bash
cd mcode-app
npm run test:unit -- --runTestsByPath tests/pages/conversation-detail/detailRuntimePresentation.spec.ts tests/api/acpQueuedPromptCancel.spec.ts
```

Expected: PASS.

- [ ] Step 10: Commit Task 3.

```bash
git add mcode-app/src/pages/conversation-detail/index.vue mcode-app/src/pages/conversation-detail/index.scss docs/superpowers/plans/2026-06-28-mcode-p25-shared-prompt-queue-ui.md
git commit -m "feat(app): show shared prompt queue"
```

## Task 4: P25 Docs And Verification

**Files:**
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`
- Modify: `docs/superpowers/plans/2026-06-28-mcode-p25-shared-prompt-queue-ui.md`

**Interfaces:**
- Consumes all prior task outputs.
- Produces updated architecture note with P25 implemented status.

- [ ] Step 1: Update P25 architecture note status.

In `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`, change `## P25 Planned Shared Prompt Queue UI Behavior` to:

```md
## P25 Shared Prompt Queue UI Behavior
```

Replace the `Planned app behavior:` line with:

```md
Implemented app behavior:
```

- [ ] Step 2: Add P25 implementation progress bullets.

At the end of the P25 section, add:

```md
P25 first slice status:

- Implemented shared Desktop queue presentation helpers for title, summary,
  row preview, source labels, position labels, and cancel-disabled state.
- Implemented `acpCancelQueuedPrompt(...)` as the app wrapper for
  `acp_cancel_queued_prompt`.
- Implemented conversation detail shared queue UI separately from the local
  draft queue.
- Implemented queued-item cancel request state without optimistic row removal;
  P24 lifecycle events remain authoritative.
- Not implemented: queue reorder, queue persistence, bulk cancel, or ownership
  restrictions.
```

- [ ] Step 3: Mark this plan complete as tasks are finished.

Change all completed task checkboxes in this file from `[ ]` to `[x]`.

- [ ] Step 4: Run full app unit tests.

Run:

```bash
cd mcode-app
npm run test:unit
```

Expected: PASS.

- [ ] Step 5: Run repository diff check.

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] Step 6: Commit docs and plan progress.

```bash
git add docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md docs/superpowers/plans/2026-06-28-mcode-p25-shared-prompt-queue-ui.md
git commit -m "docs(app): record p25 shared prompt queue ui"
```

## Self-Review

- Spec coverage: API wrapper, presentation helpers, separate shared queue UI, cancel in-flight state, non-optimistic removal, docs, and tests are covered.
- Scope control: Plan does not change Desktop queue scheduling, persistence, queue ordering, or target agent model.
- Type consistency: Plan uses `sharedPromptQueue`, `queueItemId`, `sessionId`, `sourceClientId`, and `targetAgent` consistently.
