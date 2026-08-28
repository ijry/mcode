# 重试目标消息定位与主题表面收口

## 背景

三个缺陷同源于「数据层时间戳缺失」与「样式层挂载点错位」：

1. 报错后重试，界面回显的是旧用户消息（如「继续」）而非最新的「要」。
2. 思考胶囊展开后仍保持药丸形，宽度与圆角不匹配内容。
3. sweet / summer / matrix 主题下，子智能体胶囊、Markdown 表格、计划抽屉未跟随主题配色。

## 架构变更

### 时间戳解析收口

新增纯函数 `parseTurnTimestamp(...values)`，位于
`src/services/conversation/conversationTurnIdentity.ts`，按顺序取第一个有效值，
支持 `number`、numeric string、ISO string，`<= 0` 视为无效，返回 `number | null`。

调用方全部改为经由该函数：

| 位置 | 原实现 | 现实现 |
| --- | --- | --- |
| `pages/conversation-detail/detailDataNormalization.ts` | 仅读 `raw.timestamp` | `parseTurnTimestamp(raw.timestamp, raw.createdAt, raw.created_at) ?? Date.now()` |
| `api/acp.ts` `user_message` 归一化 | 不产出 timestamp | 补 `timestamp`，无值时 `undefined` |
| `stores/conversationRuntime.ts` `applyRealtimeUserMessage` | 本地 `parseTimestamp()` | `parseTurnTimestamp(...) ?? Date.now()` |
| `stores/conversationRuntime.ts` `mapSnapshotLiveMessage` | 本地 `parseTimestamp()` | `parseTurnTimestamp(rawLiveMessage?.started_at) ?? Date.now()` |

`hydrateLiveSnapshot` 的 `pending_user_message` 现在透传
`timestamp` / `createdAt` / `created_at` 三种拼写，后端任一写法都能落地。
本地 `parseTimestamp()` 已删除，避免两套语义并存。

### 重试目标定位

新增 `findLatestUserMessage(messages)`（`detailMessagePresentation.ts`）：
先按 timestamp 取最大，timestamp 相等时取数组中靠后者（位置稳定 tie-break）。

`ConversationDetailInteractivePane.vue` 的 `regenerateLastMessage()` 原来用
`[...messages.value].reverse().find(...)`，隐含假设「数组末尾即最新」。
该假设在 `mergeTailIntoTurnsWithSeam()` 把尾窗历史与实时轮次拼接后不成立：
`buildConversationTimeline()` 输出 `[...completed, ...streaming]`，
seam 逻辑可能把尾窗消息排在当前轮之后，末尾用户消息因此是旧消息。

注意：**不要**把 `buildConversationTimeline()` 改成全局按 timestamp 排序，
那会破坏 assistant 分段、system 消息与 live 消息的既有顺序语义。
修复只针对「找最新用户消息」这一个查询，不动时间线本身。

## 协议 / 数据流影响

`user_message` 实时事件现在携带 timestamp。三种拼写（`timestamp`、
`createdAt`、`created_at`）与两种类型（epoch 毫秒数值、ISO 字符串）都被接受，
缺失时回退 `Date.now()`。这同时修正了 `reduceTurnTimestamp`（把 `<= 0` 视为无效）
在 seam 判定时因时间戳为 0 而误排序的问题。

服务端无需变更；这是纯客户端的宽松解析。

## UI 行为

### 思考胶囊两态形制

`MessageBubble.vue` 模板对未折叠节点追加 `part-thinking--expanded`：

- `.part-thinking`（基础）保留 `border-radius: 999rpx`
- `.part-thinking--collapsed`：`width: fit-content` + `999rpx`，药丸形
- `.part-thinking--expanded`：`width: 100%`、`box-sizing: border-box`、
  `border-radius: 12rpx`、`padding: 16rpx 20rpx`，卡片形

主题规则只改配色、不设 `border-radius`，因此不会覆盖展开态圆角。

### Markdown 表格

up-markdown 经由 `up-parse` 渲染，DOM 因平台而异：H5 是真实
`table/thead/tbody/tr/th/td`，uni 原生端是 class 为 `._table` / `._thead` /
`._tbody` / `._tr` / `._th` / `._td` 的 `view`。因此 `.part-text` 下的表格规则
**两套选择器都写**，包含边框、内距与偶数行斑马纹，全部基于 `--up-*` 变量。

### 主题挂载点

气泡主题类有两套前缀：matrix 额外挂 `bubble-wrap--cyber`，sweet / summer 走
`bubble-wrap--theme-<name>`。三组分别补齐：

- 背景组：`.subagent__summary` / `.subagent__body` / `.subagent__error`
- 文字组：`.subagent__title` / `status` / `duration` / `label` / `prompt` /
  `transcript` / `tool-name` / `tool-preview` / `truncated` / `meta`
- 表格：`table` / `thead` / `tbody` / `tr` / `th` / `td` 及各自 `._*` 变体

计划抽屉是 popup，会被 teleport 到父级之外，父级 scoped 选择器失效。
所以主题类挂在**抽屉根节点**上：
`:class="['plan-drawer', detailTheme && `plan-drawer--theme-${detailTheme}`]"`，
在 `index.vue` 与 `ConversationDetailInteractivePane.vue` 两处一致。
`index.scss` 末尾新增 `:deep(.plan-drawer--theme-matrix|sweet|summer)` 及其
`__hd` / `__title` / `__count` / `.plan-filter` / `.plan-filter--active` /
`.plan-filter__count` / `.plan-task` / `.plan-task__subject` / `.plan-task__desc` /
`.plan-task__badge` / `.plan-task__dot--*`，配色取
`--up-page-bg-color` / `--up-card-bg-color` / `--up-main-color` / `--up-primary` /
`--up-success` / `--up-error` 并用 `color-mix` 派生层级。

## 兼容性

- 无新增 `--mcode-*` 别名，全部走 uview 运行时主题变量。
- 时间戳解析向下兼容：旧后端不返回 timestamp 时行为与修复前一致（`Date.now()`）。
- 表格样式双选择器策略对 H5 与原生端同时生效，无平台分支代码。

## 原生 iOS / Android 复刻指引

1. **时间戳**：实现一个宽松解析器，输入候选值列表，依次尝试 epoch 毫秒整数、
   可解析为整数的字符串、ISO-8601 字符串；`<= 0` 视为缺失。turn 归一化与实时
   `user_message` 事件都走它，缺失时用当前时间兜底。
2. **重试目标**：不要取消息列表最后一个用户消息。按 timestamp 取最大值，
   相等时取列表中索引更大者。原因是历史尾窗与实时轮次合并后列表顺序不代表时间顺序。
3. **思考胶囊**：折叠态用内容自适应宽度 + 全圆角（半径 ≥ 高度一半）；
   展开态用满宽 + 小圆角（约 6pt / 12rpx）+ 内距。两态是不同形制，
   不是同一视图的高度动画。
4. **表格**：从 Markdown AST 直接构建原生表格视图，不要依赖 HTML class 名。
   边框、内距、偶数行背景取自主题表。
5. **主题**：把主题标识挂在每个弹层/抽屉的根视图上，而不是依赖父视图层级传递，
   因为模态在原生端同样脱离父视图树。子智能体胶囊的背景色与文字色需分组管理
   （容器背景、错误背景、标题/状态/时长/标签/预览等文字层级）。
