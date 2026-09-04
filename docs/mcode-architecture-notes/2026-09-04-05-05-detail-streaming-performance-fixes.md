# 会话详情流式性能修复：实现记录

配套 [[2026-09-03-23-57-detail-streaming-performance-audit]]（审计与实测基线）。
那篇给出诊断与 17 步动手顺序，这篇记录**实际改了什么、为什么这么改、留了什么没改**。

五个提交，按审计的顺序推进：`f382a6d` → `4b83e32` → `1121a95` → `fb6f1e3` → `f15550f`。

## 一、结果

单次流式 flush 的纯逻辑耗时（桌面 Node 22 / V8，同一组基准探针，探针一次性、已删除）：

| 场景 | 改前（shell+pane 双份） | 改后（单份） | 倍数 |
| --- | --- | --- | --- |
| 40 轮历史 / live 10KB | 3.88 ms | **0.18 ms** | 21× |
| 120 轮历史 / live 100KB | 25.3 ms | **0.52 ms** | 49× |
| 230 轮历史 / live 602KB | 122.5 ms | **1.68 ms** | 73× |
| 同上 + 尾部 assistant 串 32 条 | 216.5 ms | **1.86 ms** | 116× |

「双份 → 单份」本身也是修复内容之一：外壳那条影子链删掉了。

这张表**不含**另外三项也已消除的开销，它们不在这两个函数里：

- 两个 watch getter 的全量 `JSON.stringify`（改前每 flush 各 0.31 / 2.73 / 15.8 / 19.7 ms，×2）；
- `conversationActivitySignature` 的三重序列化（开关关着时现在恒返回空串）；
- 每 flush 两次 6 连选择器布局测量（现在按 120ms 节流，约 8 次/秒）。

`up-markdown` 的全量重解析没有变成 O(N)，但按 120ms 节流后重解析次数降到约 1/4
（见下面「三、只做了一半的」）。

## 二、改了什么

### 滚动不跟手（两处纯 CSS/HTML，与数据量、与是否流式无关）

`index.html:23-43` —— 删掉 iOS 上挂在 `document` 的 `touchstart` / `touchend`
非 passive 监听。非 passive 的 touch 监听让滚动**无法走合成器快路径**：必须先等主线程跑完
handler 才能决定滚动能否开始，主线程一忙滚动就排队。双击缩放抑制改用
`touch-action: manipulation` 声明式表达；捏合仍由 `gesturestart` 拦 —— 它不是滚动路径上的
事件类型（快路径判定只看 touchstart / touchmove / wheel）。

`MessageBubble.vue:741` —— `._root` 不再是滚动容器。原先带 `overflow-x: auto` +
`-webkit-overflow-scrolling: touch`（`u-parse` 自己也有一份），于是纵向 scroll-view 里
**每条消息**（多 text part 时更多）各自成为一个动量滚动容器：iOS WKWebView 下各占一个
合成层，还会和外层纵向滚动抢手势。横向滚动下移到真正需要的两处：`.up-markdown-code`
改成自己是滚动容器（原先靠父级滚动，那正是要去掉的东西），`table` 加 `display: block`
让 overflow 生效。长 URL 改 `overflow-wrap: anywhere` 换行而不是溢出。

`ConversationDetailInteractivePane.vue` —— `scheduleViewportSync` 在非跟随态**什么都不做**。
原先会把 `:scroll-top` 赋回 `lastMeasuredScrollTop`，而那个值由 scroll 事件持续刷新，
每次赋值都是新数值，scroll-view 必然执行一次程序化滚动，落在惯性滑动中途。

同文件的滚动回调不再读 `renderMessageItems`（流式期间它是脏的，一读就地触发整条投影链
重算，而 `@scroll` 可达 ~60 次/秒），改为新增 O(1) 的 `timelineTailAnchorId`；
`pageScrollTop` / `lastMeasuredScrollTop` 两个 ref 删掉 —— 本组件里没有任何读取方。

### 三条 O(n²)

**1. `detailMessagePresentation.ts` 合并 assistant 段时不再深拷贝。**
原先 `JSON.parse(JSON.stringify(parts))`。解析器会把一条逻辑回复拆成多条连续 assistant
记录（`conversationTimeline.ts:100-111` 的注释就是讲这个），所以合并分支往往覆盖「整串
尾随 assistant 轮次 + 整条 live 正文」，而这个函数在 `renderMessageItems` computed 里、
每个 delta 重跑一次。除 CPU 外，深拷贝让每个 part 换身份，逼着气泡内所有
`ToolCallBlock` / `plan` / `tool_result` 子组件每 delta 重渲染。

改前先确认了「下游只读」：`buildBubbleDisplayParts` / `buildGoalDisplayParts` 只往新数组
push 引用，MessageBubble 及其子组件全是只读，全仓没有任何地方改 `item.message.content`。
原来那条锁深拷贝的测试改成锁**引用共享**这个前提，并在注释里写清：
将来若有消费者需要改 parts，**不要把深拷贝加回来**，在那个消费者侧拷它自己那一份。

**2. `conversationRuntime.ts` 的 `cloneContentPart` 改浅拷贝。**
尾部 part 装着本轮到目前为止的全部正文，每个 delta 深拷一遍就是 O(n²)
（实测 1500 delta / 59K 字符累计 260 ms）。浅拷贝在这里语义等价：该函数只服务
text / thinking / plan 三种合并类型（`shouldMergeWithTail` 要求 type 相同），
前两者载荷是字符串、`plan` 由 `parsePlanDelta` 整体替换，都不会就地改到嵌套对象；
tool_call / tool_result / image 永远走不到合并分支。

**3. `conversationTimeline.ts` 把 live 侧投影提到重试循环外。**
`countCoveredTrailingAssistantTurns` 最坏要试 32 个候选后缀，而原先每次迭代都经
`isContentPrefix` 重建一遍整条 live 正文的两个签名 + 一次文本投影。新增
`createContentPrefixProbe(fullParts)`：三种投影各构建一次留在闭包里，文本投影仍按需
（保持原先的惰性）。`suppressAnchoredAssistantPartials` 复用同一个 probe。
dedupe 键从 `JSON.stringify([role, id])` 换成 `` `${role}\u0000${id}` `` 拼接。

单这一项就让「尾串 32 条」不再比「6 条」贵 —— O(32×N) 消除。

### 外壳的影子链（index.vue）

详情页外壳**不渲染消息列表**（模板里那个 swiper-item 是 pane），而 pane 自己建了一份
同源的 `messages` / `renderMessageItems`。外壳这边却常驻一条
`timelineTurns → messages → renderMessageItems`，于是每个 delta 的代价跑两遍，
其中一遍渲染不出任何东西。外壳的消费者其实全是标量：

| 消费者 | 改成 |
| --- | --- |
| `hasRenderedMessages` | `localTurns.length > 0 \|\| liveMessage`（抑制逻辑只在有 live 时摘尾部、且 live 条目必被追加，与「时间线非空」等价） |
| `showScrollToBottomFab` / `scrollToBottom` | 复用上面那个布尔 |
| `resolveRenderAnchorId` | 按需 `collectRenderMessageItems()`（只在恢复滚动位置时调） |
| `planTasks` | **抽屉门禁** —— 关着时返回空数组 |
| watch（原先全量 stringify） | `buildTimelineTailSignature` |
| `conversationActivitySignature` | 开关关着直接返回空串 |

`measuredPageHeight`（写了没人读）删掉。

### 两个 watch getter

新增 `buildTimelineTailSignature` / `isAssistantTailSignature`
（`detailRuntimePresentation.ts`），从 store 廉价字段拼一个**常数长度**的字符串，
role 编在第一段。返回字符串是关键 —— Vue 的 `hasChanged` 才能在没变时短路，
让回调不再每 flush 都跑。

`buildLiveActivitySignature` 随之无人使用（它把整条 live 正文序列化，正是要消灭的写法），
连同其测试一并删除，换成新函数的 6 条契约测试。

### 布局测量降频

新增 `scheduleViewportSyncThrottled()`（120ms，外壳与 pane 各一份），只给流式路径用；
交互路径（composer 高度变化、发送、tab 切换）仍走立即版本。
`measureMessageListHeight` 一次要发 6 个 `boundingClientRect`，而它写回的高度正是
scroll-view `:style` 的输入 —— 紧跟着列表变高去测、测完又改布局输入，是典型 layout thrash。

### prop 身份 churn

`getSubagentTranscripts` 原先每次调用都拷一个新对象。它包在 pane 的 computed 里、作为
`:subagent-transcripts` 传给 v-for 里**每一个** MessageBubble：子智能体每来一个 chunk →
computed 失效 → 新对象身份 → 整张列表所有气泡（各含 up-markdown）patch 一遍。

改为直接返回 session 上那个容器，`appendSubagentTranscript` 就地改单个 key，回合边界
**就地删 key**（不换新对象），未知会话返回共享的冻结空对象。身份稳定后 Vue 退化到
「按属性追踪」，气泡只订阅自己那条 tool_call 的 key。

session 字段从 `Map` 换成 `Record` —— 形状仍是普通对象，因为组件侧要 `transcripts[id]`
索引。既有测试锁了这一条，理由写在测试里：**换成 Map 的话模板里取不到值而且不报错**，
胶囊只会永远空着。

合并气泡的 key 从 `merged-${first.id}-${last.id}` 改成 `merged-${first.id}`。尾随串成员在
流式期间会变（新轮次落盘、按内容前缀增删尾部轮次、live 结束换成落盘 id），`last.id` 一变
key 就变，Vue 把整个合并气泡销毁重建 —— 里面所有 up-markdown 重新 marked + 重走 up-parse。
锚点仍用 `last.id`。

### 常驻开销（与流式无关）

| 位置 | 改动 |
| --- | --- |
| `api/acp.ts` 兜底轮询 | 句柄存进 `pollingTimer`；新增 `stopPolling()` / `isPolling()`；连续失败指数退避到 30s 封顶、成功一次回到 1s；`handleReady` 里停掉轮询（不再 WebSocket 与轮询并行） |
| `App.vue` | `onHide` 停轮询 + 冲两处防抖落盘；`onShow` 走新增的 `resumeRealtimeAfterForeground()`（订阅是常驻的、`ensureInstanceSubscriptions` 会早退，指望订阅路径重连是不行的） |
| `services/db/sqlite.ts` | 每条 `execute` 都 `h5Db.export()` 整库重写 → 脏标记 + 400ms 尾防抖；新增 `flushH5Database()` 给事务结束、`pagehide`/`visibilitychange`（模块内自挂）与 App onHide。冷启动 13 条 DDL 因此天然合并成一次导出 |
| `awaitingReplyStore` | `version += 1` 改成**有条件**（新旧表逐条比对）。`pet://sessions` 高频推送、绝大多数载荷逐字相同，无条件 +1 等于把「智能体在跑」翻译成「列表持续重算重渲染」 |
| `conversations/index.vue` | 搜索关键词 220ms 防抖（输入框仍绑即时值，清空立即生效）；三个 `blur(80rpx)` 光斑去掉 `animation` —— 关键帧里是 `scale(1.2)`，缩放模糊层每帧要重新栅格化，而本页是 tabBar 页永不卸载 |
| `stores/persistStorage.ts`（新） | `syncStorageAdapter`（立即写，auth/session/targets 三处重复的适配器收敛到这里）+ `createDebouncedStorageAdapter()`（尾防抖 + 可冲）。pet store 改用防抖版 |
| `petEngine.ts` / `PetFloat.vue` | `initPetEngine()` 改成 watch `petStore.initialized`（用户还没选宠时不该挂 watcher/定时器/TTS 问候）；`startIdleTimers()` 先清后排；`onStatusChange` 末尾补 `scheduleAmbientMotion()` |
| `connections` / `tasks` / `task-detail` | 补 `onHide` 停表停订阅、`onShow` 重建 |
| `ToolCallGroupBlock` | `JSON.stringify(input).toLowerCase()` 挪进真正需要它的兜底分支，并只扫字符串值 |
| `MarqueeText` | `watch(props.text)` 加 300ms 防抖 + `onBeforeUnmount` 清理 |
| `askQuestionResult` | 输出超 8000 字符直接放弃解析；`parseMaybeJson` 先看首字符再 `JSON.parse`（避免为每次失败构造带栈的 SyntaxError） |

### 顺带修掉的正确性问题

**`api/acp.ts` 的流式 delta 被 `.trim()`。** `content_delta` / `thinking` 走的是
`firstString`，它 trim 并把纯空白判成假值：chunk 前后空白被吃掉（`"Hello"` + `" world"`
拼成 `"Helloworld"`）、纯空白 chunk（`" "` / `"\n\n"`）整块丢弃，段落空行就此消失。
新增 `rawStreamDelta` 原样透传（`parentToolUseId` 是标识符，仍然 trim）。
能否看见取决于服务端怎么切块，所以它可以潜伏很久 —— 新增 6 条测试锁住。

**`conversations/index.vue:762` 的 `stopCreateProgressTimer()` 是未定义标识符**
（定义在 `CreateConversationSheet` 的 `<script setup>` 内、未导出），运行时是 onUnload
最后一句 ReferenceError；它想兜底的那个 1.8s interval 因此毫无保护。删掉该行，改为在持有
timer 的组件里加 `onBeforeUnmount`。

**`petEngine` 的 ambient motion 在第一次状态变化后永久死亡** —— `onStatusChange` 开头的
`clearAllTimers()` 清掉 `motionTimer`，而此前无人重排。

**`startIdleTimers()` 的两个孤儿 timer** —— init 路径会连调两次（watch 的 `immediate`
走一次 `onStatusChange`、init 末尾又调一次），原先直接赋值不清旧句柄。

## 三、只做了一半的

### `up-markdown` 的全量重解析：节流，没有变成 O(N)

`up-markdown` 的 `watch(content)` 每次变化都 `marked()` 全量重解析，产出的 HTML 再交给
`up-parse` 重新分词成节点树 —— 对一条正在增长的回复是 O(n²)。

做的是**尾段文本的节流镜像**（`MessageBubble.vue`，120ms / 约 8 次/秒）：正文仍然是
markdown，代价只是最多晚 120ms 出现，重解析次数按节流比例下降。只作用于尾段 ——
前面的段在本轮里不会再变，`up-markdown` 的 watch 本来就不会重新触发。流式结束时立刻
放开节流，不让最后一帧被吞掉。

**没有做**真正的线性化，两条路都被否掉了：

- 流式期间退化成纯 `<text>`：能把成本降到零，但用户会在流式过程中看到 `**bold**`、
  `- ` 这类原文。这是产品取舍，不该在性能改动里单方面决定。
- 把正文按空行切块、每个完成的块一个 key 稳定的 `up-markdown`：这才是 O(N) 的正解，
  但切块必须 fence-aware（切在 ``` 里会渲染出乱码），而这个环境里没法可视化验证，
  改坏的形态是「用户看到错乱的正文」而不是「慢一点」。

真正的线性化要改 `up-markdown` 自身，而它在另一个仓库（`D:/Repos/xyito/ultra-ui`），
不在这个 worktree 的改动范围里。

### 消息列表 / 会话列表的窗口化：没做

尾窗允许 230 轮，每轮是一棵富文本子树（`MessageBubble` + N 个 `up-markdown` +
`up-parse` 节点树），粗算一个详情页几千个组件实例。这是结构性改动（要处理滚动位置、
历史前插、锚点恢复的交互），需要单独排期，不适合塞在这一轮里。

审计里第 12 步的「part 层稳定 key」同理：`MessageBubble.vue:93` 现在还是 `:key="index"`，
而 `buildBubbleDisplayParts` 会折叠相邻 tool_call、流式结束时丢弃空 thinking part ——
分组边界一移动下标就整体错位。折叠态 `isThinkingCollapsed(index)` 也按下标存。
这条要和窗口化一起做（都要给 part 生成稳定标识）。

### `closedManually` 从未置 true：没动

`api/acp.ts` 的桥接重连链有三处检查 `bridge.closedManually`，但它只被赋 `false`，
从来没被置为 true —— 也就是重连没有终止入口，`destroyRealtimeTransport` 也无调用点。

这次**没有**加，理由是：现在没有任何调用方想停止重连。指数退避 30s 封顶的代价远低于
原先那条 1 Hz 轮询（已修），而切后台强行关桥会破坏「后台仍能收事件」——
`conversationTabBadgeService` 的注释表明那是有意保留的。加一个没人调的
`closeRealtimeBridge()` 只是增加未使用的 API 面。留作已知缺口。

### 其它留着的

- `GitDiffViewer` 逐行渲染无上限（每行 5 个节点 + grid + 每 hunk 一个 `scroll-view`）。
  加截断是 UX 取舍（「展开剩余」入口放哪、默认多少行），单独做。
- `index.vue` 那条**目前无消费者**的状态链（`detailStatusState` → … →
  `toolbarNoticeItems`，以及 `handleDetailStatusAction`）留着没删，只加了说明 ——
  不在性能改动里夹带删除。注释里写清了 `planTaskCount` 在抽屉关闭时为 0 只影响
  `long_wait` 的文案，以及将来接回 UI 时该怎么取数（别把常驻全表扫描加回去）。
- `conversationSyncService` 每事件两次归一化、`relayCheckpointStore` 每事件一次同步
  storage 往返 —— 后者已被 sqlite 那层的防抖间接缓解一部分，但它自己走的是
  `uni.*StorageSync`，仍是每事件一次。审计里是 P0/P1，这一轮没排上。

## 四、验证

- `jest`：**183 suites / 1948 tests 全绿**（改动过程中新增 26 条，改写 3 条）。
- `vue-tsc --noEmit`：**37 条既有基线错误**（全在 `uni_modules/up-tts/examples`、
  `pages/todos`、`services/appVersion` 的 `__APP_BUILD_TIME__` 上），改动文件零新增。
  改前是 38 条 —— 少的那条是 `subagentTranscripts` 从 `Map` 换成 `Record` 顺带修掉的。
- 三组基准数字来自跑在真实源码上的一次性探针（`node --experimental-strip-types`
  直接 import `.ts`），已删除，工作区干净。
- **没有**真机 profiler 验证。设备侧的换算（中低端 Android WebView 约为桌面 V8 的
  1/3～1/8）是经验系数。
- 两处纯 CSS/HTML 改动（`index.html` 的触摸监听、`._root` 的横向滚动）**没有**可视化
  验证条件。风险点是横向滚动的下移：代码块与 table 现在各自是滚动容器，若某个
  `up-parse` 节点树的形态不同于预期，超宽内容可能被裁而不是可滑。上真机时优先看
  「长代码块能否左右滑」和「宽表格能否左右滑」。

## 新增/改写的测试

| 文件 | 锁的契约 |
| --- | --- |
| `tests/api/acpStreamDelta.spec.ts`（新，6 条） | delta 原样透传：保留前后空白、纯空白 chunk 不丢、非字符串回落空串、`parentToolUseId` 仍 trim |
| `tests/api/acpFallbackPolling.spec.ts`（新，7 条） | 轮询的句柄/退避/停止：停掉后推进 60s 不得有新请求；web 模式永久停；成功一次回到基础间隔 |
| `tests/stores/persistStorage.spec.ts`（新，7 条） | 防抖适配器：突发合并成一次写、读要看得到还压在窗口里的值、可冲、冲完不重复写 |
| `tests/services/awaitingReplyStore.spec.ts`（+6 条） | version 只在表真变时移动；相同载荷、双空表都不动；实例之间独立 |
| `tests/pages/conversation-detail/detailRuntimePresentation.spec.ts`（改写） | `buildTimelineTailSignature`：常数长度、内容真变才变、role 编在第一段、大载荷不进签名 |
| `tests/pages/conversation-detail/detailMessagePresentation.spec.ts`（改写） | 合并项 key 稳定（尾串增长时不变）；content **引用共享**而非深拷贝 |
| `tests/pages/conversation-detail/detailToolCallStatusStyles.spec.ts`（改写） | `._root` 既不滚动也不带动量滚动；代码块自己是滚动容器 |
| `tests/stores/subagentLiveTranscript.spec.ts`（+2 条） | 容器身份跨 chunk 与回合边界保持稳定；未知会话返回同一个实例 |

## 原生 iOS / Android 复刻要点

审计那篇的 12 条仍然成立。这一轮补三条实践经验：

1. **「防御性深拷贝」在流式路径上是纯负债。** 加它的时候没有消费者需要它，删它的时候
   要花力气证明这一点。如果确实需要隔离，成本应该由那个要改数据的消费者付，
   而不是让每个 delta 都付。
2. **变更检测的返回值必须是标量。** 返回对象/数组的 getter 让框架的「值没变就短路」
   彻底失效，回调于是每帧都跑 —— 这比 getter 本身的开销更贵，也更难看出来。
3. **落盘要按静默期，不要按写入。** 同时必须给出显式的 flush 入口并挂到
   前后台切换/页面卸载上，否则防抖就是丢数据。

## 相关笔记

- [[2026-09-03-23-57-detail-streaming-performance-audit]] —— 审计、实测基线、17 步顺序
- [[2026-08-20-18-40-streaming-history-paging-and-no-polling]] —— `historyRuntimeFingerprint`
  那次同类问题（把整个实时正文塞进指纹）
- [[2026-07-12-detail-streaming-no-full-history-refresh]] —— 流式期间不再全量重拉历史
- [[2026-07-05-p64-detail-scroll-follow-guard]] —— 贴底跟随判定

