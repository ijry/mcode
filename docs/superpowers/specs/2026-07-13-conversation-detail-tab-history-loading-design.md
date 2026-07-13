# Conversation Detail Tab History Loading Design

**Date:** 2026-07-13  
**Scope:** `mcode-app` 会话详情页多 tab 历史加载状态  
**Primary Files:** `mcode-app/src/pages/conversation-detail/index.vue`, `mcode-app/src/pages/conversation-detail/ConversationDetailInteractivePane.vue`

---

## 背景

会话详情页当前实际渲染路径是 `ConversationDetailInteractivePane`。父页面仍保留一套旧的 `ConversationDetailBody` 模板，但该模板处于禁用分支，不应作为本次改动目标。

当前首屏会优先显示最近一轮或已预热的消息，但完整历史仍可能在后台补齐。用户希望最近一轮可以先显示，同时顶部明确提示“初始历史加载中”，避免误以为旧消息丢失。多 tab 场景下，每个 tab 的历史加载状态必须互相独立。

---

## 目标

- 初始进入 tab 时，允许最后一轮或已有消息先显示。
- 在该 tab 的初始历史补齐完成前，在消息列表顶部显示加载提示。
- 每个 tab 独立维护自己的初始历史加载状态，一个 tab 的加载、完成或失败不能影响其他 tab。
- 保持现有手动上拉加载历史状态可见，并避免与初始加载提示冲突。

---

## 非目标

- 不改会话详情页整体布局、主题样式或 tab 结构。
- 不启用或修复父页面中已禁用的旧 `ConversationDetailBody` 分支。
- 不调整消息协议、后端接口或本地存储结构。
- 不隐藏最后一轮消息等待完整历史加载。

---

## 方案对比

### 方案 A：父页面统一维护历史加载状态

**做法**
- 在 `index.vue` 中维护一个全局 `initialHistoryLoading`。
- 传给当前激活的交互面板展示。

**问题**
- 多 tab 会互相覆盖状态。
- 非激活 tab 的加载完成可能清掉当前 tab 的提示。

### 方案 B：每个 `ConversationDetailInteractivePane` 自己维护状态（采用）

**做法**
- 在交互面板实例内维护初始历史加载状态。
- 以 `conversationId`/实例 token 作为异步防串扰边界。
- 顶部状态文案由该面板自己的 `loadingOlder` 与初始加载状态共同计算。

**优点**
- 与当前每个 tab 渲染一个面板实例的结构一致。
- 状态天然按 tab 隔离，切换 tab 不需要父页面协调。
- 改动范围小，风险集中。

### 方案 C：新增全局 tab 状态仓库

**做法**
- 建立以 tab key 为索引的历史加载状态 map。
- 父子组件通过 props/events 同步。

**问题**
- 对当前需求过重。
- 需要额外处理 tab 生命周期和状态清理，增加出错面。

---

## 决策

采用 **方案 B**。

`ConversationDetailInteractivePane` 是实际消息列表渲染单元，也对应单个 tab 的运行上下文。初始历史加载状态放在该组件内部，可以保证每个 tab 独立，同时复用已有异步 token 防止旧请求写回新会话。

---

## 详细设计

### 1. 初始历史加载状态

交互面板内新增独立状态表示该 tab 是否仍在进行首轮历史补齐。该状态只归当前组件实例所有，不放到父页面全局 ref。

状态开启条件：

- 当前 tab 启动或切换到新的 `conversationId` 后开始同步历史游标或加载初始历史。
- 已经有最近消息可以渲染时，仍允许该状态保持开启。

状态关闭条件：

- 初始历史同步完成。
- 确认没有更多历史。
- 加载失败并进入错误/兜底状态。
- 组件对应的 `conversationId` 已变化，旧异步结果被 token 判定为过期。

### 2. 顶部提示展示

`historyStatusText` 保持作为顶部状态的单一出口：

- 手动上拉加载历史时，继续显示“历史加载中...”。
- 首次历史补齐时，显示“初始历史加载中...”。
- 没有更多历史时，继续显示现有结束文案。

如果手动加载与初始加载状态同时存在，优先显示手动加载文案，因为用户刚触发的操作反馈优先级更高。

### 3. Per-tab 隔离

每个 `ConversationDetailInteractivePane` 实例独立保存：

- 初始历史加载标记。
- 历史游标同步 token。
- 手动加载中的状态。

父页面不新增全局 loading ref，也不复用旧分支的 `loadingOlder`。这样 tab A 的历史完成不会影响 tab B，tab B 的失败也不会清理 tab A 的提示。

### 4. 异步防串扰

沿用现有 `historySyncToken` 模式：

- 每次 `conversationId` 变化递增 token。
- 异步完成后先校验 token 和当前 `conversationId`。
- 只有仍属于当前实例和当前会话的结果才允许更新加载状态。

---

## 验证

- 打开一个会话 tab：最近一轮可见，顶部显示“初始历史加载中...”，补齐后提示消失或变为现有结束文案。
- 同时打开两个 tab：一个 tab 的历史加载完成不影响另一个 tab 的提示。
- 在初始加载期间手动上拉：优先显示“历史加载中...”，完成后回到初始加载状态或结束状态。
- 切换 tab 或关闭 tab 后，旧异步请求不能写回新 tab 的状态。

