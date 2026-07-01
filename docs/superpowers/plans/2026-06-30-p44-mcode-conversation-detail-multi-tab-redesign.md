# P44 MCode Conversation Detail Multi-Tab Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `mcode-app` conversation detail into a real multi-session tab host with `up-tabs`, `swiper` gesture switching, lazy adjacent-page mounting, remote PC tab synchronization, close-tab writeback, and the new Stitch-inspired glass redesign while preserving existing runtime/detail correctness. This plan tracks `P44`.

**Architecture:** Keep remote opened tabs as the only membership/order truth, and split the current monolithic detail page into a tab shell plus reusable single-session detail body/state units. Reuse `openedTabsRealtimeCache`, `pcTabSyncService`, existing detail helper modules, and current conversation runtime authority so the redesign changes UI architecture and page composition without changing ACP, realtime, SQLite, or opened-tab protocols.

**Tech Stack:** `uni-app`, `Vue 3`, `uview-plus`, `Pinia`, `TypeScript`, existing conversation detail helper modules, `swiper`, Jest

## Global Constraints

- Do not change ACP, realtime, SQLite, opened-tab sync, or hot runtime protocols.
- Do not replace `up-tabs` with a custom tab widget.
- Do not render every tab body eagerly.
- Do not introduce a second independent mobile-only tab truth source.
- Prefer `--up-page-bg-color`, `--up-card-bg-color`, `--up-main-color`, `--up-content-color`, `--up-tips-color`, `--up-border-color`, and `--up-primary` for the redesign.
- Do not add new `--mcode-*` aliases for the redesign colors.
- Keep dark-mode compatibility by mapping the glass and contrast system to existing `uview-plus` runtime theme variables.
- `P44` continues to depend on `P43` short-route expectations and should still prefer `connectionId`.
- Every mcode change must include or update a Markdown note under `docs/mcode-architecture-notes/`.
- The architecture note must describe architecture, protocol/data-flow changes, UI behavior, compatibility considerations, and native iOS/Android replication guidance.

---

### Task 1: Add a focused multi-tab shell state module for conversation detail

**Files:**
- Create: `mcode-app/src/pages/conversation-detail/detailTabsPresentation.ts`
- Test: `mcode-app/tests/pages/conversation-detail/detailTabsPresentation.spec.ts`

**Interfaces:**
- Consumes: `OpenedTabItem` from `@/types/acp`
- Produces: `DetailShellTabItem`, `buildDetailShellTabs(input): DetailShellTabItem[]`, `resolveDetailTabWindow(activeIndex: number, total: number): number[]`, `resolveDetailTabCloseTarget(activeIndex: number, closedIndex: number, total: number): number`

- [ ] **Step 1: Write the failing tests**

```ts
import {
  buildDetailShellTabs,
  resolveDetailTabCloseTarget,
  resolveDetailTabWindow,
} from "@/pages/conversation-detail/detailTabsPresentation"

describe("detailTabsPresentation", () => {
  it("maps opened tabs into shell tabs ordered by position", () => {
    expect(buildDetailShellTabs({
      openedTabs: [
        {
          id: 9,
          folder_id: 2,
          conversation_id: 99,
          agent_type: "codex",
          position: 1,
          is_active: false,
          is_pinned: false,
        },
        {
          id: 3,
          folder_id: 2,
          conversation_id: 88,
          agent_type: "claude_code",
          position: 0,
          is_active: true,
          is_pinned: false,
        },
      ],
      titleByConversationId: {
        88: "mcode",
        99: "infra-core",
      },
    })).toEqual([
      expect.objectContaining({
        tabId: 3,
        conversationId: 88,
        title: "mcode",
        active: true,
      }),
      expect.objectContaining({
        tabId: 9,
        conversationId: 99,
        title: "infra-core",
        active: false,
      }),
    ])
  })

  it("returns only current and adjacent indexes for the lazy mount window", () => {
    expect(resolveDetailTabWindow(0, 4)).toEqual([0, 1])
    expect(resolveDetailTabWindow(2, 5)).toEqual([1, 2, 3])
    expect(resolveDetailTabWindow(4, 5)).toEqual([3, 4])
  })

  it("closes the active tab by preferring the right tab and then the left tab", () => {
    expect(resolveDetailTabCloseTarget(1, 1, 4)).toBe(1)
    expect(resolveDetailTabCloseTarget(3, 3, 4)).toBe(2)
    expect(resolveDetailTabCloseTarget(0, 0, 1)).toBe(-1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- --runTestsByPath tests/pages/conversation-detail/detailTabsPresentation.spec.ts`
Expected: FAIL with module-not-found for `@/pages/conversation-detail/detailTabsPresentation`

- [ ] **Step 3: Write minimal implementation**

```ts
import type { OpenedTabItem } from "@/types/acp"

export interface DetailShellTabItem {
  tabId: number
  folderId: number
  conversationId: number
  agentType: string
  title: string
  active: boolean
  position: number
}

export function buildDetailShellTabs(input: {
  openedTabs: OpenedTabItem[]
  titleByConversationId?: Record<number, string>
}) {
  return (Array.isArray(input.openedTabs) ? input.openedTabs : [])
    .filter((item) => Number(item?.conversation_id || 0) > 0)
    .slice()
    .sort((left, right) => Number(left.position || 0) - Number(right.position || 0))
    .map((item) => {
      const conversationId = Number(item.conversation_id || 0)
      return {
        tabId: Number(item.id || 0),
        folderId: Number(item.folder_id || 0),
        conversationId,
        agentType: String(item.agent_type || "claude_code"),
        title: input.titleByConversationId?.[conversationId] || `会话 ${conversationId}`,
        active: Boolean(item.is_active),
        position: Number(item.position || 0),
      } satisfies DetailShellTabItem
    })
}

export function resolveDetailTabWindow(activeIndex: number, total: number) {
  const safeTotal = Math.max(0, Number(total || 0))
  const safeActive = Math.min(Math.max(0, Number(activeIndex || 0)), Math.max(0, safeTotal - 1))
  const indexes = new Set<number>()
  if (safeTotal <= 0) return []
  indexes.add(safeActive)
  if (safeActive > 0) indexes.add(safeActive - 1)
  if (safeActive + 1 < safeTotal) indexes.add(safeActive + 1)
  return Array.from(indexes).sort((left, right) => left - right)
}

export function resolveDetailTabCloseTarget(
  activeIndex: number,
  closedIndex: number,
  total: number,
) {
  const safeTotal = Math.max(0, Number(total || 0))
  if (safeTotal <= 1) return -1
  if (closedIndex !== activeIndex) {
    return closedIndex < activeIndex ? activeIndex - 1 : activeIndex
  }
  if (closedIndex + 1 < safeTotal) return closedIndex
  if (closedIndex - 1 >= 0) return closedIndex - 1
  return -1
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- --runTestsByPath tests/pages/conversation-detail/detailTabsPresentation.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/conversation-detail/detailTabsPresentation.ts mcode-app/tests/pages/conversation-detail/detailTabsPresentation.spec.ts
git commit -m "feat(app): add detail tabs presentation helpers"
```

### Task 2: Extend remote opened-tab service helpers for detail tab closing and local shell sync

**Files:**
- Modify: `mcode-app/src/services/conversation/pcTabSyncService.ts`
- Modify: `mcode-app/tests/services/pcTabSyncService.spec.ts`
- Modify: `mcode-app/src/services/conversation/openedTabsRealtimeCache.ts`
- Modify: `mcode-app/tests/services/openedTabsRealtimeCache.spec.ts`

**Interfaces:**
- Consumes: `ensureConversationTab(input): Promise<OpenedTabsSnapshot | null>`, `replaceOpenedTabsSnapshot(instanceKey, version, items, origin)`
- Produces: `closeConversationTab(input): Promise<OpenedTabsSnapshot | null>`, `resolveConversationTabIndex(items: OpenedTabItem[], conversationId: number): number`

- [ ] **Step 1: Write the failing service tests**

```ts
import {
  closeConversationTab,
  resolveConversationTabIndex,
} from "@/services/conversation/pcTabSyncService"
import { getOpenedTabsSnapshot, replaceOpenedTabsSnapshot } from "@/services/conversation/openedTabsRealtimeCache"

jest.mock("@/services/conversation/openedTabsRealtimeCache", () => ({
  getOpenedTabsSnapshot: jest.fn(),
  replaceOpenedTabsSnapshot: jest.fn(),
}))

it("removes a conversation tab and preserves remaining order", async () => {
  ;(getOpenedTabsSnapshot as jest.Mock).mockReturnValue({
    instanceKey: "inst-a",
    version: 4,
    items: [
      { id: 1, folder_id: 2, conversation_id: 10, agent_type: "codex", position: 0, is_active: true, is_pinned: false },
      { id: 2, folder_id: 2, conversation_id: 11, agent_type: "codex", position: 1, is_active: false, is_pinned: false },
    ],
  })
  const gateway = {
    call: jest.fn().mockResolvedValue({
      accepted: true,
      version: 5,
      tabs: [
        { id: 1, folder_id: 2, conversation_id: 10, agent_type: "codex", position: 0, is_active: true, is_pinned: false },
      ],
    }),
  }

  await closeConversationTab({
    instanceKey: "inst-a",
    gateway: gateway as any,
    conversationId: 11,
    origin: "mcode-mobile",
  })

  expect(gateway.call).toHaveBeenCalledWith(
    "save_opened_tabs",
    expect.objectContaining({
      version: 4,
      tabs: [expect.objectContaining({ conversation_id: 10 })],
    }),
  )
  expect(replaceOpenedTabsSnapshot).toHaveBeenCalled()
})

it("finds the correct tab index for a conversation id", () => {
  expect(resolveConversationTabIndex([
    { id: 1, folder_id: 2, conversation_id: 10, agent_type: "codex", position: 0, is_active: true, is_pinned: false },
    { id: 2, folder_id: 2, conversation_id: 11, agent_type: "codex", position: 1, is_active: false, is_pinned: false },
  ] as any, 11)).toBe(1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- --runTestsByPath tests/services/pcTabSyncService.spec.ts tests/services/openedTabsRealtimeCache.spec.ts`
Expected: FAIL because `closeConversationTab` and `resolveConversationTabIndex` are not implemented

- [ ] **Step 3: Write minimal implementation**

```ts
export async function closeConversationTab(input: {
  instanceKey: string
  gateway: CodegGateway
  conversationId: number
  origin?: string
}) {
  const instanceKey = String(input.instanceKey || "").trim()
  const conversationId = Number(input.conversationId || 0)
  if (!instanceKey || !conversationId) return null
  const baseSnapshot = await readOpenedTabsSnapshot(instanceKey, input.gateway)
  const nextItems = baseSnapshot.items
    .filter((item) => Number(item.conversation_id || 0) !== conversationId)
    .map((item, index) => ({
      ...item,
      position: index,
    }))
  const saved = await input.gateway.call<SaveOpenedTabsResult>("save_opened_tabs", {
    version: baseSnapshot.version,
    tabs: nextItems,
    origin: input.origin || "mcode-mobile",
  })
  const savedVersion = Number(saved?.version || 0)
  const savedItems = normalizeOpenedTabsList(saved?.tabs ?? saved?.items ?? nextItems)
  replaceOpenedTabsSnapshot(instanceKey, savedVersion || baseSnapshot.version + 1, savedItems, input.origin || "mcode-mobile")
  return {
    instanceKey,
    version: savedVersion || baseSnapshot.version + 1,
    items: savedItems,
  } satisfies OpenedTabsSnapshot
}

export function resolveConversationTabIndex(items: OpenedTabItem[], conversationId: number) {
  return (Array.isArray(items) ? items : []).findIndex(
    (item) => Number(item.conversation_id || 0) === Number(conversationId || 0),
  )
}
```

- [ ] **Step 4: Run the focused tests**

Run: `pnpm test:unit -- --runTestsByPath tests/services/pcTabSyncService.spec.ts tests/services/openedTabsRealtimeCache.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/services/conversation/pcTabSyncService.ts mcode-app/tests/services/pcTabSyncService.spec.ts mcode-app/src/services/conversation/openedTabsRealtimeCache.ts mcode-app/tests/services/openedTabsRealtimeCache.spec.ts
git commit -m "feat(app): support closing conversation tabs"
```

### Task 3: Add reusable single-session detail body and per-tab shell contracts

**Files:**
- Create: `mcode-app/src/pages/conversation-detail/ConversationDetailBody.vue`
- Create: `mcode-app/src/pages/conversation-detail/detailTabState.ts`
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
- Modify: `mcode-app/src/pages/conversation-detail/index.scss`
- Test: `mcode-app/tests/pages/conversation-detail/detailLayoutPresentation.spec.ts`

**Interfaces:**
- Consumes: existing detail helper modules, `DetailShellTabItem`, `buildMessageListPageStyle(...)`
- Produces: `ConversationDetailBody` component props for one session body, `createDetailTabState(input): DetailTabState`, `isDetailTabMounted(window: number[], index: number): boolean`

- [ ] **Step 1: Extend layout tests for tab-shell offsets**

```ts
import { buildMessageListPageStyle } from "@/pages/conversation-detail/detailLayoutPresentation"

it("accounts for tabs strip height in the top chrome region", () => {
  expect(buildMessageListPageStyle({
    viewportHeight: 900,
    topChromeHeight: 168,
    bottomComposerHeight: 180,
  })).toEqual({
    paddingTop: "168px",
    paddingBottom: "180px",
    minHeight: "552px",
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- --runTestsByPath tests/pages/conversation-detail/detailLayoutPresentation.spec.ts`
Expected: FAIL because the shell offset math or expectations are not yet updated for the tab strip flow

- [ ] **Step 3: Write minimal implementation**

Create `detailTabState.ts`:

```ts
import type { DetailShellTabItem } from "./detailTabsPresentation"

export interface DetailTabState {
  tab: DetailShellTabItem
  draftText: string
  showPlanDrawer: boolean
  questionSubmitting: boolean
  permissionSubmitting: boolean
}

export function createDetailTabState(tab: DetailShellTabItem): DetailTabState {
  return {
    tab,
    draftText: "",
    showPlanDrawer: false,
    questionSubmitting: false,
    permissionSubmitting: false,
  }
}

export function isDetailTabMounted(windowIndexes: number[], index: number) {
  return Array.isArray(windowIndexes) && windowIndexes.includes(index)
}
```

Create `ConversationDetailBody.vue` as the extracted single-session render surface for:

```vue
<template>
  <view class="detail-body">
    <slot name="status"></slot>
    <slot name="history"></slot>
    <view class="message-list" :style="messageListPageStyle">
      <view class="message-list__content">
        <slot name="content"></slot>
      </view>
    </view>
    <view class="input-wrap" :style="inputWrapStyle">
      <slot name="composer"></slot>
    </view>
  </view>
</template>
```

Update `index.vue` to move the existing single-session markup into the new body boundary while keeping existing one-session behavior intact for the initial active tab.

- [ ] **Step 4: Run verification**

Run: `pnpm test:unit -- --runTestsByPath tests/pages/conversation-detail/detailLayoutPresentation.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/conversation-detail/ConversationDetailBody.vue mcode-app/src/pages/conversation-detail/detailTabState.ts mcode-app/src/pages/conversation-detail/index.vue mcode-app/src/pages/conversation-detail/index.scss mcode-app/tests/pages/conversation-detail/detailLayoutPresentation.spec.ts
git commit -m "refactor(app): extract conversation detail body shell"
```

### Task 4: Build the multi-tab shell with `up-tabs`, `swiper`, lazy mounting, and real-time tab synchronization

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
- Modify: `mcode-app/src/pages/conversation-detail/index.scss`
- Modify: `mcode-app/src/pages/conversation-detail/detailLayoutPresentation.ts`
- Test: `mcode-app/tests/pages/conversation-detail/detailTabsPresentation.spec.ts`
- Test: `mcode-app/tests/pages/conversation-detail/detailLayoutPresentation.spec.ts`

**Interfaces:**
- Consumes: `DetailShellTabItem[]`, `resolveDetailTabWindow(activeIndex, total)`, `resolveConversationTabIndex(items, conversationId)`, `getOpenedTabsSnapshot(instanceKey)`, `closeConversationTab(input)`
- Produces: tab shell state in `index.vue`, `up-tabs` selection sync, `swiper` index sync, lazy-mount render window, route-session ensure flow

- [ ] **Step 1: Extend the tabs presentation tests for shell behavior**

```ts
import { resolveDetailTabWindow } from "@/pages/conversation-detail/detailTabsPresentation"

it("keeps a three-page window around the active tab when possible", () => {
  expect(resolveDetailTabWindow(1, 3)).toEqual([0, 1, 2])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- --runTestsByPath tests/pages/conversation-detail/detailTabsPresentation.spec.ts`
Expected: FAIL if the render-window behavior is not yet wired to the page shell assumptions

- [ ] **Step 3: Write minimal implementation**

Update `index.vue` to:

```vue
<up-tabs
  :list="detailTabs"
  :current="activeTabIndex"
  :scrollable="true"
  lineWidth="0"
  @change="handleDetailTabChange"
/>

<swiper
  class="detail-shell__swiper"
  :current="activeTabIndex"
  @change="handleDetailSwiperChange"
>
  <swiper-item
    v-for="(tab, index) in detailTabs"
    :key="tab.tabId"
    class="detail-shell__swiper-item"
  >
    <ConversationDetailBody v-if="isDetailTabMounted(mountedTabWindow, index)">
      <!-- move the current single-session message/composer rendering into per-tab slots -->
    </ConversationDetailBody>
  </swiper-item>
</swiper>
```

and add shell logic that:

```ts
const detailTabs = computed(() =>
  buildDetailShellTabs({
    openedTabs: openedTabsSnapshot.value?.items || [],
    titleByConversationId: detailTabTitles.value,
  }),
)

const mountedTabWindow = computed(() =>
  resolveDetailTabWindow(activeTabIndex.value, detailTabs.value.length),
)
```

Also subscribe to `tabs://changed` and continue listening to `conversation://changed` for title refresh.

- [ ] **Step 4: Run focused verification**

Run: `pnpm test:unit -- --runTestsByPath tests/pages/conversation-detail/detailTabsPresentation.spec.ts tests/pages/conversation-detail/detailLayoutPresentation.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/conversation-detail/index.vue mcode-app/src/pages/conversation-detail/index.scss mcode-app/src/pages/conversation-detail/detailLayoutPresentation.ts mcode-app/tests/pages/conversation-detail/detailTabsPresentation.spec.ts mcode-app/tests/pages/conversation-detail/detailLayoutPresentation.spec.ts
git commit -m "feat(app): add multi-tab shell to conversation detail"
```

### Task 5: Apply the Stitch-inspired glass redesign to the tab shell, canvas, and floating composer dock

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.scss`
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
- Modify: `mcode-app/src/pages/conversation-detail/detailLayoutPresentation.ts`

**Interfaces:**
- Consumes: existing `upThemeVar(...)` theme mapping and fixed-offset helpers
- Produces: dual-top-region layout, glass tab strip, centered message canvas, floating composer dock, updated spacing/min-height offsets

- [ ] **Step 1: Add a failing layout test for the redesigned chrome heights**

```ts
import { buildHistoryStatusStyle } from "@/pages/conversation-detail/detailLayoutPresentation"

it("includes the tabs strip height when placing floating history status", () => {
  expect(buildHistoryStatusStyle({
    navbarHeight: 96,
    toolbarHeight: 48,
  })).toEqual({
    top: "144px",
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- --runTestsByPath tests/pages/conversation-detail/detailLayoutPresentation.spec.ts`
Expected: FAIL if the helper and expectations do not yet match the redesigned fixed chrome

- [ ] **Step 3: Write minimal implementation**

Update `index.scss` to introduce:

```scss
.page {
  background:
    radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--up-primary, #2979ff) 18%, transparent) 0, transparent 34%),
    radial-gradient(circle at 0% 100%, color-mix(in srgb, var(--up-border-color, #dadbde) 30%, transparent) 0, transparent 26%),
    var(--up-page-bg-color, #f7f9fb);
}

.detail-shell__tabs {
  position: fixed;
  left: 0;
  right: 0;
  z-index: 24;
  padding: 10rpx 24rpx 14rpx;
  backdrop-filter: blur(18px);
}

.detail-shell__canvas {
  width: min(100%, 860rpx);
  margin: 0 auto;
}

.input-wrap {
  position: fixed;
  left: 24rpx;
  right: 24rpx;
  bottom: 24rpx;
  border-radius: 28rpx;
  backdrop-filter: blur(24px);
}
```

Keep all new colors/backgrounds sourced from `--up-*` variables or documented literal fallbacks already accepted by the current theme system.

- [ ] **Step 4: Run focused verification**

Run: `pnpm test:unit -- --runTestsByPath tests/pages/conversation-detail/detailLayoutPresentation.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/conversation-detail/index.scss mcode-app/src/pages/conversation-detail/index.vue mcode-app/src/pages/conversation-detail/detailLayoutPresentation.ts
git commit -m "feat(app): redesign conversation detail with glass multi-tab layout"
```

### Task 6: Add the required architecture note and run final regression checks

**Files:**
- Create: `docs/mcode-architecture-notes/2026-06-30-conversation-detail-multi-tab-redesign.md`
- Modify: `docs/superpowers/specs/2026-06-30-p44-mcode-conversation-detail-multi-tab-redesign-design.md`
- Modify: `docs/superpowers/plans/2026-06-30-p44-mcode-conversation-detail-multi-tab-redesign.md`

**Interfaces:**
- Consumes: implemented tab shell/body split, opened-tabs sync, close-tab behavior, lazy mount behavior
- Produces: architecture note describing redesign boundaries and native guidance

- [ ] **Step 1: Write the architecture note**

```md
# Conversation Detail Multi-Tab Redesign

## Architecture

`mcode-app` conversation detail is now split into a multi-session shell and a single-session body. The shell owns `up-tabs`, `swiper`, lazy mount windows, and remote opened-tab synchronization. Each session tab keeps isolated UI state so drafts, permission cards, question cards, and scroll restore do not leak across tabs.

## Protocol And Data Flow

There is no protocol change. Opened tab membership/order still comes from remote opened-tab snapshots plus `tabs://changed`. Conversation titles and related metadata continue to refresh through `conversation://changed`. Closing a tab writes the new snapshot back through the existing mobile opened-tab save path.

## UI Behavior

The page now has a dual-top glass layout, real interactive tabs, horizontal swipe switching, right-first active-tab close fallback, and a floating glass composer dock. Only the current tab and adjacent tabs mount full detail bodies.

## Compatibility

ACP, realtime, SQLite, hot runtime, and opened-tab protocols remain unchanged. The redesign is a UI architecture change on top of the existing detail correctness model.

## Native iOS/Android Guidance

Native clients should use remote opened tabs as the only tab truth source, keep one isolated state slice per visible session tab, sync tab strip selection bidirectionally with the horizontal pager, lazily mount only current and adjacent pages, and keep session close behavior aligned with right-first fallback.
```

- [ ] **Step 2: Self-review the note and plan references**

Run: `rg -n "up-tabs|swiper|tabs://changed|conversation://changed|lazy mount|right-first" docs/mcode-architecture-notes/2026-06-30-conversation-detail-multi-tab-redesign.md docs/superpowers/specs/2026-06-30-p44-mcode-conversation-detail-multi-tab-redesign-design.md docs/superpowers/plans/2026-06-30-p44-mcode-conversation-detail-multi-tab-redesign.md`
Expected: matches in all three files with no `TODO`, `TBD`, or contradictory tab-truth language

- [ ] **Step 3: Run final targeted regression checks**

Run: `pnpm test:unit -- --runTestsByPath tests/pages/conversation-detail/detailTabsPresentation.spec.ts tests/pages/conversation-detail/detailLayoutPresentation.spec.ts tests/services/pcTabSyncService.spec.ts tests/services/openedTabsRealtimeCache.spec.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add docs/mcode-architecture-notes/2026-06-30-conversation-detail-multi-tab-redesign.md docs/superpowers/specs/2026-06-30-p44-mcode-conversation-detail-multi-tab-redesign-design.md docs/superpowers/plans/2026-06-30-p44-mcode-conversation-detail-multi-tab-redesign.md
git commit -m "docs(app): record conversation detail multi-tab redesign"
```



