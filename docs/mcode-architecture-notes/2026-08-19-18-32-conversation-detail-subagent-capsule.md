# 详情页原生子智能体胶囊：默认折叠 + 状态转圈 + 实时正文归属

**文件**：`2026-08-19-18-32-conversation-detail-subagent-capsule.md`

## 现象（用户原话）

> 我发现 codeg-plus 有一个委派子智能体的功能会把对应的会话折叠起来，mcode 却直接展示
> 太长了，应该提供默认折叠功能且折叠的胶囊要显示子智能体任务的状态，比如进行中应该转圈

「太长」有两个独立成因，缺一个都修不完：

1. **历史轮次**：子智能体在协议上就是普通 `tool_use` + `tool_result`，mcode 把它并进
   「调用 N 个工具」的通用分组，`agent_stats` 里的耗时/内层工具全丢；
2. **流式期间**（更严重）：服务端把子智能体**内部**的 text/thinking 也当普通
   `content_delta` 广播，只在 `parent_tool_use_id` 上标注归属。不分流的话，一个跑十分钟
   的子智能体会把它内部所有推理整段追加进**父气泡**，用户要滚很久才看到主线程下一句话。

---

## 覆盖范围：只接管「原生子智能体」，不碰 codeg 的 `delegate_to_agent`

服务端有两套彼此无关的委派：

| 系统 | 工具名 | 结果承载 | 本次处理 |
| --- | --- | --- | --- |
| A：原生子智能体 | Claude `Task`/`Agent`、Codex `spawn_agent`、Grok `spawn_subagent`、Cursor `task` | `tool_result` 上的 `agent_stats`（`models/message.rs` 的 `AgentExecutionStats`） | **接管**，成胶囊 |
| B：codeg 自研委派 | `delegate_to_agent` / `get_delegation_status` / `cancel_delegation` | 另一套委派状态 | **不接管** |

B 不做的理由：参考实现 `codeg-plus` 里那类卡片**刻意永不展开**，而在 mcode 里它本来
就已经是一个折叠的工具组，不造成长度问题。为它再造一种卡片是纯增量风险。B 的三个名字
被显式写进 DENY 集合，防止 A 的启发式把它们误收。

---

## 识别：判定顺序本身是语义

`services/conversation/subagentToolCall.ts` 的 `isSubagentToolCall`：

```
meta.claudeCode.subagent === true   （权威，严格布尔）
  → DENY 集合命中则否
  → input 形状（subagent_type / subagentType 存在）
  → 工具名精确集 + freeform 词段兜底
```

四条顺序都不能换：

- **权威标记优先**：服务端认出来了，名字长什么样都不重要。
- **严格 `=== true`**：字符串 `"true"`、数字 `1` 都不算。`_meta` 是可选的自由字段、
  上游拼错过大小写，用 truthy 判断会让任何带这个键的调用都变成胶囊。
- **DENY 必须挡在 input 形状之前**。`wait_agent`（等待子智能体完成，本身不是发起）
  的 input 里也可能带 `subagent_type` —— 顺序反了就会为同一个子智能体长出第二个胶囊。
  参考实现靠别名表把 `wait_agent`/`close_agent` 先映射成 `"task"` 再匹配，我们匹配原始名、
  不继承那层保护，所以必须自己拒。
- **`task` 只能精确相等，绝不可前缀匹配**。这是不污染计划面板的关键：`TaskCreate` /
  `TaskUpdate` / `TaskList` / `TaskGet` 归一后是 `taskcreate`/… 都不等于 `task`。
  写成 `startsWith("task")` 就会把整个待办面板变成一排子智能体胶囊。

`agent` 这一项同时覆盖实时路径：服务端 `resolve_rewritten_title` 在认出子智能体时会把
title 改写成字面量 `"agent"`，而 `api/acp.ts` 的 `ToolCall.name` 是 title 优先。

### 本次修掉的真 bug：`/\bagent\b/` 在 snake_case 里是死代码

freeform 兜底最初写成：

```ts
return /\bagent\b/.test(canonical)   // ← 永远不成立
```

`canonicalToolName` 把所有分隔符归一成 `_`（还剥掉 `mcp__<server>__` 前缀），而 **`_`
在正则里算单词字符**，于是 `\b` 在 snake_case 内部永远不成立 —— `call_omo_agent`、
`wait_agent` 一个都匹配不上，**整个兜底分支是死代码**。

连带后果：DENY 集合「挡住 `wait_agent` 长出假胶囊」这条理由，落在一个从不触发的分支上。

**为什么一直没被发现**：DENY 命中在 freeform 之前，所以测试矩阵里
`wait_agent → false`、`close_agent → false` 那几行照样是绿的 —— 它们走的是 DENY 分支，
掩盖了兜底根本不工作。只有 `call_omo_agent → true` 这一行能暴露它，而这一行原先没写。

正确写法是按 `_` 切开逐段精确比较：

```ts
return canonical.split("_").includes("agent")
```

代价：`agent_list` 一类「操作 agent 而非发起 agent」的名字也会中。这是 heuristic 层面
固有的误收风险，出现了就加进 DENY —— 那正是 DENY 存在的意义。

> **教训（可迁移）**：任何在归一化成 snake_case 之后做的正则匹配，都不要用 `\b`。
> 归一化和匹配是两个人分别写的时候，这个坑格外容易埋。同类断言必须至少有一条
> **只能靠被测分支通过**的用例，否则前置分支会替它变绿。

---

## 数据通路：6 处归一化 + 2 个字段

`ToolCall` 上新增两个字段（`types/acp.ts:70-88`）：

| 字段 | 内容 | 形状 |
| --- | --- | --- |
| `meta` | ACP `_meta` 原样透传 | 原样 |
| `agentStats` | `tool_result` 上的 `agent_stats` | **保持 snake_case** |

`agentStats` 刻意不转 camelCase：字段名映射集中在
`subagentToolCall.normalizeSubagentStats`，这样 6 处归一化都只做哑透传，服务端加字段时
一行都不用跟改；而且它就是要被原样存进 SQLite 的形状（见下）。

**这两个字段要透传的 6 处**。注意这**不是**
[[2026-08-19-12-41-conversation-detail-empty-thinking-parts]] 里那「四处归一化」的同一个
集合 —— 那边数的是**内容 part 的归一化出口**，这边数的是 **`tool_call` 对象的构造点**。
两个集合各有对方没有的成员：那边含 SQLite 读回的两处、不含实时事件；这边含实时事件两处、
不含读回（读回是整对象还原，见下）。改一处时别拿另一份清单当核对表。

| # | 位置 | 路径 |
| --- | --- | --- |
| 1 | `api/acp.ts:1155` | 实时 `tool_call` 事件 |
| 2 | `api/acp.ts:1175` | 实时 `tool_call_update` 事件 |
| 3 | `detailDataNormalization.ts:193` | 远端 detail 的 `content[]` |
| 4 | `detailDataNormalization.ts:369-409` | 远端 detail 的 `blocks[]`（含 `tool_result` 配对回填） |
| 5 | `conversationDetailPersistence.ts:348` / `:455-492` | 落库前的同两条路径（这是独立的一份实现） |
| 6 | `conversationRuntime.ts:2251` | 快照恢复（mid-turn attach） |

从 SQLite 读回那条路（`mapPersistedPartToContent`）**不需要逐字段处理**：它写的是
`tool_call: payload.tool_call || payload`，整个对象原样还原，所以 `meta`/`agentStats`
自动跟着回来。这也是为什么缓存那份的胶囊能显示 `agent_stats` 明细。

第 6 处最容易漏：`buildToolCallPart` 少带 `meta`，冷启动附着到一个正在跑的会话时胶囊会
**退化成普通工具组**，而不会报错。

| # | 位置 | 路径 |
| --- | --- | --- |
| 1 | `api/acp.ts:1155` | 实时 `tool_call` 事件 |
| 2 | `api/acp.ts:1175` | 实时 `tool_call_update` 事件 |
| 3 | `detailDataNormalization.ts:193` | 远端 detail 的 `content[]` |
| 4 | `detailDataNormalization.ts:369-409` | 远端 detail 的 `blocks[]`（含 `tool_result` 配对回填） |
| 5 | `conversationDetailPersistence.ts:348` / `:455-492` | 落库前的同两条路径（这是独立的一份实现） |
| 6 | `conversationRuntime.ts:2251` | 快照恢复（mid-turn attach） |

从 SQLite 读回那条路（`mapPersistedPartToContent`）**不需要逐字段处理**：它写的是
`tool_call: payload.tool_call || payload`，整个对象原样还原，所以 `meta`/`agentStats`
自动跟着回来。这也是为什么缓存那份的胶囊能显示 `agent_stats` 明细。

第 6 处最容易漏：`buildToolCallPart` 少带 `meta`，冷启动附着到一个正在跑的会话时胶囊会
**退化成普通工具组**，而不会报错。

`tool_call_update` 那处必须写 `event.data.meta ?? currentToolCall.meta ?? null`
（`conversationRuntime.ts:581`）—— update 常常不带 `meta`，直接赋值会擦掉首帧的权威标记，
胶囊在流式中途「变形」成普通工具组。

### 落库裁剪：`clampSubagentStats`

`agentStats` 跟着 `tool_call` **整体**进 SQLite（`toPersistedPartPayload` 存的是整个对象），
一个跑了几百个工具的子智能体会把单行撑得很大。所以 6 处归一化统一先过
`clampSubagentStats`：

- 内层 `tool_calls` 只留**最新 30 条**（留尾部：越晚的调用越接近最终结果）；
- `input_preview`/`output_preview` 各裁到 400 字；
- 裁掉的条数写进 `tool_calls_truncated`，**必须透出到 UI**（胶囊里的「另有 N 个工具调用
  未展示」）。不提示的话展开看到的是一份掐了头的列表，用户会以为子智能体只跑了这几个工具；
- 没裁掉任何东西时**不写**这个键（不要凭空造 `0`）。

---

## 指纹陷阱：`meta` 与 `agentStats` 必须从内容身份里剔除

`conversationTurnIdentity.stableSerializeContent` 会哈希**整个** `tool_call` 来生成
`fp:` 身份键。加了这两个字段后必须同步加剔除
（`stripNonContentToolCallFields`，`conversationTurnIdentity.ts:344`）：

**`agentStats` 是原地回填的。** `normalizeBlocks` 先按 `tool_use` 建出 tool_call，
等扫到配对的 `tool_result` 才 `matched.tool_call.agentStats = stats`。把它算进指纹，
同一条轮次在「回填前」和「回填后」会得到两个不同的 `fp:` 键 —— 本地缓存那份与远端那份
认不出是同一条，**详情页直接重复一条消息**。这正是
[[2026-08-18-19-56-conversation-detail-turn-identity-dedupe]] 记的那类事故。

**`meta` 一并剔除**：它是 `_meta` 原样透传，服务端加一个字段就会平移全表的指纹，
而它对「这一轮讲了什么」毫无贡献。

顺带记一个已知的不稳定 id：`detailDataNormalization.ts:369`/`:403` 在
`tool_use_id` 缺失时用 `tool-${index}-${Date.now()}` 兜底。这类 id 每次归一化都不同，
指纹自然也不同。目前靠「服务端总是给 `tool_use_id`」兜住，**没有测试覆盖**，
列为待观察项。

---

## 实时正文归属：缓冲放 session 上，不挂 `ToolCall`

`api/acp.ts` 把 `parent_tool_use_id` 从 `content_delta` / `thinking` 事件透传进
`stream_batch.data.parentToolUseId`（服务端用 `skip_serializing_if = "Option::is_none"`
下发，所以主线程内容上这个键**根本不存在**，`|| undefined` 保持载荷形状不变）。

`conversationRuntime.appendLiveContent` 在动 `liveMessage` **之前**分流：

```ts
if (parentToolUseId) {
  appendSubagentTranscript(session, parentToolUseId, delta)
  return          // ← 提前返回，下面三件事一件都不做
}
```

分流点必须在最前面，且这三件事一件都不能做：

1. **不进 `liveMessage`** —— 这就是「不再太长」的全部含义；
2. **不设 `session.status = "thinking"`** —— 父 `tool_call` 已把状态设成 `running_tool`
   （底部显示「正在执行工具」）。子智能体每来一个 chunk 就翻成「思考中」会让底部状态条
   在整个子任务期间反复抖动，而且描述的是错的层级；
3. **不清占位 thinking 胶囊** —— 占位胶囊代表「主线程正在想」。被子智能体的内容清掉，
   主线程真正开始输出前那段时间就没有任何进行中提示了。

缓冲是 `session.subagentTranscripts: Map<string, string>`，**刻意放在 session 上而不是挂
`ToolCall`**，三个原因：

1. `liveMessage` 是整轮累加器、每个 delta 都整体替换 content 数组
   （见 [[2026-08-18-23-51-conversation-detail-live-message-overlap]]）；
   往嵌套 `tool_call` 里追加字符串会让每个 chunk 都重建全部 part 身份；
2. **父 `tool_call` 事件不保证先到** —— 按 id 收的 map 不丢早到的 chunk；
3. `toPersistedPartPayload` 存的是**整个** `tool_call` 对象，任何挂上去的字段都会自动
   进 SQLite。放 session 上让「不持久化」成为**结构性保证**而非纪律。

### 为什么不持久化

这些 chunk 是无结构的纯 delta，而 turn_complete 后历史回填会带回结构化的
`agent_stats.tool_calls[]`（含耗时），**严格优于**实时尾巴。存下来只会得到两份互相矛盾、
无法对账的渲染源。

代价：历史轮次的胶囊没有「实时输出」那一段，只有 `agent_stats`。这是正确的取舍。

### 上限与清理

- 单个桶上限 4000 字，**裁头保尾**（最新进展必须还在）；
- 空 delta 不建桶 —— 空桶会让 `hasBody` 误判「有内容可展开」，点开一片空白；
- 回合边界统一在 `resetExternalTurnBackfill` 里 `clear()`
  （`conversationRuntime.ts:1232`）。那是 turn_complete / turn_cancelled / disconnect /
  缓存清理的**唯一漏斗**，清在那里不会漏。不清的话下一回合的胶囊会顶着上一回合的尾巴，
  而那段文字与新任务毫无关系；
- `getSubagentTranscripts(id)` 返回**普通对象**（不是 Map），未知会话返回 `{}`。
  返回 Map 的话模板里 `transcripts[toolCall.id]` 取不到值，**而且不会报错** —— 胶囊只是
  永远空着。

---

## 展示

### 分组：抽出 `bubbleDisplayParts.ts`

分组循环原先在 `MessageBubble.vue` 和 `GoalToolCallBlock.vue` **各有一份**。加子智能体
豁免时若不抽，就会出现「`/goal` 运行块里的子智能体仍被并进『调用 N 个工具』」的功能缺口。

顺带解决了一个真实事故：这段逻辑原先只有 `readFileSync` + `toContain` 的源码文本测试，
而 `isEmptyThinkingPart` 曾在 `MessageBubble.vue` 里被调用却**没有 import** ——
非流式轮次每次重算都 `ReferenceError`，那两条文本断言全程是绿的。

### 状态一律以 `ToolCall.status` 为准

`buildSubagentCapsuleView` 的 `state` 取自 `toolCall.status`，**不是**
`agent_stats.status`。用户看的就是这个 tool call；`agent_stats.status` 是子智能体自己
报的，两者可能不一致（子智能体报 completed、外层 `tool_result` 还没回来），拿它当胶囊
状态会出现「已完成却还在转圈」或反之。`agent_stats.status` 只作 body 里的一行明细。

**`pending` 不转圈**：附着到一个已有会话时，快照里的调用可能是 `pending` 且永远不会再
收到事件 —— 让 `pending` 转圈就是一个永久旋转的胶囊。只有 `running` 转。

### App-Plus 渲染约束（原生端复刻必读）

1. **转圈图标必须是 `<view>` 的兄弟节点，绝不能塞进 `<text>` 里。**
   App-Plus 下 `<text>` 只渲染文本子节点，组件会被整个吞掉 —— 「进行中转圈」是用户明确
   要的效果，吞掉了就静默没有了，而 H5 上看起来完全正常。
2. **内层工具只渲染成扁平文本行，绝不递归 `ToolCallBlock` 或本组件自身。**
   子智能体里可以再起子智能体，递归组件在长会话里会炸出成百上千个节点，而这个胶囊存在
   的全部理由就是把长度压回去。
3. 颜色只用 `--up-*` 主题变量（`--up-primary` / `--up-success` / `--up-error`），
   色值只能作为 `var()` 的 fallback，不能裸写在样式属性上（AGENTS.md 要求，否则深色模式
   下会瞎）。

### 与参考实现的两处刻意分歧

| | codeg-plus | mcode | 理由 |
| --- | --- | --- | --- |
| running → completed | 自动收起 | **不收起** | 手机端用户很可能正展开读实时输出，一完成就把面板从拇指底下抽走 |
| 失败 | 自动展开 | 同样自动展开，但由 `userToggled` 守住 | 用户手动收起过之后，后续状态变化不再抢夺控制权 |

`hasBody === false` 时胶囊退化成一枚**纯胶囊**：无边框、无箭头、点击无响应。
子智能体刚发起、`agent_stats` 还没回来时就是这种形态 —— 挂一个点不开的箭头比不挂更糟。

### 接线点（漏一处 = 静默空胶囊）

```
conversationRuntime.getSubagentTranscripts(conversationId)
  → ConversationDetailInteractivePane.vue    :subagent-transcripts
  → ConversationDetailReadonlyTimeline.vue   :subagent-transcripts
      → MessageBubble.vue        part.type === 'subagent_call'  → :transcript
      → MessageBubble.vue        :subagentTranscripts → GoalToolCallBlock.vue
      → GoalToolCallBlock.vue    item.type === 'subagent_call'  → :transcript
```

两条时间线、两条气泡渲染路径都要接。少接一处不会报错，胶囊只是永远空着。

---

## 原生 iOS / Android 复刻要点

1. **识别顺序照抄**：权威标记（严格布尔）→ DENY → input 形状 → 名字。`task` 精确相等。
2. **不要在归一化后的 snake_case 上用 `\b` 正则**（见上文死代码 bug）。原生端如果用
   `NSRegularExpression` / Java `Pattern`，`_` 同样算 `\w`，同一个坑一模一样。
3. **`parent_tool_use_id` 必须在写入主气泡累加器之前分流**，且不改会话状态、不清占位。
4. **实时缓冲不要挂在 tool call 模型上**，否则序列化/持久化时会自动带上。
5. **`agent_stats` 保持服务端原始 key**，映射集中一处。
6. **转圈只在 `running`**，`pending` 不转。
7. **状态取外层 tool call**，不取 `agent_stats.status`。
8. **裁剪要透出条数**，不提示等于谎报完整。
9. 指纹/去重键里排除 `meta` 与 `agent_stats`（原地回填字段一律排除）。

---

## 测试

- `tests/services/subagentToolCall.spec.ts`（新增，50 例）：20 行 `it.each` 身份矩阵
  （四家原生名、`TaskCreate` 一族、DENY、B 系统、mcp 前缀、空输入）；`\b` 死代码的
  专项回归；严格布尔标记；DENY 优先于 input 形状；`normalizeSubagentStats([]) → null`；
  `clampSubagentStats` 保尾 30 条 + `tool_calls_truncated: 5` + 预览裁剪 + 保持
  snake_case + 不凭空造条数；耗时格式化表（`450→"450ms"`、`1500→"1.5s"`、`60000→"1m"`、
  `95000→"1m35s"`）；`buildSubagentCapsuleView` 的状态来源、`pending` 不转圈、
  标题无残缺片段、裁头保尾、`hasBody` 判定。
- `tests/stores/subagentLiveTranscript.spec.ts`（新增，10 例）：带归属的 chunk 不进父气泡、
  不翻 `thinking`、不吃占位胶囊、早到的 chunk 不丢、按 id 分桶、回合边界清空、
  4000 字裁头保尾、空 delta 不建桶、返回普通对象、`tool_call_update` 不擦 `meta`。
  > mock 块是从 `tests/stores/conversationRuntime.spec.ts:5-51` **逐字复制**的。
  > 自己猜模块形状会得到 `touchConnection is not a function` 一类全红。
- `tests/pages/conversation-detail/subagentCapsuleLayout.spec.ts`（新增，8 例）：
  仓库没有 `@vue/test-utils`/jsdom，组件层只能验源码 —— 所以只锁「唯独源码能表达」的
  三类：App-Plus 渲染约束、接线是否到位、主题变量而非硬编码色值。**这类断言挡不住行为
  回归**（上文 `isEmptyThinkingPart` 那个 P0 就是证据），展示逻辑本体由
  `subagentToolCall.spec.ts` 覆盖。
- 全量：122 suites / 778 tests 通过；`tsc --noEmit` 维持 3 条既有基线错误
  （`main.ts` 的 `./App.vue`、`detailScrollState.ts` 两条）；`npx uni build` 通过。

## 相关笔记

- [[2026-08-19-18-32-conversation-detail-local-turn-cache-toggle]] —— 同批改动的另一半
- [[2026-08-18-23-51-conversation-detail-live-message-overlap]] —— `live_message`
  是整轮累加器，解释了为什么实时缓冲不能挂进 `tool_call`
- [[2026-08-17-tool-call-group-summary-style]] —— 通用工具组的折叠样式，
  子智能体正是从这个分组里被豁免出来的
- [[2026-08-19-12-41-conversation-detail-empty-thinking-parts]] —— 同一段分组循环里的
  空 thinking 过滤，以及那个未 import 的 P0
