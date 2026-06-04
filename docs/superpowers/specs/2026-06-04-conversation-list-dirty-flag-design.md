# Conversation List Dirty Flag Design

**Problem**

当前 `mcode-app` 会话列表页在 `onShow` 时直接强制远端刷新，虽然解决了“返回列表状态不及时”的问题，但会把所有页面返回都升级为整页刷新，带来额外请求和潜在闪动。

我们已经确认此前问题来自两点：

1. 列表页存在 `15s` 节流，正常 `onShow` 会被挡住。
2. 某些本地操作或详情页离开后，列表确实需要马上失效并重拉。

因此更合适的做法不是“每次回来都强刷”，而是“只有已知数据可能变脏时才强刷”。

**Goal**

为会话列表页增加一个轻量的脏标记机制：

- 只有会改变列表内容或状态的路径才把列表标记为 dirty
- 会话列表页 `onShow` 仅在 dirty 时强制刷新
- 非 dirty 场景继续沿用现有 `15s` 节流
- 不新增第二套列表状态源
- 不改现有实时桥接与 SQLite 摘要同步语义

**Non-Goals**

- 不做按连接粒度的局部刷新
- 不做历史面板与总览卡片的独立失效图
- 不做内存态直接回写列表数据
- 不调整 `conversationSyncService` 的事件桥接逻辑

**Options Considered**

1. **页面级布尔脏标记（采用）**
   - 提供统一模块：`markConversationListDirty()` / `consumeConversationListDirty()`
   - 详情页退出、创建成功、重命名成功、删除成功时置脏
   - 列表页 `onShow` 消费 dirty，决定是否 `force` 刷新
   - 优点：改动最小，语义清晰，能恢复节流收益

2. **按连接粒度脏标记**
   - 记录受影响的 `connectionKey`
   - 列表页只定向刷新受影响连接组
   - 优点：请求更省
   - 缺点：需要改造 `loadOverviewData` / `replaceConnectionGroup` / 历史面板同步，复杂度偏高

3. **内存列表即时回写 + dirty 兜底**
   - 本地操作成功后直接修改 `connectionGroups/projects`
   - `onShow` 仅兜底校准
   - 优点：即时反馈最好
   - 缺点：会引入另一套局部更新路径，容易再次出现状态分叉

**Chosen Design**

采用页面级布尔脏标记。

新增一个极小的共享模块，职责仅限于管理“会话列表是否需要强制刷新”。该模块不保存列表数据，也不参与任何渲染，只负责在跨页面跳转时传递失效信号。

建议接口：

- `markConversationListDirty(reason?: string)`
- `consumeConversationListDirty(): boolean`
- 可选：`peekConversationListDirty(): boolean`

实现可以是模块级变量，不需要 Pinia store，因为：

- 状态非常小，仅供页面生命周期判断
- 不需要响应式订阅
- 不需要持久化到 storage
- 页面切换期间模块实例可复用，足够满足当前需求

**Dirty Triggers**

以下路径在成功后必须置脏：

1. **会话详情页离开**
   - `onHide`
   - `onUnload`
   - 原因：详情页可能发生了消息发送、状态推进、turn 完成、标题/摘要变化，列表需要在回到页时重新校准

2. **创建会话成功后**
   - 新会话会改变总览卡片、历史列表或两者

3. **重命名会话成功后**
   - 列表标题直接失效

4. **删除会话成功后**
   - 列表项直接失效

本次不把纯浏览行为、仅进入详情页、不发生任何修改的中间态单独区分；详情页离开统一视为可能脏。这是刻意保守的选择，优先保证正确性，同时把“每次 `onShow` 都强刷”收敛为“仅详情页往返才强刷”。

**List Page Behavior**

`mcode-app/src/pages/conversations/index.vue` 的 `onShow` 改为：

1. 调用 `consumeConversationListDirty()`
2. 若返回 `true`：执行 `loadOverviewData({ force: true })`
3. 若返回 `false`：执行 `loadOverviewData()`，允许继续命中 `15s` 节流

这样有两个直接效果：

- 从其他无关页面返回会话页，不再总是强刷
- 从详情页或本地 mutation 成功路径返回时，仍然立即拿到新数据

**Interaction With Existing Refresh Paths**

以下行为保持不变：

- 下拉刷新仍然始终 `force: true`
- 用户主动进行创建/重命名/删除后的当前页内 reload 仍可直接 `force: true`
- `overviewLoadPromise` 仍然作为并发去重机制保留

也就是说，dirty flag 只影响“页面展示时是否需要跳过节流”，不替代已有显式刷新入口。

**Data Flow**

1. 某个操作成功（创建 / 重命名 / 删除 / 详情页离开）
2. 调用 `markConversationListDirty()`
3. 用户回到会话列表页
4. `onShow` 调用 `consumeConversationListDirty()`
5. 若 dirty：列表页强制刷新并清空 dirty
6. 若不 dirty：列表页按现有节流策略刷新或跳过

**Files**

- New: `mcode-app/src/services/conversation/conversationListRefresh.ts`
- Modify: `mcode-app/src/pages/conversations/index.vue`
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`

**Proposed Module Shape**

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
```

本次先不记录 `reason` 或 `timestamp` 到对外接口，避免过度设计；如需调试可后续扩展。

**Error Handling**

- dirty flag 模块本身不抛错
- 即使 dirty 已消费但刷新失败，也沿用现有 toast 与 `loadOverviewData` 错误处理
- 如果刷新失败，下一次是否再次刷新仍由后续操作重新置脏决定；本次不做“失败后自动重新置脏”机制，避免隐藏循环刷新问题

**Testing Strategy**

手动验证为主：

1. 打开会话列表页，等待首次加载完成。
2. 在 15 秒内切到其他非详情页再返回。
   - 预期：不强制远端刷新，列表无明显额外闪动。
3. 从会话列表打开详情页，再立即返回。
   - 预期：即使在 15 秒内，也会触发一次强制刷新。
4. 创建会话成功后返回列表。
   - 预期：新会话立即出现。
5. 重命名会话成功后停留或返回列表。
   - 预期：标题立即更新。
6. 删除会话成功后刷新列表。
   - 预期：被删除项消失。

**Acceptance Criteria**

- 会话列表页 `onShow` 不再无条件强制刷新
- 从详情页返回列表时，仍能绕过 `15s` 节流拿到新状态
- 创建、重命名、删除成功后，列表仍然会及时更新
- 不新增响应式 store 或持久化 storage 作为本次 dirty flag 载体
- 不改变现有下拉刷新、并发去重和错误提示行为
