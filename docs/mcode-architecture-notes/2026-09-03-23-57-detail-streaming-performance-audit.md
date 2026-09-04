# 会话详情流式性能审计：卡顿、滑动不跟手、高 CPU

**排查范围**：`mcode-app` 全树（302 个 `.vue` / `.ts`），重点是会话详情流式链路。

**结论先说**，两类问题要分开看：

*高 CPU / 卡顿* 是**三条各自独立的 O(n²)** 叠在同一个主线程上（流式 part 深拷贝、
时间线与渲染投影的全量序列化、markdown 每 delta 全量重解析），外加每次 flush 两次强制
布局测量、H5 侧每条 SQL 写入的整库重写、以及一整套「算了但没人渲染」的影子链。
三条 O(n²) 都有实测数字。

*滑动不跟手* 有一半根本不在 JS 里：iOS 上给 `document` 挂了两个非 passive 触摸监听
（滚动必须等主线程仲裁），以及每条 markdown 根节点都是一个横向惯性滚动容器
（抢手势 + 各占一个合成层）。这两处合起来不到 20 行 CSS/HTML 就能改完，
**与数据量、与是否在流式完全无关**，应该先做并单独验一次帧率。另一半是 JS：
滚动回调里读派生集合会就地触发上面那条重算链。

下面每条都给了 `file:line`。

## 一、实测（桌面 Node 22 / V8）

三个基准探针跑在真实源码上（`buildConversationTimeline`、`buildRenderMessageItems`、
`up-markdown` 用的 `marked.esm.mjs` 均直接 import 原文件）。探针是一次性的，已删除。

### 1. 单次流式 flush 的纯逻辑耗时

| 场景 | 时间线重建 | 渲染项深拷贝 | watch getter 全量 stringify | 单份合计 | shell+pane 双份 |
| --- | --- | --- | --- | --- | --- |
| 40 轮历史 / live 10KB | 0.91 ms | 0.66 ms | 0.31 ms | **1.94 ms** | 3.88 ms |
| 120 轮历史 / live 100KB | 4.60 ms | 4.98 ms | 2.73 ms | **12.65 ms** | 25.3 ms |
| 230 轮历史 / live 602KB | 16.5 ms | 24.7 ms | 15.8 ms | **61.3 ms** | 122.5 ms |
| 同上但尾部 assistant 串 32 条 | 59.1 ms | 29.4 ms | 19.7 ms | **108.2 ms** | 216.5 ms |

把这三处按下面「修复」一节改掉后，同样输入降到 **0.07 / 0.11 / 0.17 ms**（136× / 367× / 628×）。
注意：优化版的签名函数是简化替身，倍数是上限而非承诺；但「把整条 live 正文的序列化提到
循环外」「去掉只读投影的深拷贝」「watch getter 只看尾项」三条都是纯结构性的，语义不变。

230 轮不是极端值 —— 尾窗协议本身允许 30→230
（见 [[2026-08-19-05-14-conversation-detail-tail-window-only]]），用户往上翻几页就到。

### 2. `appendLiveContent` 每个 delta 深拷贝尾部 part

| delta 数 | 最终正文 | 现状（JSON 深拷贝）累计 | 改浅拷贝 |
| --- | --- | --- | --- |
| 300 | 12K 字符 | 11.0 ms | 0.1 ms |
| 800 | 31K 字符 | 70.8 ms | 0.1 ms |
| 1500 | 59K 字符 | 260.2 ms | 0.2 ms |

delta 数翻倍、耗时翻四倍 —— 教科书式 O(n²)。

### 3. `up-markdown` 每个 delta 全量 `marked()` 重解析

| delta 数 | 最终正文 | 累计 marked() | 末次单发 |
| --- | --- | --- | --- |
| 200 | 12K 字符 | 35 ms | 0.08 ms |
| 500 | 29K 字符 | 75 ms | 0.21 ms |
| 1000 | 59K 字符 | 145 ms | 0.18 ms |
| 2000 | 117K 字符 | 606 ms | 0.42 ms |

同样是 O(n²)，而且这只是 `marked()`；它产出的 HTML 还要再交给 `up-parse`
（`u-parse/parser.js`，1400 行）解析成节点树，那一步通常比 `marked` 本身更贵。

**换算到设备**：中低端 Android WebView 的 JS 大约是桌面 V8 的 1/3～1/8。
上表「120 轮」那一行的 25 ms/flush 到手机上就是 **75～200 ms/flush**，
「230 轮」那一行是 **0.4～1 s/flush**。这就是卡死的量级。

## 二、P0：每次流式 flush 都在做的事

### P0-1 时间线投影每 flush 全量重建，且 shell 与 pane 各算一份

`stores/conversationRuntime.ts:173`（`getTimelineTurns` 是**普通函数，不是 computed**）
→ `stores/conversationTimeline.ts:18`

```ts
function getTimelineTurns(conversationId: number): ConversationTimelineTurn[] {
  const session = getOrCreateSession(conversationId)
  return buildConversationTimeline({ ... })   // 每个调用方各跑一遍完整流水线
}
```

两个调用方各自包了一层 computed，依赖 `session.liveMessage`，于是每个 delta 各失效一次：

- `pages/conversation-detail/index.vue:791` → `messages:796` → `renderMessageItems:800`
- `pages/conversation-detail/ConversationDetailInteractivePane.vue:1570` → `:1573`

`buildConversationTimeline` 内部最贵的是 `countCoveredTrailingAssistantTurns`
（`conversationTimeline.ts:142-156`）：

```ts
for (let count = maxCount; count >= 1; count -= 1) {     // maxCount 上限 32
  const combined = turns.slice(turns.length - count).flatMap((turn) => turn.content || [])
  if (isContentPrefix(combined, liveMessage.content)) return count
}
```

`isContentPrefix`（`:187`）会走 `buildContentSignature(fullParts)` **两次**
（`buildPartSignature` + `buildStablePartSignature`，内含 `stableStringify`），再加一次
`buildTextProjection` 全量拼接 —— 也就是**每次迭代都把整条 live 正文重新序列化 3 遍**，
而 live 正文里含本轮所有 tool_call 的 input/output。最坏 32 次迭代 = 96 遍。

`fullParts` 在整个循环里是不变量。把它的两个签名提到循环外算一次，这一项就从 O(32×N)
降到 O(N)（实测 59.1 ms → 0.13 ms）。

顺带：`dedupeEntriesByRoleAndId:299/303` 对每一轮做 `JSON.stringify([turn.role, turn.id])`，
换成 `` `${turn.role}|${turn.id}` `` 这类字符串拼接即可。

### P0-2 `buildRenderMessageItems` 在 computed 里 JSON 深拷贝整个合并段

`pages/conversation-detail/detailMessagePresentation.ts:53-55, 87`

```ts
function cloneContentParts(parts: ContentPart[]): ContentPart[] {
  return JSON.parse(JSON.stringify(parts || [])) as ContentPart[]
}
...
content: assistantBuffer.flatMap((item) => cloneContentParts(item.content || [])),
```

流式的 live 轮次本身就是尾部那条 assistant 轮次，而解析器会把一条逻辑回复拆成**多条
连续 assistant 记录**（`conversationTimeline.ts:100-111` 的注释就是讲这个），所以
`assistantBuffer.length >= 2` 是常态 —— 合并分支每 flush 都要把**整串尾随 assistant
轮次 + 整条 live 正文**深拷一遍。

比 CPU 更糟的是副作用：所有 part 对象换了身份，合并气泡里每一个 `ToolCallBlock` /
`plan` / `tool_result` 子组件的 prop 引用都变了，于是每 flush 全部重渲染。

下游只读，拷贝没有语义收益。改成 `flatMap((item) => item.content || [])` 即可
（实测 24.7 ms → 0.09 ms）。

### P0-3 两处 watch 的 getter 每 flush 序列化**整个会话**

`pages/conversation-detail/index.vue:2743-2749` 与
`ConversationDetailInteractivePane.vue:2028-2035`（同一份拷贝）

```ts
watch(
  () => renderMessageItems.value.map((item) => ({
    id: item.anchorId, role: item.message.role, status: item.message.status,
    content: JSON.stringify(item.message.content || []),   // ← 每一条消息全量序列化
  })),
  (nextMessages, prevMessages) => { ... scheduleViewportSync() }
)
```

回调里真正用到的只有 `nextMessages[length - 1]`。getter 却把列表里**每一条**消息的
content 都序列化了一遍，O(整个会话内容量) / flush。而且 getter 返回新数组，
`hasChanged` 恒为真 —— 回调每 flush 必然执行一次 `scheduleViewportSync()`（见 P0-4）。

改成只取尾项的标量签名，例如
`` `${items.length}|${tail?.anchorId}|${tail?.message.status}|${tailTextLength}` ``
（实测 15.8 ms → 0.00 ms），并给回调加 ~120 ms 节流。

### P0-4 每 flush 两次「6 连选择器」强制布局测量

`pages/conversation-detail/index.vue:3903-3925`（`scheduleViewportSync` 在 `:4063`）

```ts
const query = uni.createSelectorQuery().in(instance)
query.select(".detail-tabs-bar").boundingClientRect()
  .select(".detail-shell__page--active .input-status-row").boundingClientRect()
  .select(".detail-shell__page--active .composer-stack").boundingClientRect()
  .select(".detail-shell__page--active .input-main-row").boundingClientRect()
  .select(".detail-shell__page--active .input-tool-menu").boundingClientRect()
  .select(".detail-shell__page--active .message-list__content").boundingClientRect()
  .exec(...)
```

两条触发路径，每 flush 各一次：

1. pane 的 watch（P0-3）→ `scheduleViewportSync()`（`:2492`）→ `nextTick` →
   `emit("layout-change")` → index.vue 模板 `:220` 的 `@layout-change="measureMessageListHeight"`
2. index.vue 自己的 watch（P0-3）→ `scheduleViewportSync()` → `:4065` **直接**再调一次

测量发生在 `nextTick` 里、紧跟着列表刚变高，且回调里写的
`detailViewportHeight / topChromeHeight / bottomComposerHeight` 正是 scroll-view
`:style` 的来源（`messageListPageStyle`，`:831`）—— 写完又要重新布局。典型 layout thrash，
也是「滑动时被顶一下」的直接来源。

顺带：`measuredPageHeight`（`:678`）写了之后**没有任何消费者**。

修法：把测量与「消息内容变化」解耦 —— 只在 composer / 键盘 / tab 高度真可能变时测
（输入框 input、面板开合、resize），流式期间不测；测量本身加 ~200 ms 节流并做
「值未变则不写」的短路。

### P0-5 `appendLiveContent` 每个 delta 对累积正文做 JSON 深拷贝

`stores/conversationRuntime.ts:306-333`（`cloneContentPart` 在 `:2564`）

```ts
const nextContent = currentLiveMessage.content.slice()
const part = shouldMergeWithTail
  ? cloneContentPart(nextContent[tailIndex])   // JSON.parse(JSON.stringify(part))
  : buildEmptyContentPart(contentType)
if (contentType === "text") part.text = (part.text || "") + delta
```

尾部那个 text part 装着**本轮到目前为止的全部正文**，每个 delta 把它
`JSON.stringify` + `JSON.parse` 一遍 → 整轮 O(N²)。见上表实测。

`text` / `thinking` 都是字符串，`plan` 是整体替换，深拷贝没有语义收益。
改成 `{ ...part }`（或直接原地 `part.text += delta`）即可。

### P0-6 `up-markdown` 每个 delta 全量重解析

`components/MessageBubble.vue:93-100`
→ `uview-plus/components/u-markdown/u-markdown.vue:63-88`

```js
watch: { content: { handler(newVal) { this.parseMarkdown(newVal) }, immediate: true } },
...
let parsed = marked(content)          // 全量重解析
parsed = this.handleCodeBlock(parsed) // 再对产出 HTML 跑一次正则
```

流式气泡的 `part.text` 每 delta 增长 → `marked()` 全量重跑 → `up-parse` 再把 HTML
解析成节点树 → Vue 再 diff 一遍新节点树。见上表实测（117K 字符累计 606 ms，仅 marked）。

修法：正在流式的**最后一段文本**用纯 `<text>` 渲染，只在 `status !== 'streaming'` 时
才切到 `up-markdown`。这样整轮只解析一次 markdown。

### P0-7 滚动回调把整条重算链拉进滚动帧

`ConversationDetailInteractivePane.vue:2728-2757`

```ts
pageScrollTop.value = scrollTopValue;          // ← 无人消费的死状态，每个滚动事件一次响应式写
lastMeasuredScrollTop.value = scrollTopValue;
...
if (shouldAutoFollowBottom.value) {
  const tail = renderMessageItems.value[renderMessageItems.value.length - 1];  // ← 读它
  anchorMessageId.value = tail?.anchorId || "";
}
```

`@scroll` 在 uni 的 scroll-view 上可达 ~60 次/秒。第 2746 行读 `renderMessageItems.value`：
流式期间这个 computed 是 dirty 的，**这一读就地触发 P0-1 + P0-2 的完整重算**，
而且发生在滚动事件处理函数里。手指在滑、agent 在输出，两边交替把 computed 弄脏，
于是每一帧都可能重算一次 25～200 ms 的东西 —— 这就是「不跟手」。

另外 `scheduleViewportSync` 在非跟随态下会把 `:scroll-top` 赋回
`lastMeasuredScrollTop`（`:2501`），而该值由滚动事件持续刷新，所以每次赋值都是**新值**，
必然触发 scroll-view 的程序化滚动，落在惯性滑动中途 → 回弹/顿住。

修法：滚动回调里不要读 `renderMessageItems`（尾项 id 从 store 的廉价标量拿）；
`pageScrollTop` / `lastMeasuredScrollTop` 改成非响应式普通变量；
非跟随态下 `scheduleViewportSync` 什么都不做，绝不回写 `scroll-top`。

### P0-8 index.vue 维护了一整套「渲染不到任何东西」的影子链

index.vue 的模板（`:1-312`）里**没有消息列表** —— 消息只由
`<ConversationDetailInteractivePane>`（`:202`）渲染，而 pane 自己建了一份完全同源的
`messages` / `renderMessageItems`（`:1570-1575`）。

index.vue 那一份的全部消费者都只需要标量：

| 消费者 | 实际需要 |
| --- | --- |
| `showScrollToBottomFab`（`:1525`） | `length > 0` |
| `scrollToBottom`（`:3995`） | `length` |
| `conversationActivitySignature`（`:1024`） | 一个「有没有活动」的短标记 |
| watch（`:2743`） | 尾项 |
| `resolveRenderAnchorId`（`:4009`） | 按需调用，不在 flush 路径 |
| `planTasks`（`:1509`） | 见 P1-4 |

也就是说 P0-1 / P0-2 / P0-3 的代价**全部要跑两遍**，其中一遍纯属浪费。
删掉 index.vue 的 `timelineTurns` / `messages` / `renderMessageItems`，改为向 store
拿廉价标量，一步砍掉一半。

### P0-9 iOS 上给 `document` 挂了两个 `{ passive: false }` 触摸监听

`index.html:23-43`

```js
document.addEventListener("touchstart", (event) => {
  if (event.touches.length > 1) { event.preventDefault() }
}, { passive: false })

document.addEventListener("touchend", (event) => {
  const now = Date.now()
  if (now - lastTouchEnd <= 300) { event.preventDefault() }
  lastTouchEnd = now
}, { passive: false })
```

非 passive 的 `touchstart` 挂在 `document` 上意味着**合成器不能走滚动快路径** ——
浏览器必须先等主线程执行完这个 handler，才能决定滚动是否可以开始。而主线程正被上面
所有 P0 占满，于是滚动就在排队。**这是「不跟手」最字面的机制，且与列表内容、
与是否在流式完全无关。**

修法：删掉 `touchstart` / `touchend` 那两个，双击缩放抑制改用 CSS
`html { touch-action: manipulation }` 表达 —— 语义等价且不占主线程。
viewport meta（`:5-8`）里已经有 `maximum-scale=1.0, user-scalable=no`。
`gesturestart` 那个可以保留，它不在滚动路径上。

### P0-10 每条 markdown 都是一个横向惯性滚动容器

`components/MessageBubble.vue:741-748`

```scss
:deep(.up-markdown ._root) {
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
}
```

而 `u-parse.vue:521-526` 自己已经有一份同样的 `._root { overflow-x: auto;
-webkit-overflow-scrolling: touch }`。于是纵向 `scroll-view` 里嵌了**每条消息（多 text
part 时更多）一个**动量滚动容器。

iOS WKWebView 下每个这样的元素等于一个 UIScrollView + 独立合成层：既吃内存，又和外层
纵向滚动**抢手势** —— 手指稍微斜一点就被内层横向滚动条捕获，列表不动。230 条消息就是
几百个嵌套滚动容器。表格、`ToolCallBlock` 的 `scroll-view scroll-x`、`GitDiffViewer`
每个 hunk 一个 `scroll-view` 都在往上叠。

修法：`._root` 去掉 `overflow-x: auto` 和 `-webkit-overflow-scrolling`，把横向滚动收窄到
真正需要的 `pre` / `table` —— `MessageBubble.vue:801` 的 `.up-markdown-code` 已经在做这件事了。

### P0-11 H5 侧每条 SQL 写入都把整库序列化重写进 IndexedDB

`services/db/sqlite.ts:93-101`，调用点 `:234`

```ts
async function persistH5Database() {
  if (!h5Db) return
  if (transactionDepth > 0) return
  const bytes = new Uint8Array(h5Db.export())      // 物化整库镜像
  h5PersistQueue = h5PersistQueue.catch(() => {}).then(() => writeStoredH5Database(bytes))
  await h5PersistQueue
}
...
database.run(sql, normalizeParams(params))
await persistH5Database()                          // 无条件
```

无防抖、无脏标记、无合并，唯一抑制是 `transactionDepth > 0`。sql.js 在页面上下文初始化
（`:55`，**没有 Worker**），所以每条语句要付：`export()` 物化整库 + `new Uint8Array(...)`
第二份 + `bytes.buffer.slice(...)`（`:205-208`）第三份 + IndexedDB structured clone 第四份，
并且 `await` IDB 事务提交。体积由 `conversation_parts.payload_json`（完整工具调用载荷）
和 `conversation_runtime.live_message_json` 决定。

命中它的写路径（每条各一次整库导出）：

- `conversationSyncService.ts:30-36` —— **每个** `status_changed` / `turn_complete` 事件都触发
  摘要镜像 → `updateSummaryStatus`（`:265-304`）→ 非事务 upsert → 一次整库导出。
  而 `status_changed` 在每次工具调用时翻转，一轮 20 次工具调用量级上是 40 次整库序列化。
- `services/db/migrations.ts:23-37` —— 7 条 DDL + 6 条索引**全都不在事务里** →
  **每次冷启动首次触库时 13 次整库导出 + 13 次 IDB 事务**，压在启动关键路径上。
  （`CREATE TABLE IF NOT EXISTS` 在已有库上是语义空操作，但照样触发导出。）
- 草稿：`ConversationDetailInteractivePane.vue:3395-3401` 的 watch getter **每敲一个键**
  就 `JSON.stringify(attachments.value)` 一次，防抖 800 ms 后落盘 → 又一次整库导出。
- 若干裸自动提交写：`upsertConversationSummary`、`patchConversationSummaryStatus`、
  `markConversationSummaryDeleted`、`saveRuntime`、`saveCursor`。

原生分支（`plus.sqlite`，`:227-228`）没有这个成本，门禁是 `isAppPlusRuntime()`（`:28-30`）
—— 所以这一条**只影响 H5 / 浏览器**。

修法：改脏标记 + 尾防抖（1～2 s）+ `onHide` / `pagehide` 强冲；去掉第 2、3 份拷贝；
`ensureConversationSchemaInternal` 整体包一个事务（13 → 1）；
摘要写路径把已读到的 `current` 传进 upsert，去掉重复 SELECT。
长期：sql.js 搬进 Worker，或换 IndexedDB VFS，让持久化从「每次写入 O(库大小)」变成页级。

## 三、P1：明显可感知

### P1-1 `subagentTranscripts` 每次返回新对象 → 全列表气泡重渲染

`stores/conversationRuntime.ts:1519-1527`

```ts
const snapshot: Record<string, string> = {}
session.subagentTranscripts.forEach((value, key) => { snapshot[key] = value })
return snapshot
```

它作为 `:subagent-transcripts` 传给 v-for 里**每一个** `MessageBubble`
（`ConversationDetailInteractivePane.vue:160`）。子智能体每来一个 chunk，
reactive Map 变化 → computed 失效 → 返回新对象身份 → **整张列表所有气泡 patch 一遍**
（每个气泡内含 `up-markdown`）。

修法：只把该气泡需要的那一条正文传下去（按 `item.key` 在 pane 里取），
或让 `SubagentCapsuleBlock` 自己按 id 从 store 订阅。

### P1-2 合并气泡的 `:key` 不稳定，边界处整段 markdown 重新挂载

`detailMessagePresentation.ts:66-82`

```ts
if (assistantBuffer.length === 1) { result.push({ key: single.id, ... }) }
...
result.push({ key: `merged-${first.id}-${last.id}`, ... })
```

连续 assistant 轮次从 1 条变 2 条时 key 从 `single.id` 跳成 `merged-…`；
`suppressCoveredTrailingAssistantPartial`（`conversationTimeline.ts:83-98`）又是按内容前缀
**动态增删尾部轮次**的，流式中途可能来回抖动 → key 反复翻转 → Vue 销毁重建整个合并气泡
→ 里面所有 `up-markdown` 重新 `marked()` + 重新走 `up-parse`，并重放一次入场动画。

修法：合并项的 key 只用首条的 id（`merged-${first.id}`），锚点仍用 `last.id`。

### P1-3 长列表无虚拟化

`ConversationDetailInteractivePane.vue:144-163` 是裸 `v-for`，`renderMessageItems` 有多少条
就渲染多少条完整气泡。尾窗可到 230 轮，每个气泡是 `MessageBubble`（1705 行）+ N 个
`up-markdown` + `up-parse` 节点树 + tool_call 块。粗算一个详情页能到几千个组件实例。

同一个 `v-for` 里 `:key="index"` 用在 part 层（`MessageBubble.vue:93`），而
`buildBubbleDisplayParts`（`services/conversation/bubbleDisplayParts.ts`）会把相邻 tool_call
折成 `tool_call_group`、流式结束时又丢弃空 thinking part —— 分组边界一移动下标整体错位，
触发一次全量重解析；`isThinkingCollapsed(index)`（`:385`）也按下标存折叠态，
错位会导致「点一个展开另一个」。

修法：列表窗口化（只渲染最近 N 条 + 上滑扩窗）；part 层改用稳定 key
（tool_call 用 `tool_call.id`，text 用 `text-${partIndex}`），折叠态按该 key 存。

### P1-4 `conversationActivitySignature`：嵌套双层序列化，且服务的开关是关的

`pages/conversation-detail/index.vue:1008-1033`

```ts
const liveActivitySignature = computed(() =>
  buildLiveActivitySignature(session.value?.liveMessage?.content || [])   // 内部全量 JSON.stringify
)
const conversationActivitySignature = computed(() => {
  return JSON.stringify({
    live: liveActivitySignature.value,                              // 已是长字符串，再被转义一遍
    latestContent: JSON.stringify(latest?.message.content || []),   // 又一次全量
  })
})
```

`buildLiveActivitySignature`（`detailRuntimePresentation.ts:23-51`）先把整条 live content
序列化成字符串，外层再把这个长字符串当字段**二次序列化**（带转义，比首次更贵），
同时把最新合并消息的全部 content 序列化第三遍。

它唯一的消费者是 `:2844` 的 watch → `handleLiveActivityChange`，
而该函数第一行就是 `if (!ENABLE_STUCK_PROMPT_DETECTION)` 直接 return，
`index.vue:603` 写死 `false`。**这三重序列化目前是纯浪费**。

修法：把整个 watch 包在 `if (ENABLE_STUCK_PROMPT_DETECTION)` 里（或删掉）。

### P1-5 `buildPlanTasks` 全量扫描所有消息的所有 part，且算两份

`pages/conversation-detail/detailPlanPresentation.ts:17-49`；消费者
`index.vue:1509` 与 `ConversationDetailInteractivePane.vue:1673` 各一份。

依赖 `messages.value` 与 `liveMessage.content`，每 flush 失效一次，然后把会话内**每一条
消息的每一个 part** 走一遍、建 Map、排序。只为状态条上的「计划 3/7」和计划抽屉服务。

修法：只扫尾部 live content + 最后一条带 plan 的消息；index.vue 那份配合 P0-8 删掉。

### P1-6 `flush: "sync"` 的 watcher 里全量序列化 live 正文

`ConversationDetailInteractivePane.vue:3835-3847` +
`pages/conversation-detail/detailPromptSend.ts:261-268`

```ts
export function buildPromptStartWatchSignature(session) {
  return [
    session?.status || "",
    session?.liveMessage ? JSON.stringify(session.liveMessage.content || []) : "",
  ] as const
}
...
stopWatch = watch(() => buildPromptStartWatchSignature(session.value), () => {...},
  { flush: "sync" })
```

`flush: "sync"` 意味着 getter 在**每一次**反应式写入时同步重跑，完全绕过 Vue 的
批处理 —— 不是每帧一次，是每个 mutation 一次。而 getter 返回新数组，`hasChanged` 恒真，
回调也每次都执行。

缓解因素：这个 watcher 只活在「发送已确认启动」之前的窗口里，且有 setTimeout 兜底
（`:3849`），此时 live 正文还小。但只要启动确认被拖慢（慢启动 / 重试），它就在同步
序列化一个正在增长的缓冲区。

修法：getter 改成 `[status, content.length, tailTextLength]`，不要序列化。

### P1-7 会话列表：唯一的可见派生被高频无关更新整体作废

`pages/conversations/index.vue:582-600` 的 `overviewDisplayModel` 是列表的全部可见派生。
重算一次要为每张可见卡 `{ ...card }` **展开两次**
（`conversationOverviewPresentation.ts:357` 进 `visible`、`:365` 进 `candidates`），
每组再走一次 `sortRunningOverviewCardsFirst`（`:230-238`，map + sort + map 三趟），
外加每次新建 `Object.fromEntries(connectionInstanceKeyMap)`。所有卡片对象身份全变
→ 模板整棵卡片子树重渲染。列表**没有虚拟化**（全仓 `recycle-view` / `z-paging` 零命中）。

失效源，每一条都触发上述全量重算：

- **`awaitingReplyVersion`** —— `services/conversation/awaitingReplyStore.ts` 里
  `version += 1` 是**无条件**的，哪怕归一化出来的 Map 与上一次逐字相同。
  于是**每一次 `pet://sessions` 推送都强制全量重算**。
- **`session.status`** —— `thinking ↔ running_tool` 每次工具调用都翻转。一轮 20 次工具调用
  ≈ 40 次全列表重算。这条与实时预览开关无关，**默认配置下就在发生**。
- **`searchKeyword`** —— `:22` 是裸 `v-model`，**无防抖**（对比 `forge/index.vue:1232` 防抖
  500 ms、`circles/index.vue:477` 防抖 220 ms，本页是唯一例外）。每敲一个字全量重算，
  还连带 `buildHistoryProjectSections`（`:661`）扫全部项目的全部会话。

三条修法都很小：`ingestPetSessionsPayload` 里比对新旧 Map，**只在真变了才 `version += 1`**；
`searchKeyword` 加 200～250 ms 防抖到独立 ref；卡片对象只 spread 一次，
`candidates` 复用 `visible` 那一批对象。

### P1-8 流式 delta 被 `.trim()` —— 这条是正确性问题，不是性能问题

`api/acp.ts:1140`、`:1153` → `firstString`（`:1500-1505`）

```ts
function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()   // ← 返回 trim 后的值
  }
  return ""
}
...
case "content_delta":
  return { ..., data: { delta: firstString(record.text), contentType: "text", ... } }
```

文本 / thinking 的 delta 走同一个 `firstString`，于是每个 chunk 的**前后空白被吃掉**，
纯空白 chunk（`" "`、`"\n\n"`）连真值判定都过不了、**整块丢弃**。
`"Hello"` + `" world"` 会渲染成 `"Helloworld"`，独立成块的段落空行会消失。

是否可见取决于服务端怎么切块（`stream_batch` 这个名字说明服务端有批处理，
批边界正好落在空白上的概率较低），所以它可能一直潜伏着。但语义上 delta 必须原样取：
`typeof record.text === "string" ? record.text : ""`。

## 四、与流式无关的常驻 CPU / 网络开销

### P0 `api/acp.ts:617` 1 秒轮询链，句柄不保存，全仓库无任何停止路径

```ts
if (shouldContinue) {
  setTimeout(poll, 1000)     // 自续期链
}
```

`startPolling`（`:589`）由 `ensureRealtimeBridge` 失败的 catch 触发（`:576-585`）。
没有变量持有 timer id，没有 `clearTimeout`，没有生命周期挂钩，没有可见性门禁，
**切后台不停**。唯一退出条件是错误串匹配 web 模式的「not available」（`:606-613`）；
超时、断网、502 都只 `console.error` 后继续 1 Hz 打 `POST /api/acp_poll_events`。
`pollingStarted`（`:66`）也只在那一个窄分支里复位（`:611`），所以桥接后来恢复了
轮询也不会停，两条通道并行跑到进程结束。

触发点很近：`App.vue:18` 在 `onLaunch` 里就调
`startConversationTabBadgeService()` → `subscribeGlobalEvent` → `connectEventSource`。
**冷启动时主机不可达一次，就永久落入 1 Hz 轮询。**

修法：句柄存模块级变量并导出 `stopPolling()`；`App.vue` 的 `onHide` 停、`onShow` 按需重启；
桥接恢复时复位 `pollingStarted`；失败改指数退避（1s → 30s 封顶）。

### P1 桥接重连链没有终止入口

`api/acp.ts:886` 的指数退避本身合理（30 s 封顶），但「停止」通道是死代码：
`closedManually` 全仓库只有类型声明（`:38`）、两处赋 `false`（`:718`、`:727`）、
三处读取（`:860`、`:874`、`:890`），**从来没被置为 true**（已逐处 grep 确认）。
所以登出、页面卸载、切后台都不会终止重连。

同时 `destroyRealtimeTransport` 在 `:15` 导入，全仓库**无调用点** —— transport 从不销毁。

### P1 `App.vue` 没有任何全局后台暂停

`App.vue:31-33` 的 `onHide` 只有一行 `console.log("App Hide")`。
全应用只有 `pages/conversation-detail/index.vue:2309-2322` 一处在页面 `onHide` 里成体系停表
（停 4 个 timer + 落断点）—— 那一页也是全仓清理最规整的一页。

### P1 会话列表页三个 `blur(80rpx)` 光斑永久动画，无条件渲染

`pages/conversations/index.vue:3-8`（模板无 `v-if`、无主题门禁）+ `:2150-2187`

```scss
.liquid-blob { filter: blur(80rpx); opacity: 0.5; }
.liquid-blob--one { width: 460rpx; height: 460rpx; animation: liquidFloat 20s ease-in-out infinite alternate; }
@keyframes liquidFloat { from { transform: translate(0,0) scale(1); } to { transform: translate(60rpx,80rpx) scale(1.2); } }
```

三个 460/540/380rpx 的元素各带 80rpx 模糊，动画 20s/15s/25s 无限。真正贵的是关键帧里的
`scale()` —— **缩放一个模糊层每帧都要重新栅格化**，不是纯合成器 transform。本页是 tabBar 页，
永不卸载；`onHide`（`:765`）暂停了实时预览，但没有关这三个光斑。

对比：会话详情页的三个 `.detail-atmosphere__blob`（`index.scss:664-693`）**没有 animation**，
是静态模糊层，只栅格化一次 —— 那个不用改。

修法：去掉三条 `animation`（保留静态渐变），或把 `.liquid-bg` 绑到已有的
`livePreviewPageVisible` 之类可见性 ref 上 `v-if` 掉。至少要把关键帧里的 `scale()` 删掉。

### P2 `pages/conversations/index.vue:762` 调了一个不存在的函数

```ts
livePreviewTransferredConversationIds.clear()
stopCreateProgressTimer()          // ← 本文件内无定义、无 import
})                                  // onUnload 的最后一句
```

该名字定义在 `CreateConversationSheet.vue:583` 的 `<script setup>` 内部且未导出
（已全仓 grep 确认只有那一处定义）。运行时是 `onUnload` 最后一句抛 ReferenceError。
前面的清理都已执行完，所以没吞掉别的清理，但它想兜底的那个 1.8 s interval
（`CreateConversationSheet.vue:577`，组件内**没有** `onUnmounted`）等于没有兜底。

修法：删掉这一行，改在 `CreateConversationSheet.vue` 里加 `onBeforeUnmount`。

### P1 桌宠引擎在流式最忙的时刻做同步落盘

`components/pet/PetFloat.vue:110` 无条件调 `initPetEngine()`（不判 `petStore.initialized`），
而 `App.up.vue:7,13` 无条件挂 `PetFloat`，`vite.config.js:30-32` 的
`UniUpRoot({ rootFileName: "App.up" })` 未设 `excludePages` → 注入**每一个页面**。
（引擎本身有 `engineInitialized` 单例守卫（`petEngine.ts:317`），不会按页重复创建，这点没问题。）

热路径是 `petEngine.ts:135-175` 的 `onStatusChange`：

```ts
if (newStatus === 'running_tool') {
  petStore.addExp('agent', 2)
  petStore.recordStat('totalToolCalls')
}
```

`recordStat`（`stores/pet.ts:154-160`）**无条件**调 `checkUnlocks()`（`:231`），
后者遍历 `SKINS` + `ACCESSORIES` + `ACHIEVEMENTS` 三张表。而 persist 用的是**同步** IO：

```ts
persist: {
  storage: {
    getItem: (key: string) => uni.getStorageSync(key),
    setItem: (key: string, value: string) => uni.setStorageSync(key, value),
  },
},
```

一轮里状态在 `thinking` / `running_tool` 之间翻转的次数 ≈ tool 调用次数 × 2。
每次翻转 = `clearAllTimers()` + 全表解锁扫描 + 整个 `PetState` 的 JSON 序列化 +
**阻塞式 storage 写**（`addExp` 和 `recordStat` 各触发一次订阅）。Android 上单次
`setStorageSync` 可达数毫秒，而这些全落在流式输出最忙的时刻。

修法：`initPetEngine()` 加 `if (!petStore.initialized || petStore.hidden) return` 门禁；
`recordStat` 里的 `checkUnlocks()` 改节流（或只在升级 / 打开成就页时跑）；
落盘改防抖（500 ms 合并）。

### P2 其余定时器（来自定时器专项排查，逐条已核对存在性）

- `pages/connections/index.vue:1565` —— 每条离线连接一条 3 s WS 重连链，清理只挂在
  `onUnmounted`（`:663`），而本页是 tabBar 第 0 项兼冷启动落地页，实践中只有 `reLaunch`
  才触发；本页**没有 `onHide`**。主机不在线时就是每条连接每 3 秒一次 WS 握手，持续整个
  应用生命周期。修法：加 `onHide` 清理 + `onShow` 重建，延迟改指数退避。
- `pages/tasks/index.vue:615`、`pages/task-detail/index.vue:332` —— 事件驱动的全量重拉，
  订阅只在 `onUnload` 拆、两页都没有 `onHide`；`tasks` 还是 tabBar 页。切走页面期间主机每推
  一次任务事件仍打出一整轮全量列表请求。
- 三个 60 s `nowTimer`（`tasks:419`、`forge:520`、`forge-item:342`）都只在 `onUnload` 清，
  无后台暂停。开销小，但 tabBar 页意味着永久每分钟一跳。
- `components/MarqueeText.vue:72-79` —— `watch(props.text)` 每次变化都 `nextTick` 后发两个
  `boundingClientRect`。用在会话列表的实时预览卡（`conversations/index.vue:166`），
  开启预览后每个活跃卡每批 token 两次跨线程布局查询。**默认关闭**
  （`conversationListLiveStreamPreference.ts:5` 缺 key 归一为 false）。
- `components/MessageBubble.vue:436` —— matrix 主题下每个流式气泡起一个 90 ms `setInterval`
  驱动 `cyberTick`，每 tick 用 `buildCyberDecodeText` 重建整段乱码覆盖文本。
  **默认关闭**（需 `detailTheme === 'matrix'`，`index.vue:625` 初值 `"default"`）。

### 默认开关状态（决定优先级）

| 效果 | 默认 | 依据 |
| --- | --- | --- |
| matrix / sweet / summer 氛围（CyberRain、SweetBubbles、90 ms decode、全屏 `mix-blend-mode`） | **关** | `index.vue:21-23` gate；`:625` 初值 `default` |
| 会话列表实时预览（MarqueeText + 呼吸点） | **关** | `conversations/index.vue:514` |
| **会话列表三个动画光斑** | **开（无条件）** | `conversations/index.vue:3-8` 模板无 `v-if` |
| **桌宠引擎定时器 / 同步落盘** | **开（无条件）** | `PetFloat.vue:110` 不判 `initialized` |
| 宠物语音 TTS | **开** | `stores/pet.ts:45` `voiceEnabled: true` |

兼容遗留：`detailCyberMode.ts:26-33` 会把老 key 里的 `true`/`"1"` 归一成 `"matrix"`，
旧版本开过该主题的用户升级后仍是开启态 —— 那批用户会额外吃到上面所有 matrix 项。

## 五、建议的动手顺序

> **状态**：第 1～16 步已实施，见
> [[2026-09-04-05-05-detail-streaming-performance-fixes]]（含改后实测、逐条改法、
> 以及第 17 步与 `up-markdown` 线性化为什么留着没做）。

按「改动量 ÷ 收益」排。第 1～2 步是纯 CSS/HTML，不碰任何业务逻辑，且是唯一直接治
「不跟手」这个体感的 —— 建议先做、单独验一次帧率，再动 JS。

| # | 改动 | 位置 | 预期 |
| --- | --- | --- | --- |
| 1 | 删掉 iOS 的两个非 passive 触摸监听，改用 `touch-action: manipulation` | `index.html:23-43` | 让滚动重回合成器快路径 |
| 2 | `._root` 去掉 `overflow-x: auto` + `-webkit-overflow-scrolling` | `MessageBubble.vue:741-748` | 去掉每条消息一个动量滚动容器（抢手势 + 抢合成层） |
| 3 | `cloneContentParts` 去掉 JSON 往返 | `detailMessagePresentation.ts:53` | 砍掉一条 O(n²)，顺带消掉子组件 prop 身份 churn |
| 4 | `cloneContentPart` 改浅拷贝 | `conversationRuntime.ts:2564` | 砍掉第二条 O(n²) |
| 5 | 两处 watch getter 改标量签名 + 节流 | `index.vue:2743`、`Pane.vue:2028` | 砍掉全量 stringify，并把 P0-4 的布局测量降频 |
| 6 | 删掉 index.vue 的影子链 | `index.vue:791-802,1509,1024` | 剩下的代价直接除以 2 |
| 7 | live 侧签名提到循环外 | `conversationTimeline.ts:142-156` | 时间线从 O(32×N) 降到 O(N) |
| 8 | 滚动回调不读 `renderMessageItems`；非跟随态不回写 `scroll-top` | `Pane.vue:2728,2492` | 治「滑动被拽回去」 |
| 9 | 流式最后一段文本用 `<text>`，完成后才切 `up-markdown` | `MessageBubble.vue:93-100` | 砍掉第三条 O(n²) |
| 10 | `persistH5Database` 加脏标记 + 尾防抖 + `onHide` 强冲；schema 引导包一个事务 | `sqlite.ts:93-101`、`migrations.ts:23-37` | H5 从「每条 SQL 整库重写」变成「每静默期一次」；冷启动 13 → 1 次 |
| 11 | `acp.ts` 轮询链存句柄 + `App.vue` onHide/onShow 停启 | `api/acp.ts:589-622` | 砍掉默认路径上唯一的常驻网络开销 |
| 12 | 删掉会话列表三条 `animation`（至少删关键帧里的 `scale()`） | `conversations/index.vue:2163-2181` | 让合成器能空闲 |
| 13 | `version += 1` 改成有条件；`searchKeyword` 加防抖 | `awaitingReplyStore.ts`、`conversations/index.vue:22` | 会话列表最频繁的两个全量重算源 |
| 14 | `subagent-transcripts` 改为按气泡下发 | `Pane.vue:160` + `conversationRuntime.ts:1519` | 子智能体流式时不再全表重渲染 |
| 15 | 合并气泡 key 只用 `first.id` | `detailMessagePresentation.ts:81` | 消掉边界处的整段重挂载 |
| 16 | 桌宠 `checkUnlocks` 节流 + 落盘防抖 + 引擎加 `initialized` 门禁 | `stores/pet.ts:159,298`、`petEngine.ts` | 去掉流式期间每次工具调用的同步阻塞 IO |
| 17 | 消息列表 / 会话列表窗口化 + part 层稳定 key | `Pane.vue:144`、`MessageBubble.vue:93`、`conversations/index.vue` | 结构性改动，放最后 |
| — | 顺手修掉 | `conversations/index.vue:762` 未定义调用、`api/acp.ts:1140` delta 被 trim、`index.vue:678` 死 ref、`Pane.vue:1506` 死 ref | 正确性 / 清理 |

1～2 只改 CSS/HTML，与数据量和是否流式完全无关；3～7 做完，上表「120 轮」场景的每 flush
纯逻辑从 25 ms 降到 0.1 ms 量级；8 治交互手感；9 治长回复越到后面越卡；
10～13 治「什么都不做也烫 / 列表滑不动」。

## 六、原生 iOS / Android 复刻要点

1. **流式累加器不要用「拷贝 + 整体替换」的写法。** 每个 delta 复制一次已累积正文，
   整轮就是 O(n²)。原地追加到可变缓冲区，用一个单调递增的版本号通知 UI。
2. **不要用「序列化整个内容」来做变更检测。** 指纹只能包含常数长度的量
   （长度、尾项 id、状态、尾部文本长度）。这条在本仓已经踩过一次
   （见 [[2026-08-20-18-40-streaming-history-paging-and-no-polling]] 里的
   `historyRuntimeFingerprint`），现在又在另外四处复现 —— 说明它是这个代码库的系统性
   习惯，不是偶发。
3. **前缀比较要用增量长度 + 尾部哈希，不要重建字符串。** 而且不变量必须提到循环外。
4. **markdown 只在轮次结束后渲染一次。** 流式期间用纯文本；重解析整段是 O(n²)。
5. **布局测量与「内容变化」解耦。** 只在 composer / 键盘 / 容器高度可能变时测，
   加节流，并且「值未变则不写」——写回去的量往往正是布局的输入。
6. **滚动回调只做常数级工作。** 不要在里面读派生集合（会就地触发重算），
   不要在非跟随态回写滚动位置。
7. **一份数据只投影一次。** 投影放在共享层（store 的 computed 或缓存），
   不要让 shell 与子页面各算一份。
8. **列表要窗口化。** 尾窗允许 230 轮，每轮是一棵富文本子树。
9. **前台/后台要有全局开关。** 定时器、重连、动画、订阅统一挂在可见性状态上；
   每个自续期定时器都必须有句柄和显式的停止入口。
10. **不要在纵向列表内部嵌横向滚动容器。** 富文本根节点默认可横滚会让每条消息变成一个
    独立滚动视图，既抢手势又各占一个合成层。横滚只给代码块和表格。
11. **不要在滚动路径上挂非 passive 的全局手势监听。** 双击缩放这类抑制用平台声明式
    手段表达（Web 是 `touch-action`，原生是 gesture recognizer 的 delegate），
    不要让主线程参与每次 touch 的仲裁。
12. **持久化要「按静默期落盘」而不是「按写入落盘」。** 原生端别把整库/整状态
    序列化放在每次变更上（尤其不要在流式事件路径上），改脏标记 + 尾防抖 +
    进入后台强冲。装饰性计数器（经验值、统计）没有任何理由同步落盘。

## 七、核实边界

- 三组数字来自跑在**真实源码**上的一次性基准探针（Node 22 / 桌面 V8），已删除，
  仓库工作区干净。设备侧的换算（1/3～1/8）是经验系数，**未在真机 profiler 上验证**。
- 「优化后」的数字里，时间线那一项用的是简化替身签名函数，倍数是上限而非承诺。
- 已逐处读源码确认：P0-1 ~ P0-11、P1-1 ~ P1-8，以及四节里 `acp.ts` 轮询链 /
  `closedManually` 从未置 true / `destroyRealtimeTransport` 无调用点 / `App.vue` 的空 onHide /
  会话列表光斑 / `stopCreateProgressTimer` 未定义 / 桌宠链路（含 `engineInitialized` 单例守卫）/
  `ENABLE_STUCK_PROMPT_DETECTION` 写死 false / `index.html` 触摸监听 / `._root` 双份横滚声明。
- `pages/connections` / `tasks` / `task-detail` / `MarqueeText` 那几条来自定时器专项排查，
  已确认代码位置与清理钩子的有无，但**未逐条推演其运行时频次**。
- 本 checkout 的 `node_modules` 只有 `uview-plus`，依赖未安装。因此：
  `@dcloudio/uni-h5` 的内部实现无法核对（「非 passive 监听阻塞合成器滚动」「每条 markdown
  一个 UIScrollView」这两条的机制是 WebKit/Blink 的通用行为，不是本仓验证结论）；
  `sql.js` 的 `export()` 内部实现同理，「物化整库」这部分与实现无关、是定义。
  `up-markdown` / `up-parse` / `marked.esm.mjs` 读的是 `vite.config.js:11-23` 在 h5/app
  构建时 alias 到的真实源码 `D:\Repos\xyito\ultra-ui\uview-plus\...`。
- P0-11 只影响 **H5 / 浏览器**；原生走 `plus.sqlite`（`sqlite.ts:227-228`），
  门禁 `isAppPlusRuntime()`（`:28-30`）。
- 全树确认的否定结论：`requestAnimationFrame` / `cancelAnimationFrame` /
  `uni.createAnimation` **零命中**（所有动画都是 CSS，没有 JS 逐帧循环）；
  `deep: true` 只有一处且在小型 auth 表单上；`v-once` / `v-memo` 零使用；
  `structuredClone` 未使用；`Intl.DateTimeFormat` / `Intl.NumberFormat` 零使用
  （「每行新建 formatter」这类经典 bug 不存在）；`onPageScroll` 零使用；
  `addEventListener` 三处均有配对移除；数据库里没有 base64 编码
  （`mcode_runtime_sqlite_base64` 是遗留键，已在 `sqlite.ts:168-172` 主动清理）。
- 仓库根的 `logo.png`（887 KB）与 `tmp-detail-layout.png`（88 KB）全树无引用、
  也不在 `src/` 内，不进产物 —— 不是性能问题，但可以删。

## 相关笔记

- [[2026-08-20-18-40-streaming-history-paging-and-no-polling]] —— 删掉 1.5 s 全量校准轮询，
  以及 `historyRuntimeFingerprint` 那次同类问题
- [[2026-07-12-detail-streaming-no-full-history-refresh]] —— 流式期间不再全量重拉历史
- [[2026-07-05-p64-detail-scroll-follow-guard]] —— 贴底跟随判定
- [[2026-08-19-05-14-conversation-detail-tail-window-only]] —— 尾窗 30→230

