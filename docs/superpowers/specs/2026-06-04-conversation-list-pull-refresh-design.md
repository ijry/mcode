# Conversation Overview Native Pull Refresh Design

**Problem**

`mcode-app` 的会话页已经开启了页面级 `enablePullDownRefresh` 并注册了 `onPullDownRefresh`，但总览模式的实际滚动发生在内部 `scroll-view.group-scroll` 上，导致 uni-app 原生页面下拉手势落不到页面本身。

历史模式的内容滚动仍然由 `up-cate-tab` 内部容器负责。当前需求不改这部分行为。

**Goal**

只让会话列表页的“连接分组总览”模式支持 uni-app 原生页面下拉刷新：

- 进入会话页默认总览时，可以直接下拉触发页面刷新
- 保留当前搜索关键词
- 继续使用现有 `onPullDownRefresh -> loadOverviewData()` 流程
- 历史模式保持现状，不新增自定义 refresher，不改 `up-cate-tab`

**Options Considered**

1. **页面接管总览滚动（采用）**
   - 去掉总览模式内部 `scroll-view`
   - 让总览内容跟随页面本身滚动
   - 保留 `pages.json` 里的 `enablePullDownRefresh: true`
   - 优点：改动最小，完全符合“只用 uni-app 原生页面刷新”的范围

2. **给总览 `scroll-view` 增加 `refresher`**
   - 可以工作，但这不是页面原生下拉刷新
   - 与已确认方案不符

3. **历史模式也一起接入刷新**
   - 需要处理 `up-cate-tab` 的内部滚动容器
   - 超出这次范围

**Chosen Design**

在 `mcode-app/src/pages/conversations/index.vue` 中做两件事：

1. 把总览模式的 `scroll-view.group-scroll` 改成普通 `view`
2. 把页面主容器布局拆成：
   - **总览模式**：允许页面自然增高，由页面自身滚动
   - **历史模式**：继续保持当前 `flex + overflow: hidden` 布局，交给 `up-cate-tab` 内部滚动

这样总览模式会把下拉手势交还给 uni-app 页面层，现有 `onPullDownRefresh` 无需重写数据流。

**Refresh Flow**

1. 用户位于总览模式。
2. 页面下拉触发 `onPullDownRefresh`。
3. 继续调用现有 `loadOverviewData()`。
4. 完成后调用 `uni.stopPullDownRefresh()` 并维持现有高度同步逻辑。

如果用户当前在历史模式，即使页面级刷新被意外触发，也立即结束，不介入历史模式数据流。

**State Preservation**

本次实现不新增任何刷新态状态机，也不重置现有页面状态：

- `searchKeyword`
- `showHistoryPanel`
- `historyGroupKey`
- `historyGroupTitle`
- `currentTab`

其中历史模式的这些状态本次不做刷新增强，只要求“不被总览刷新改坏”。

**Files**

- `mcode-app/src/pages/conversations/index.vue`
- `mcode-app/src/pages.json`（保持 `enablePullDownRefresh: true`，无需新配置）

**Acceptance Criteria**

- 总览模式下拉时，可触发 uni-app 原生页面刷新
- 搜索关键词在刷新后保持不变
- 历史模式界面与当前行为一致
- 不新增自定义 refresher UI
- 不修改 `up-cate-tab` 或其替代实现
