# Conversation List Pull Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the conversation list support gesture-based pull refresh in both overview mode and history mode without resetting search, selected history group, or current tab.

**Architecture:** Replace the history-mode dependency on third-party `up-cate-tab` with a local refresh-capable copy, then wire both overview and history scroll containers to a shared forced-refresh data path. Keep the existing list-selection state model intact and only bypass cache/short-circuit checks during explicit user refresh.

**Tech Stack:** Vue 3, uni-app `scroll-view` refresher, TypeScript, uview-plus, `sql.js` / `plus.sqlite`

---

**Repository reality:** `mcode-app` does not have an automated frontend test suite. Verification for this change uses `uni` builds plus manual pull-refresh checks on both list modes.

### Task 1: Add a refresh-capable local history cate-tab

**Files:**
- Create: `mcode-app/src/components/ConversationHistoryCateTab.vue`
- Reference: `mcode-app/node_modules/uview-plus/components/u-cate-tab/u-cate-tab.vue`

- [ ] **Step 1: Create the local component shell**

Copy the current `u-cate-tab` structure into a local SFC named `ConversationHistoryCateTab` so the app stops depending on unmodifiable `node_modules` behavior for the right-side list scroll container.

Use this shape as the starting point:

```vue
<template>
  <view class="conversation-history-cate-tab" :style="{ height: addUnit(height) }">
    <view class="conversation-history-cate-tab__wrap">
      <scroll-view
        class="conversation-history-cate-tab__menu conversation-history-cate-tab__menu-scroll"
        scroll-y
        scroll-with-animation
        :scroll-top="scrollTop"
        :scroll-into-view="itemId"
      >
        <view
          v-for="(item, index) in tabList"
          :key="index"
          class="conversation-history-cate-tab__item"
          :class="[innerCurrent === index && 'conversation-history-cate-tab__item--active']"
          @tap.stop="switchMenu(index)"
        >
          <slot name="tabItem" :item="item"></slot>
          <text v-if="!$slots.tabItem" class="u-line-1">{{ item[tabKeyName] }}</text>
        </view>
      </scroll-view>

      <scroll-view
        class="conversation-history-cate-tab__right-box"
        scroll-y
        scroll-with-animation
        :scroll-top="scrollRightTop"
        :scroll-into-view="scrollIntoView"
        @scroll="rightScroll"
      >
        <view class="conversation-history-cate-tab__right-top">
          <slot name="rightTop" :tabList="tabList"></slot>
        </view>
        <view class="conversation-history-cate-tab__page-view">
          <template v-for="(item, index) in tabList" :key="index">
            <view
              v-if="mode === 'follow' || (mode === 'tab' && index === innerCurrent)"
              class="conversation-history-cate-tab__page-item"
              :id="'item' + index"
            >
              <slot name="itemList" :item="item"></slot>
            </view>
          </template>
        </view>
      </scroll-view>
    </view>
  </view>
</template>
```

- [ ] **Step 2: Add refresher API without changing slot contracts**

Add props and emits so the history page can control refresh externally while preserving the existing `tabItem`, `rightTop`, and `itemList` slots.

Add these props/emits:

```ts
const props = defineProps({
  mode: { type: String, default: "follow" },
  height: { type: String, default: "100%" },
  tabList: { type: Array, default: () => [] },
  tabKeyName: { type: String, default: "name" },
  itemKeyName: { type: String, default: "name" },
  current: { type: Number, default: 0 },
  refresherEnabled: { type: Boolean, default: false },
  refresherTriggered: { type: Boolean, default: false },
})

const emit = defineEmits<{
  (event: "update:current", value: number): void
  (event: "refresherrefresh"): void
}>()
```

Wire the right-side `scroll-view` like this:

```vue
<scroll-view
  class="conversation-history-cate-tab__right-box"
  scroll-y
  :refresher-enabled="refresherEnabled"
  :refresher-triggered="refresherTriggered"
  @refresherrefresh="emit('refresherrefresh')"
  :scroll-top="scrollRightTop"
  :scroll-into-view="scrollIntoView"
  scroll-with-animation
  @scroll="rightScroll"
>
```

- [ ] **Step 3: Keep the existing tab-sync behavior intact**

Port the menu-centering, `current` watcher, and right-scroll synchronization logic from `u-cate-tab` with only naming updates. Do not add new behavior beyond the refresher wiring.

Key methods that must survive unchanged in meaning:

```ts
function switchMenu(index: number): void
function leftMenuStatus(index: number): Promise<void> | void
async function getMenuItemTop(): Promise<void>
async function rightScroll(event: any): Promise<void>
```

- [ ] **Step 4: Verify the new component compiles**

Run:

```bash
npm run build:h5
```

Expected: `DONE  Build complete.` with no new TypeScript/SFC errors.

- [ ] **Step 5: Commit the local component**

Run:

```bash
git add mcode-app/src/components/ConversationHistoryCateTab.vue
git commit -m "feat(app): add refreshable history cate tab"
```

### Task 2: Wire scroll-view refresh into both conversation list modes

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`
- Modify: `mcode-app/src/pages.json`

- [ ] **Step 1: Replace the history-mode component usage**

Import and swap `up-cate-tab` for the local component:

```ts
import ConversationHistoryCateTab from "@/components/ConversationHistoryCateTab.vue"
```

Replace the current opening tag:

```vue
<up-cate-tab
  class="cate-tab"
  :tabList="tabList"
  tabKeyName="label"
  mode="tab"
  :height="cateTabHeight"
  :current="currentTab"
  @update:current="onTabChange"
>
```

With:

```vue
<ConversationHistoryCateTab
  class="cate-tab"
  :tabList="tabList"
  tabKeyName="label"
  mode="tab"
  :height="cateTabHeight"
  :current="currentTab"
  :refresher-enabled="true"
  :refresher-triggered="historyRefreshing"
  @update:current="onTabChange"
  @refresherrefresh="handleHistoryRefresh"
>
```

- [ ] **Step 2: Enable refresher on overview mode**

Add overview refresh wiring to the existing `group-scroll` container:

```vue
<scroll-view
  v-if="!showHistoryPanel"
  class="group-scroll"
  scroll-y
  enhanced
  show-scrollbar="false"
  :refresher-enabled="true"
  :refresher-triggered="overviewRefreshing"
  @refresherrefresh="handleOverviewRefresh"
>
```

- [ ] **Step 3: Introduce explicit refresh state**

Add page-local flags so the refresher indicator is independently controlled per mode:

```ts
const overviewRefreshing = ref(false)
const historyRefreshing = ref(false)
```

Add simple entry handlers:

```ts
function handleOverviewRefresh() {
  void refreshConversationList("overview")
}

function handleHistoryRefresh() {
  void refreshConversationList("history")
}
```

- [ ] **Step 4: Disable page-level native pull refresh**

Once both internal scroll containers own refresh, turn off the page-level channel to avoid duplicate gesture paths:

```json
{
  "path": "pages/conversations/index",
  "style": {
    "navigationBarTitleText": "会话",
    "enablePullDownRefresh": false
  }
}
```

Remove the now-obsolete page hook from `index.vue`:

```ts
import { onReady, onShow } from "@dcloudio/uni-app"
```

Delete:

```ts
onPullDownRefresh(() => {
  loadOverviewData().finally(() => {
    uni.stopPullDownRefresh()
    syncCateTabHeight()
  })
})
```

- [ ] **Step 5: Verify wiring builds cleanly**

Run:

```bash
npm run build:h5
```

Expected: `DONE  Build complete.` and no template binding errors for the new component props/events.

- [ ] **Step 6: Commit the UI wiring**

Run:

```bash
git add mcode-app/src/pages/conversations/index.vue mcode-app/src/pages.json
git commit -m "feat(app): wire conversation list pull refresh"
```

### Task 3: Add forced refresh data flow without resetting page context

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`

- [ ] **Step 1: Add a forced overview refresh path**

Change the overview loader signatures so explicit pull refresh can bypass the current 15-second cache:

```ts
async function loadOverviewData(options: { force?: boolean } = {}) {
  if (overviewLoadPromise) {
    return await overviewLoadPromise
  }
  if (!options.force && connectionGroups.value.length > 0 && Date.now() - lastOverviewLoadedAt < 15000) {
    return
  }

  overviewLoadPromise = loadOverviewDataInternal(options)
  try {
    await overviewLoadPromise
  } finally {
    overviewLoadPromise = null
  }
}
```

- [ ] **Step 2: Add a forced history reload path**

Change `ensureHistoryProjectsLoaded` so manual refresh bypasses the current “already has conversations” early return:

```ts
async function ensureHistoryProjectsLoaded(
  group: ConnectionGroup,
  options: { force?: boolean } = {}
) {
  if (!options.force && group.projects.some((project) => Array.isArray(project.conversations))) {
    return
  }

  const key = group.key
  if (historyLoadPromiseMap.has(key)) {
    await historyLoadPromiseMap.get(key)
    return
  }
}
```

- [ ] **Step 3: Add one shared refresh entry point**

Implement a single helper that preserves page context and clears the refresher state in `finally`:

```ts
async function refreshConversationList(mode: "overview" | "history") {
  const refreshing = mode === "history" ? historyRefreshing : overviewRefreshing
  if (refreshing.value) return

  refreshing.value = true
  try {
    await loadOverviewData({ force: true })

    if (showHistoryPanel.value && historyGroupKey.value) {
      const currentGroup = connectionGroups.value.find((group) => group.key === historyGroupKey.value)
      if (currentGroup) {
        await ensureHistoryProjectsLoaded(currentGroup, { force: true })
      }
    }

    syncCateTabHeight()
  } catch (error) {
    const msg = toErrorMessage(error)
    uni.showToast({ title: `刷新失败: ${msg}`, icon: "none", duration: 3000 })
  } finally {
    refreshing.value = false
  }
}
```

- [ ] **Step 4: Preserve current UI state after reload**

Keep the existing branch-selection logic, but do not clear these values inside refresh flow:

```ts
searchKeyword.value
showHistoryPanel.value
historyGroupKey.value
historyGroupTitle.value
currentTab.value
```

Only fall back to overview when the active history group disappears after reload, using the page’s existing fallback branch inside `loadOverviewDataInternal`.

- [ ] **Step 5: Verify both build targets**

Run:

```bash
npm run build:h5
npx uni build -p app-plus
```

Expected: both commands finish with `DONE  Build complete.` and no new compile errors.

- [ ] **Step 6: Commit the forced refresh logic**

Run:

```bash
git add mcode-app/src/pages/conversations/index.vue
git commit -m "fix(app): force refresh conversation list data"
```

### Task 4: Manual behavior verification

**Files:**
- Verify: `mcode-app`

- [ ] **Step 1: Sanity-check whitespace and merge safety**

Run:

```bash
git diff --check
```

Expected: no trailing-whitespace or conflict-marker errors.

- [ ] **Step 2: Verify overview pull refresh manually**

Run the app from HBuilderX or the built target and confirm:

```text
1. Open 会话 page in default grouped overview mode.
2. Pull down on the group list.
3. Refresher indicator appears and then dismisses.
4. Current search keyword remains unchanged.
5. Page stays in overview mode after refresh.
```

- [ ] **Step 3: Verify history-mode pull refresh manually**

Confirm:

```text
1. Enter a connection's 历史会话 panel.
2. Switch to a non-zero tab.
3. Pull down on the right-side history list.
4. Refresher indicator appears and then dismisses.
5. Current history group and current tab remain selected.
```

- [ ] **Step 4: Verify refresh actually bypasses cache**

Confirm with logging or visible data change that a manual pull triggers a fresh data load even when performed twice within 15 seconds.

- [ ] **Step 5: Final commit if verification required fixes**

If manual verification required any follow-up adjustment, commit that delta with:

```bash
git add mcode-app/src/pages/conversations/index.vue mcode-app/src/components/ConversationHistoryCateTab.vue mcode-app/src/pages.json
git commit -m "fix(app): finalize conversation list pull refresh"
```
