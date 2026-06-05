# 会话总览卡片运行时状态叠加设计

## 背景

当前 `mcode-app` 会话页默认总览模式使用 `connectionGroups` 作为卡片数据源。该数据在 `loadOverviewData()` 与 `refreshConnectionGroupFromRemote()` 时生成，随后保存在页面内存中。

这条链路有两个特点：

1. 总览卡片状态来自快照值 `card.status`
2. 运行中的 realtime 状态变化只进入 `conversationRuntime` 与本地 summary 持久化，不会直接回写当前页面内存中的 `connectionGroups`

因此在用户停留在默认总览页时，某个会话即使已经进入 `thinking`、`running_tool` 或 `waiting_permission`，列表卡片也可能仍显示旧状态，直到页面重新加载或远端刷新完成。

## 目标

只让默认总览模式中的会话卡片在页面停留期间也能立即反映运行时状态变化。

本次目标限定为：

- 仅覆盖默认总览卡片状态展示
- 不修改历史模式的数据流
- 不新增列表页自己的 realtime 订阅
- 不改变 `connectionGroups` 的基础快照加载机制

## 非目标

本次不处理以下内容：

- 历史模式会话列表的实时联动
- 新增轮询或整页强制刷新策略
- 修改 `conversationRuntime` 的事件订阅结构
- 修改会话 summary 的持久化语义

## 根因

默认总览卡片的状态是一次性快照值，而不是响应式派生值。

当前链路如下：

1. 页面通过 `loadOverviewData()` 生成 `connectionGroups`
2. `connectionGroups.cards[].status` 被写入页面本地数组
3. 后续 realtime 事件更新 `conversationRuntime.sessions`
4. 模板仍然只读取 `card.status`

也就是说，列表页没有消费运行时 store 的状态，因此停留当前页时不会自动重算卡片展示状态。

## 方案概述

保留 `connectionGroups` 作为总览页基础数据源，但在渲染默认总览卡片前增加一层“运行时状态展示覆盖”。

具体做法：

1. `connectionGroups` 继续只保存远端快照与本地 summary 组合后的基础卡片数据
2. 页面新增一个总览卡片展示态计算层，按 `conversationId` 读取 `conversationRuntime.sessions`
3. 若存在活跃运行时 session，则优先使用运行时状态映射后的展示值
4. 若不存在运行时 session，或运行时 session 已回到 `idle`，则回落到原始 `card.status`

这样可以让总览卡片在不刷新整页的情况下立即显示“远程运行中”，同时避免把页面临时展示态写回基础快照结构。

## 状态优先级

总览卡片展示状态按以下优先级决策：

1. `waiting_permission`、`thinking`、`running_tool`、`connecting`、`connected` 映射为总览状态 `in_progress`
2. `error` 映射为总览状态 `failed`
3. `idle` 不直接显示为卡片状态，而是回落到原始 `card.status`
4. 运行时 session 不存在时，直接使用原始 `card.status`

这样定义有两个目的：

- 将“当前仍在活跃执行链路中”的运行时状态统一折叠为列表可理解的 `in_progress`
- 避免会话结束后被本地 `idle` 错误覆盖成“空闲”，最终终态仍由 summary 或远端刷新结果决定

## 数据流设计

### 基础数据

以下逻辑保持不变：

- `loadOverviewData()`
- `loadConnectionGroup()`
- `refreshConnectionGroupFromRemote()`
- `replaceConnectionGroup()`
- `toConnectionGroup()`

这些函数仍然负责生成和替换 `connectionGroups`，但不感知运行时展示覆盖。

### 展示态叠加

页面新增一个只用于渲染的 helper，例如：

```ts
function resolveOverviewCardStatus(card: LiveSessionCard): string
```

职责：

1. 读取 `card.conversationId`
2. 从 `runtime.sessions` 中查找对应 session
3. 将运行时状态映射为总览展示状态
4. 必要时回落到 `card.status`

同时为默认总览卡片构造展示用数据，例如：

```ts
interface DisplayLiveSessionCard extends LiveSessionCard {
  displayStatus: string
}
```

`filteredConnectionGroups` 不再直接返回原始 `group.cards`，而是在过滤前或过滤时补充 `displayStatus`。

模板中的状态渲染统一切换为：

- `statusLabel(card.displayStatus)`
- `statusClass(card.displayStatus)`

## 范围限制

该叠加逻辑只作用于默认总览卡片。

明确不改动以下历史模式路径：

- `projects`
- `tabList`
- `getConversationList()`
- 历史会话卡片模板

这样可以保证本次修复只解决“默认总览卡片运行中状态不更新”的问题，不扩大到历史模式数据结构和行为。

## 回落语义

当运行时 session 从活跃态回到 `idle` 后，卡片展示状态立即回落到基础快照里的 `card.status`。

这里不把 `idle` 映射成“空闲”的原因是：

- `idle` 只是本地运行时结束，不代表 summary 已写入终态
- 真实终态可能稍后由 summary 持久化或远端刷新补齐为 `pending_review`、`completed` 或 `failed`

因此 `idle` 只代表“不再覆盖”，而不是“新的列表终态”。

## 边界条件

- `card.conversationId` 为空时不覆盖
- `runtime.sessions` 中存在残留 session，但其状态为 `idle` 时不覆盖
- `error` 可以覆盖原始状态，因为异常信号优先级更高
- 不新增 watcher 去修改 `connectionGroups`
- 只依赖 Vue 对 `runtime.sessions` 的响应式读取触发计算属性重算

## 备选方案与取舍

### 方案 A：整页强制刷新

做法：

- 在 `onShow`、操作回调或定时器中更频繁地调用 `loadOverviewData({ force: true })`

问题：

- 不能解决“停留当前页时立即联动”的核心问题
- 请求更重
- 容易带来闪动

### 方案 B：默认总览卡片叠加运行时状态

做法：

- 基于现有 `conversationRuntime.sessions` 做页面级展示态派生

优点：

- 改动集中
- 不重复订阅
- 不破坏现有 summary 和远端刷新链路

这是本次推荐方案。

### 方案 C：列表页单独为卡片建立 realtime 订阅

做法：

- 默认总览页为每个打开会话单独挂订阅，并直接改写卡片状态

问题：

- 与详情页/运行时 store 重复维护同一份实时状态
- 状态源变多，后续更难排查覆盖关系

因此不采用。

## 实施位置

本次实现预计仅修改：

- `mcode-app/src/pages/conversations/index.vue`

不预期修改：

- `conversationRuntime.ts`
- `conversationSyncService.ts`
- `conversationRepository.ts`

## 验证方式

1. 停留在默认总览页，不进入详情页
2. 触发一个已有会话开始执行任务
3. 对应卡片应立即显示“远程运行中”
4. 工具调用阶段和等待权限阶段仍保持“远程运行中”
5. 会话结束后，卡片不显示“空闲”，而是回落到基础快照状态
6. 随后由 summary 或远端刷新把状态补齐为最终结果
7. 历史模式列表行为保持不变

## 风险与控制

风险主要在于页面中把“基础数据”和“展示覆盖数据”混在一起，导致后续远端刷新覆盖逻辑变复杂。

控制方式：

- 不改写 `connectionGroups`
- 只在计算属性或渲染 helper 中叠加 `displayStatus`
- 让运行时覆盖逻辑保持只读、可回退

## 结论

本次应采用“默认总览卡片叠加运行时状态”的轻量方案。

它直接修复当前默认总览页停留时状态不更新的问题，同时保持现有 realtime、summary 持久化和远端刷新链路不变，范围清晰，回退简单。
