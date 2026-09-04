# 会话详情状态胶囊显示本回合已运行时间

需求：「能在更合适的位置比如状态胶囊显示 `30m` / `1h1m` 这样的已运行时间吗，PC 端就有
显示但是 mcode-app 没有。」

PC 端那处是 `codeg-plus/src/components/message/live-turn-stats.tsx` 的 `LiveTurnStats` ——
输入框上方一条 `|` 分隔的横向元信息带（agent 图标 │ Thinking │ ⏱ 1m 30s │ 3F +20/-5 │
12 tok/s），计时文案来自 `codeg-plus/src/lib/format-elapsed.ts` 的 `formatElapsedLabel`。
那条带子在手机上放不下，所以移动端落在**同一位置的紧凑替代物**上：输入框上方的状态胶囊。

## Scope

只做「本回合已运行多久」。不搬 PC 那条带子的其余字段（改动文件数 / 增删行 / tok/s），
也不碰已完成轮次的耗时展示。

## 架构与数据流

```
session.liveMessage.timestamp ──> pane: runElapsedStartedAt ─┐
session.status ──> pane: runtimeStatus ──> showRunElapsed ────┴─> <ConversationDetailRunElapsed>
                                                                   └─ 自持 1s setInterval
```

### 回合起点取哪个字段

`session.liveMessage.timestamp`（epoch ms），**不新增字段**。它已经是这条实时轮次的时间戳，
两条来源都已存在于 `stores/conversationRuntime.ts`：

| 场景 | 赋值点 | 值 |
| --- | --- | --- |
| 本端发起 | `beginPlaceholderThinking` → `createLiveMessage` | `Date.now()`（手机时钟） |
| 中途接入正在跑的会话 | `mapSnapshotLiveMessage` | `parseTurnTimestamp(live_message.started_at)`（主机时钟） |

回合内的 delta 不会重置它：`appendLiveContent` 与 `clearPlaceholderLiveMessage` 都是
`{ ...currentLiveMessage }` 展开，`timestamp` 原样带过去。回合结束
（`clearLiveMessage`）整条置 null，于是下一回合自然重新计时 —— **计时粒度是回合，不是会话**，
与 PC 端 `LiveMessage.startedAt` 完全对齐。

这也是刻意不另存 `turnStartedAt` 的理由：多一个字段就多一份可能与 `liveMessage` 打架的起点，
而中途接入那条路上只有快照里的 `started_at` 说得出真话。

### 可见性

`shouldShowRunElapsed(runtimeStatus, startedAt)`（`detailStatusPresentation.ts`）：

- 状态 ∈ `thinking | running_tool | waiting_permission | waiting_question`
- 且 `startedAt > 0`

**等待授权 / 等待提问期间继续计时**，与 PC 端一致 —— 那边计时器挂在
`connStatus === "prompting"` 上，而它的 `prompting` 并不因为挂起授权而改变
（`pending_permission` 是另一个字段）。手机端把那一个状态拆成了四个值，所以要逐个列出。
这个选择本身也是有用的：卡在授权上时，用户最想知道的正是「它停在这儿多久了」。

`startedAt` 缺失（中途接入且快照里没有 `live_message`）时**不显示**，而不是从 attach 那一刻
重新计时 —— 后者会把一个已经跑了半小时的回合显示成刚开始。

### 已知偏差：别人发起的回合会少算「首个 delta 之前」那几秒

`liveMessage` 只在两个时机诞生：本端发送（`beginPlaceholderThinking`）与快照水合
（`mapSnapshotLiveMessage`）。`status_changed → thinking` 与 `turn_started` 都只改
`session.status`，**不建 `liveMessage`**（见 `conversationRuntime.ts` 的 `status_changed`
分支与 `turn_started` 分支）。

于是：页面已经开着、另一端发起了一个回合 → 状态先翻成 `thinking` 而 `liveMessage` 还是 null
→ 这几秒不显示时间；首个 delta 到达时 `appendLiveContent` 才建出 `liveMessage`，起点是
那一刻的 `Date.now()`。也就是纯思考期（通常 1–5s）没被算进去。

**刻意不修。** 修法是在 `turn_started` 上也建占位 `liveMessage`，但那会让旁观端凭空多出一个
「思考中…」占位气泡 —— 那是回合语义的改动，不该夹在一个展示功能里。冷启动/中途接入这条更
常见的路径不受影响（快照带 `started_at`，起点是准的）。

## UI 行为

胶囊内容变成 `[状态点] 思考中 · 1m30s  [计划 2/5]`。已运行时间是 `.input-status-row__elapsed`，
18rpx（比状态文案 19rpx 再小一档）、`--up-light-color`、`flex-shrink: 0`、`tabular-nums`
（秒位跳动时胶囊宽度不抖）。状态文案保留 `flex: 1` + 省略号，所以窄屏下被截断的是状态词，
时间不会被挤掉。

### 文案形制：`45s` / `1m` / `1m30s` / `30m` / `1h` / `1h1m`

`formatRunElapsed(ms)`：最多两个单位，为 0 的低位单位省略，无空格。

这一份**没有照抄 PC 的 `1h 1m 1s`**，而是跟仓库里已有的 `formatSubagentDuration`
（`services/conversation/subagentToolCall.ts`，子智能体胶囊的耗时）同一形制 —— 同一个概念在
同一个界面上出现两种写法，会让人以为是两件事。

**一小时以上不再显示秒。** 那个量级上秒是噪音；它同时决定刷新频率：秒可见时标签每秒变一次，
跨过一小时后每分钟才变一次。

负值夹到 0。`startedAt` 在中途接入那条路上是**主机时钟**，而减法用的是**手机时钟**，
两端有偏移：主机快一点会算出负数（显示 `0s`，无害），主机慢一点只能虚高，客户端无从校正。
这是 PC 端不存在的问题（同机同钟），移动端只能接受。

## 为什么单独做一个组件

`ConversationDetailRunElapsed.vue` 是个只有一个文本节点的叶子组件，自己持有
`setInterval(..., 1000)`。

**不能在 pane 里读一个每秒推进的 ref。** 状态胶囊住在
`ConversationDetailInteractivePane` 的模板里，而那份模板同时 `v-for` 出整条消息时间线
（尾窗允许 230 轮，每轮一棵富文本子树）。在 pane 里读 tick 会让整棵 vnode 树每秒重建一次 ——
正是 [[2026-09-04-05-05-detail-streaming-performance-fixes]] 那一轮刚消除掉的开销，
而且它会恰好落在流式最忙的时候。计时器连同它的响应式依赖关在叶子组件里，重渲染范围
就只有那一个文本节点。

组件里存的是**已经格式化好的字符串**而不是时间戳：同值赋 ref 不触发更新，所以跨过一小时
之后定时器仍是 1s 一跳，而重渲染降到每分钟一次，不必为此切换定时器频率。

`:paused="!active"` —— 详情页是 swiper 多 tab，非当前页的 pane 仍然挂载着，看不见的地方
不必每秒醒一次。暂停时仍然刷一次值，这样切回来的瞬间看到的是当下而不是离开前那一刻。
`onBeforeUnmount` 清表。

`showRunElapsed` / `runElapsedStartedAt` 两个 computed **不给 pane 引入新的响应式依赖**：
pane 的渲染本来就依赖 `session.liveMessage`（它渲染实时气泡）与 `session.status`。

## 样式落点

基础形制在组件自己的 `<style scoped>` 里，**不 `@import "./index.scss"`** —— 那张表 3774 行，
为一个文本节点整份复制一遍不值得（`TaskStatusChip` 那种 import 对着的是 326 行的表）。

主题重着色（cyber / sweet / summer）写在 `index.scss` 里，附在既有的
`.input-status-row__text` 选择器列表上。靠的是 Vue scoped CSS 会把**父组件的 scope id
也打在子组件根节点上**：编译产物里确实生成了
`.page--cyber .input-status-row__elapsed[data-v-e5c36e4e]`（`e5c36e4e` = pane 的 scope id），
而组件根节点同时带 pane 与自己的两个 id。已在 h5 构建产物里核对过。

## 兼容性

纯展示层。不改运行状态取值、消息结构、持久化、跨端协议，不新增任何请求或事件。
`liveMessage.timestamp` 是既有字段，本次只是多了一个读取方。老服务端不给
`live_message.started_at` 时，中途接入的回合拿不到起点 → 不显示，其余路径不受影响。
按 AGENTS.md 只用 `--up-*` 变量 + 字面量兜底，没有新增 `--mcode-*` 别名。

## 测试

- `tests/pages/conversation-detail/detailStatusPresentation.spec.ts`（+4 条）——
  `formatRunElapsed` 的六个分段、一小时以上丢秒、负值/NaN 夹到 `0s`；
  `shouldShowRunElapsed` 的四个计时状态与五个不计时状态、起点缺失。
- `tests/pages/conversation-detail/statusCapsuleRunElapsed.spec.ts`（新，7 条）——
  接线的源码扫描契约。其中最重要的一条是反向断言 **pane 里不得出现秒级
  `setInterval`**：那是把性能优化一次性还回去的唯一路径，只能用契约锁住。

全量：`185 suites / 1971 tests` 全绿；`vue-tsc --noEmit` 停在既有基线 **37** 条
（全在 `uni_modules/up-tts/examples`、`pages/*`、`services/appVersion`），改动文件零新增；
`uni build`（h5）通过。**没有真机视觉验证** —— 未核对的是胶囊在最窄屏 + 长状态词 + 计划药丸
三者同时出现时的换行表现。

## 原生 iOS / Android 复刻要点

1. **起点是回合级的，且必须优先采信服务端。** 本端发起时用本地时钟；attach 到一个正在跑的
   会话时用快照里的 `live_message.started_at`。不要用「进入页面的时刻」兜底 —— 那会把长回合
   显示成刚开始，比不显示更糟。
2. **时钟偏移要夹。** 服务端起点减本地当前时间可能为负，夹到 0；不要渲染负号。
3. **计时器只覆盖那一个文本视图。** 不要让每秒一跳的状态驱动整条消息列表的
   diff/重新布局。原生端的等价做法是只对那个 label 调更新，不要 `reloadData` /
   `invalidateLayout`。
4. **跨过一小时改成分钟粒度**，标签因此每分钟才变一次；离开当前页时停表，回来时先刷一次再起表。
5. 等待授权 / 等待提问期间**继续计时**：那是「回合还没结束」，不是另一种空闲。
6. 时间用等宽数字，并让状态文案而不是时间承担截断。

## 相关笔记

- [[2026-09-04-05-05-detail-streaming-performance-fixes]] —— 为什么计时器不能住在 pane 里
- [[2026-08-26-19-18-conversation-status-capsule-matrix-motion]] —— 状态胶囊的状态类与动效
- [[2026-08-29-04-24-default-theme-status-capsule-border-spin]] —— 胶囊边框跑马灯挂在哪个状态类上
- [[2026-06-11-detail-status-unification]] —— `runtimeStatus` → 文案/色调的统一来源
