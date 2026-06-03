# Conversation List Pull Refresh Design

**Problem**

`mcode-app` 的会话列表页虽然注册了页面级 `onPullDownRefresh`，但用户实际浏览的是内部 `scroll-view`：

- 总览模式滚动容器是 `group-scroll`
- 历史模式滚动容器在 `up-cate-tab` 的右侧 `scroll-view`

因此原生页面下拉手势不会真正落到当前可滚动内容上，用户无法通过手势触发刷新。

**Goal**

让会话列表页在以下两种模式下都支持手势下拉刷新：

- 默认连接分组总览
- 历史模式

刷新后保持当前页面上下文不变：

- 保留搜索关键词
- 保留当前是否处于历史模式
- 保留当前历史分组
- 保留当前 tab
- 不主动重置到总览页

**Approach**

1. 给总览模式的 `group-scroll` 启用 `scroll-view` 级 `refresher`。
2. 历史模式不再依赖页面级下拉，而是给实际承载右侧内容的滚动容器启用 `refresher`。
3. 新增统一的 `refreshConversationList()` 刷新入口，显式绕过当前的本地缓存节流与“已加载历史”短路逻辑。
4. 刷新只更新数据，不改动当前 UI 选择状态。

**History Mode Structure**

历史模式当前使用 `uview-plus` 的 `up-cate-tab`，其右侧内容本身就是内部 `scroll-view`。该组件没有暴露 `refresher` 透传能力，因此实现时不应直接改 `node_modules`。

采用本地可控副本/包装组件：

- 基于当前 `up-cate-tab` 行为复制一个本地组件
- 保持现有 `tabItem` / `rightTop` / `itemList` slot 结构不变
- 只为右侧内容 `scroll-view` 增加：
  - `refresher-enabled`
  - `refresher-triggered`
  - `@refresherrefresh`

这样可以最小化页面层改动，同时避免对第三方依赖做脆弱修改。

**Refresh Flow**

新增统一刷新流程：

1. 用户在总览或历史模式下拉。
2. 页面设置对应刷新态。
3. 调用 `loadOverviewData({ force: true })`，绕过当前 15 秒 overview 缓存。
4. 若当前处于历史模式，继续对当前分组执行 `ensureHistoryProjectsLoaded(group, { force: true })`，绕过“已有 conversations 就直接 return”的短路。
5. 完成后关闭刷新态。

`force` 刷新必须做到：

- 不复用过期的 `lastOverviewLoadedAt` 判断
- 不因为 `group.projects.some(project.conversations)` 已存在而跳过历史刷新
- 若已有进行中的刷新任务，则仍复用该任务，避免并发重复请求

**State Preservation**

刷新过程中保持以下状态不变：

- `searchKeyword`
- `showHistoryPanel`
- `historyGroupKey`
- `historyGroupTitle`
- `currentTab`

刷新完成后的分组定位规则：

- 若当前历史分组仍存在，继续停留在该分组
- 若当前历史分组不存在，回退到现有代码已经使用的总览兜底行为

**Error Handling**

- 刷新失败时沿用当前 toast / warning 输出
- 无论成功失败都必须清理 `refresher-triggered`
- 刷新中的状态不得卡死
- 历史模式刷新失败时，不清空当前已展示数据

**Files**

- `mcode-app/src/pages/conversations/index.vue`
- 新增本地分类组件，替代直接依赖第三方 `up-cate-tab`
- 如有必要，补充 `mcode-app/src/pages.json` 注释性调整，但不依赖页面级下拉

**Acceptance Criteria**

- 在总览模式，用户下拉 `group-scroll` 可触发刷新。
- 在历史模式，用户下拉右侧会话列表可触发刷新。
- 刷新后保留搜索词、当前历史分组和当前 tab。
- 手动下拉会绕过 15 秒 overview 缓存。
- 手动下拉会重新拉取当前历史分组的数据，而不是被“已加载过”短路。
- 刷新失败后页面仍可继续操作，且不会卡住刷新指示器。
