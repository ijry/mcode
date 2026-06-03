# Conversation Overview Native Pull Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the conversation overview list use uni-app native page pull-to-refresh without changing history-mode behavior.

**Architecture:** Remove the overview mode’s internal `scroll-view` so the page itself owns scrolling in overview mode. Keep history mode on the existing `up-cate-tab` internal scroll path, and reuse the existing `onPullDownRefresh -> loadOverviewData()` flow.

**Tech Stack:** Vue 3, uni-app, TypeScript, uview-plus

---

**Repository reality:** `mcode-app` 没有现成的前端自动化测试。本次验证以构建通过和手工检查为主。

### Task 1: Let overview mode scroll at page level

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`
- Reference: `mcode-app/src/pages.json`

- [ ] **Step 1: Replace the overview scroll container**

把总览模式的内部 `scroll-view` 改成普通容器，去掉 `scroll-y`、`enhanced`、`show-scrollbar` 这些内部滚动属性。

Use this template shape:

```vue
<view v-if="!showHistoryPanel" class="group-panel">
  <view v-if="loading && filteredConnectionGroups.length === 0" class="inline-loading">
    <up-loading-icon color="#2979ff" size="28"></up-loading-icon>
    <text class="inline-loading__text">加载中...</text>
  </view>
  <view v-if="!loading && filteredConnectionGroups.length === 0" class="empty-fullpage">
    <up-empty mode="list" text="暂无分组会话"></up-empty>
  </view>

  <view v-else class="group-list">
    <!-- keep existing grouped cards unchanged -->
  </view>
</view>
```

- [ ] **Step 2: Split overview and history layout modes**

给主容器加动态 class，让总览模式允许页面自然撑开，历史模式继续保持当前固定高度布局。

Use this wrapper shape:

```vue
<view
  v-else
  :class="[
    'main-wrap',
    showHistoryPanel ? 'main-wrap--history' : 'main-wrap--overview',
  ]"
>
```

Use these style adjustments:

```scss
.main-wrap--overview {
  display: block;
}

.main-wrap--history {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.group-panel {
  display: block;
}
```

Keep `.cate-wrap` and `.cate-wrap__inner` behavior unchanged so history mode still uses the existing internal scroll structure.

- [ ] **Step 3: Guard pull refresh to overview mode only**

保留原生页面下拉刷新，但在历史模式直接结束，避免误刷新历史面板。

Use this handler shape:

```ts
onPullDownRefresh(() => {
  if (showHistoryPanel.value) {
    uni.stopPullDownRefresh()
    return
  }

  loadOverviewData().finally(() => {
    uni.stopPullDownRefresh()
    syncCateTabHeight()
  })
})
```

- [ ] **Step 4: Confirm page config stays native**

确认 `mcode-app/src/pages.json` 里的会话页仍然保持：

```json
{
  "path": "pages/conversations/index",
  "style": {
    "navigationBarTitleText": "会话",
    "enablePullDownRefresh": true
  }
}
```

本步不需要新增 `refresher` 配置，也不需要修改历史页组件。

- [ ] **Step 5: Build the H5 target**

Run:

```bash
npm run build:h5
```

Expected: `DONE  Build complete.` and no new Vue / TypeScript compile errors.

- [ ] **Step 6: Commit the page-scroll change**

Run:

```bash
git add mcode-app/src/pages/conversations/index.vue docs/superpowers/specs/2026-06-04-conversation-list-pull-refresh-design.md docs/superpowers/plans/2026-06-04-conversation-list-pull-refresh.md
git commit -m "feat(app): use native pull refresh for overview list"
```

### Task 2: Verify app-plus behavior manually

**Files:**
- Verify: `mcode-app`

- [ ] **Step 1: Build the app-plus target**

Run:

```bash
npx uni build -p app-plus
```

Expected: build completes without new compile errors.

- [ ] **Step 2: Verify overview native pull refresh**

Check this behavior manually:

```text
1. Open the 会话 page in overview mode.
2. Pull down from the top of the page.
3. Native page refresh starts.
4. Refresh completes and grouped cards stay visible.
5. Current search keyword remains unchanged.
```

- [ ] **Step 3: Verify history mode stays unchanged**

Check this behavior manually:

```text
1. Enter 历史会话 from any connection group.
2. Switch tabs inside the history panel.
3. Scroll and interact normally.
4. No new custom refresher UI appears.
5. Existing history interaction remains unchanged.
```

- [ ] **Step 4: Sanity-check whitespace**

Run:

```bash
git diff --check
```

Expected: no trailing-whitespace or conflict-marker errors.
