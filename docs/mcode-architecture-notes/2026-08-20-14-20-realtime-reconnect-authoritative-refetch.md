# 实时通道断开重连后重新获取会话列表

**文件**：`2026-08-20-14-20-realtime-reconnect-authoritative-refetch.md`

## 起因（用户原话）

上一轮我提议「把会话列表的轮询换成 `conversation://changed` 推送」，用户批准并加了一条约束：

> 好，但是要注意断开重连得重新获取

这条约束把一个「优化提案」变成了「**修一个既有漏洞**」。查下来推送**早就接好了**
（`services/conversation/globalConversationSync.ts`），真正缺的正是用户点出的那一半。

## 服务端契约：断线期间的事件不是延迟送达，是**从不存在**

codeg-plus 的 `/ws/events` 有三条叠加的事实（缺任何一条这个漏洞都不成立）：

1. **无订阅者时事件不入队。** `web/event_bridge.rs:48` 的 `if self.sender.receiver_count() > 0`
   与 `:59-61` 的 `if receiver_count() == 0 { return; }` —— 零客户端时事件**根本没被发出**，
   不是「发了没人收」。
2. **订阅是连接时才建立的。** `web/ws.rs:74` 的
   `let mut global_rx = state.event_broadcaster.subscribe();`。`tokio::sync::broadcast`
   的 receiver 只能看到订阅**之后**的消息。
3. **帧上没有任何 event id。** `WebEvent` 只有 `{ channel, payload }`
   （`event_bridge.rs:13-17`），所以客户端连「我漏了几条」都无从计算。

结论：**推送是纯增量，且缺口不可检测、不可补发。** 唯一可靠的补救是重连后回到全量。

## 现有恢复机制只覆盖了详情页轮次，一条摘要都没刷

| 机制 | 覆盖范围 | 缺口 |
| --- | --- | --- |
| relay `replay_miss` → `calibrateActiveConversationsForInstance`（`api/acp.ts:952`） | 只重取**已绑定活跃会话的详情**（`conversationSyncService.ts:231-246`） | 会话列表摘要完全不刷 |
| direct 模式 | —— | **无任何缺口检测** |

**direct 模式（局域网直连）比 relay 严重得多。** relay 侧有 1000 帧回放缓冲
（`mcode-relay/src/tunnel/hub.ts:43`）+ `replay_miss` 信号；direct 模式两者都没有：
`DirectGateway.connectEvents` 只声明一个参数（`services/gateway/directGateway.ts:85`），
`api/acp.ts:726-728` 传的 `lastEventId` 被**静默丢掉**（接口上 `options` 可选所以能编译过），
URL 也不带 query（`directGateway.ts:88`）。codeg-plus 全库 grep
`replay_miss|replayWindowStart|lastEventId` **零命中** —— 服务端从来没打算给 direct 做回放。

所以本次的触发条件必须两种模式都覆盖，不能只挂在 `replay_miss` 上。

## 改动

### 1. 判据：`shouldRefetchAfterBridgeRecovered`（`conversationListRefresh.ts`）

放进这个已有纯模块（同一职责：列表刷新的触发判据），而不是新建文件。

```ts
if (input.nextState !== "connected") return false
if (!previousState) return false          // 订阅后第一次回调 = 首连
if (previousState === "connected") return false
if (previousState === "idle") return false // 合成 idle 之后的 connected = 首连
return true
```

**`reconnectAttempt` 不能用。** `api/acp.ts:730-732` 在 `onReady` 里**先归零、再**发 health：

```ts
bridge.detachReady = eventConnection.onReady(() => {
  bridge.reconnectAttempt = 0
  this.emitBridgeHealth(targetKey, this.buildBridgeHealth(targetKey, bridge))
```

于是**任何** `state === "connected"` 的 health 都是 `reconnectAttempt: 0`，首连与第十次重连
在这个字段上完全无法区分。只能由订阅方自己记住上一个状态（`lastBridgeStateMap`）。

两个守卫都是必须的：`previousState` 为空挡掉订阅后的第一次回调；`!== "idle"` 挡掉
`subscribeRealtimeBridgeHealth` 在订阅瞬间推的那个合成 `idle`（`api/acp.ts:487`，桥接还不
存在时的默认值）—— 少了它，任何在桥接建立前挂载的订阅者都会在首连误触发一次全量重取。

判据形状与详情页已验证的那份一致（`pages/conversation-detail/index.vue:2708-2717` 的
`markBridgeRecovered` 分支），避免两处对「什么算恢复」给出不同答案。

> 顺带记一个观察到但**本次没修**的问题：同一次连接可能发出**两次** `connected` ——
> socket 在 `await connectEvents` 期间就已打开时，`onReady` 的同步回调与随后的
> `if (eventConnection.isOpen())` 分支（`api/acp.ts:748-758`）都会发一遍。判据里
> `previousState === "connected"` 那条守卫顺手挡住了重复触发，但根因还在。

### 2. 对账删除：`markMissingConversationSummariesDeleted`（`conversationRepository.ts`）

**为什么必须做对账，而不是只重取一遍。** 摘要缓存**从来没有** delete-not-present：

- `upsertConversationSummaries`（`:314-322`）是纯 `INSERT … ON CONFLICT DO UPDATE`；
- 唯一的删除是 `markConversationSummaryDeleted`（`:410-424`）打墓碑，而它**唯一的调用点**
  是 `conversation://changed` 的 `deleted` 分支（`globalConversationSync.ts:94`）；
- 更糟：`:359` 的 `deleted_at = excluded.deleted_at` 配合
  `mapConversationToSummaryRecord` 硬编码 `deletedAt: null`（`conversationOverviewSnapshot.ts:247`），
  远端 upsert 会**复活**本地墓碑。

所以断线期间在 PC 上删掉的会话，重连后纯 upsert **永远**清不掉那行：它会在 24h 活跃窗口内
一直显示成一张点进去 404 的卡，在历史面板里则是永久残留（历史面板不过滤时间窗）。

**⚠️ `presentIds` 为空时一行都不动 —— 这是本函数唯一能造成数据损坏的分支。**
`NOT IN ()` 会退化成「删掉该 folder 的全部会话」，而空响应最可能的原因是请求失败或该
folder 确实为空，两者都绝不该触发全清。必须在拼 SQL 之前就返回，连 SELECT 都不发。

> 同型错误这个仓库已经踩过一次：`pruneConversationTurnsToNewest` 的
> 「touches nothing when the cache is already within one page」测试注释里写着
> 「空集必须提前返回 —— 否则会拼出 `IN ()` 这种语法错误的 SQL」。那次是语法错误所以
> 会当场炸；这次是**语义**退化，SQL 完全合法，所以只会静默删数据。**更危险的变体。**

**对账范围必须严格限定在刚查过的 `folderIds` 内**，三条理由缺一条就会误删：

1. `list_all_conversations` 按 `folderIds` 过滤（`commands/conversations.rs:34-54` →
   `conversation_service::list_all`），响应**只对这些 folder 权威**。按实例全量对账会清掉
   「PC 上已关闭 folder」的会话。
2. `include_children` 服务端默认 false 且客户端从不传，**子会话/子智能体会话不在响应里**，
   绝不能被对账掉。
3. `listConversationSummaries` 本身就是按 `folder_id` 单查的（`:96`），逐 folder 对账与
   读取口径天然一致。

实现上先 SELECT 再 UPDATE，因为 `SqliteDriver.execute` 返回 `Promise<void>`
（`services/db/sqlite.ts:8`），拿不到 `rowsAffected`。多一次 SELECT 换一个真实的返回值 ——
调用方要靠它写日志，测试要靠它断言「空集合时一行都没动」。

id 直接拼进 SQL（`IN` 列表无法参数化成单个占位符），所以先 `Number.isFinite` + `> 0` 过滤、
`Math.trunc` 取整、`Set` 去重。空 `instanceKey` 也直接返回 0：那会让 WHERE 退化成跨实例
匹配，多连接场景下等于删别人的数据。

### 3. 权威重取入口（`pages/conversations/index.vue`）

`refreshConnectionGroupAuthoritative(instanceKey, reason)` 包一层
`refreshConnectionGroupFromRemote(conn, current, { reconcile: true })`。

**为什么选 `refreshConnectionGroupFromRemote` 而不是另外两个更近的入口：**

- 不用 `refreshOverviewFromRemoteByInstance`（`:2015-2041`）：它在页面不可见时直接早退、
  缓存缺失时静默 bail，而且复用**缓存的** folders/tabs —— 而 `folder://changed` 客户端
  **从未订阅**，断线期间 PC 上新开/关闭的 folder 只有重拉 `list_open_folder_details`
  才能发现。
- 不用 `loadOverviewData({ force: true })`：它的 `overviewLoadPromise` 是 promise 共享而非
  队列（`:1749-1751`），`force` 撞上正在飞的**非强制**加载时会被静默吞掉。绕开它就不受影响。

`reconcile` 标志一路传到 `loadRemoteConnectionSnapshot` → `persistConversationSummaries`。
`reconcileFolderIds` 取 `folders.map(f => f.id)` —— 与 `fetchRemoteConversations` 用来当
`folderIds` 的**同一个数组**，保证「对账范围 = 查询范围」在代码上就是同一个来源。

**实时推送路径绝不传 `reconcileFolderIds`。** 单条 `conversation://changed` 不携带
「该 folder 的全集」，拿它对账等于按一条消息删掉整个 folder。

### 4. 顺便接上 `conversations://bulk-changed`

服务端为批量导入刻意开了独立通道而非 `conversation://changed` 的第四种 kind，注释
（`event_bridge.rs:267-274`）写明了契约：

> Carries ids only — **clients respond with a single full refetch**

payload 是 `{ imported, updated, folder_ids }`（`:278-283`）。mcode-app 此前**零订阅**。
现在与重连重取共用同一个入口，只用它触发、不解析 payload。

### 5. 订阅生命周期

两个新订阅按 instanceKey 幂等挂载（`disposeBridgeHealthMap` / `disposeBulkChangedMap`），
挂在 `loadConnectionGroup` 与 `refreshConnectionGroupFromRemote` 里既有的
`ensureOpenedTabsSubscription` 旁边，`onUnload` 里一起 dispose 并清 `lastBridgeStateMap`。

**必须清理**：订阅活在 `acpApi` 的 `globalListeners` 里，该注册表与 socket 无关、跨重连
存活（`createRealtimeBridge` 复用 `existingState`，从不碰 `globalListeners`）。页面不清理，
反复进出列表页就会累积多份回调 —— 一次重连触发 N 次全量重取。

## 不改的部分

- **`replay_miss` 的现有行为一个字不动**。它管详情轮次，本次管列表摘要，两者不重叠；
  relay 模式下两条恢复路径都会跑，各做各的事。
- **不给 direct 模式补 event id / 回放**。那是协议级改动（要动服务端）。本次用
  「重连全量重取」这个更钝但正确的手段兜住。
- **不订阅 `folder://changed`**（客户端至今没订阅）。本次通过重拉
  `list_open_folder_details` 覆盖。
- **不动 15s 节流与 `overviewLoadPromise`**，见上文「为什么绕开」。
- **不修 `markConversationListDirty` 的语义**。它唯一的读者是 `onShow`（`:1505`），
  页面常驻可见时永不消费 —— 这正是「光标脏不够、必须自己发起重取」的原因。

## 测试

**`tests/services/conversationRepository.spec.ts`** 新增
`describe("markMissingConversationSummariesDeleted")` 5 例：只删远端未返回的行（并断言
三重范围限定 + 打墓碑而非 DELETE）；**空 `presentIds` 时连 SELECT 都不发**；无陈旧行时
返回 0 且不写；id 净化（`[7,7,9.8,NaN,-1,0]` → `IN (7,9)`）；空 `instanceKey` 拒绝执行。

**`tests/pages/conversations/conversationListReconnectRefetch.spec.ts`**（新文件）：
判据 5 例（error/reconnecting/polling → connected 触发；`null`/`undefined` 不触发；
`idle` 不触发；`connected → connected` 不触发；所有非 connected 目标态不触发）+ 3 条源码
契约断言（订阅接线且**不出现** `health.reconnectAttempt`；只有权威路径传 reconcile 且
`reconcileFolderIds` 来自 `folders.map`；卸载时 dispose）。

**两次变异探针，都命中且已恢复（`Get-FileHash` 逐字节一致）：**

1. 删掉 `if (presentIds.length === 0) return 0` → 「touches nothing when the remote
   returned an empty set」变红（12 例中 1 红）。
2. 删掉 `if (previousState === "idle") return false` → 「treats the synthetic idle seed
   as first connect」变红（8 例中 1 红）。

三道闸：jest **123 suites / 804 tests 全绿**（基线 791）；`tsc --noEmit` 恰好 3 条既有基线
错误（`main.ts` 的 `App.vue`、`detailScrollState.ts` 两处），改动文件零错误；
`npx uni build` DONE，仅剩既有的 `conversationSyncService` 动静混合导入告警。

## 端到端手测（未做，需要真机/模拟器 + 一台 PC）

- **direct 模式**：手机停在列表页 → 断开 PC 网络 10s → PC 上删掉一个会话、改另一个标题 →
  恢复网络 → 确认 ①被删的卡消失，②改名的卡更新，③**其它卡没被误删**（尤其是 PC 上已关闭
  folder 里的会话、以及子会话）。
- **relay 模式**：同上，另确认 `replay_miss` 与新重取同时触发时不出问题。
- **首连不误触发**：冷启动进列表页，确认日志里没有多余的
  `[conversation-list] reconciled stale summaries` 或权威重取调用。

## 原生 iOS / Android 复刻要点

1. **「没收到事件」不等于「没有事件」。** 服务端在无订阅者时根本不入队，帧上也没有序号。
   原生端不要试图用「最后收到的事件时间」推断缺口 —— 推不出来。唯一正确的做法是
   重连即全量重取。
2. **必须区分首连与重连，且不能依赖重连计数器。** 本端的 `reconnectAttempt` 在通知发出前
   已被归零。原生端若用 `URLSessionWebSocketTask` / OkHttp 的重连回调，同样要自己保存
   上一个状态；并且要处理「订阅瞬间的合成初始态」（本端是 `idle`），否则每次冷启动都会
   多一次全量拉取。
3. **对账删除必须按 folder 限定范围**，且**空集合绝不当成「全都该删」**。这是本次唯一能
   造成数据损坏的分支：`NOT IN ()` 语法合法、语义是全清、静默生效。
4. **子会话不在列表响应里**（`include_children` 默认 false），对账时必须排除，否则会把
   子智能体会话全删掉。
5. **两种传输模式的恢复能力不对等**：中继有回放缓冲与缺口信号，直连什么都没有。原生端
   若只在「有缺口信号」时重取，直连场景等于完全没修 —— 而直连恰好是丢事件最严重的模式。
6. **重连重取要连 folder 和标签一起拉**，不要只拉会话：`folder://changed` 客户端未订阅，
   断线期间的 folder 增删只能靠重拉 folder 列表发现。
7. **订阅注册表与 socket 解耦时，页面必须自己清理订阅**。跨重连存活的注册表 + 页面反复
   进出 = 回调累积 = 一次重连触发 N 次全量重取。

## 待观察

- **同一次连接发两次 `connected`** 的根因未修（见上文），目前靠判据的
  `previousState === "connected"` 守卫挡住。若将来有别的订阅者依赖 health 计数，会再暴露。
- **对账只在权威重取时发生**，所以「PC 上删了会话 + 手机端整个会话期间没有断线重连也没有
  批量导入」时，那行陈旧数据仍靠 `conversation://changed` 的 `deleted` 事件清理（正常路径）。
  如果发现仍有幽灵会话，要查的是那条事件有没有到，而不是加大对账频率。
- `mapConversationToSummaryRecord` 硬编码 `deletedAt: null` 会**复活**墓碑这件事本次没动。
  它与对账删除是一对矛盾力：对账打墓碑、下一次远端 upsert 又抹掉。目前不成问题（被删的
  会话不会再出现在远端响应里），但如果将来服务端开始返回软删除的行，这里会打起来。

## 相关笔记

- [[2026-08-20-09-05-conversation-list-time-only-ordering]] —— 同一个列表的排序与显示同源
- [[2026-07-12-conversation-list-pet-sessions-refresh]] —— `pet://sessions` 那条推送为什么
  必须走远端权威拉取（同型推理：增量 payload 表达不了「消失」）
- [[2026-08-20-10-42-detail-disjoint-tail-placement]] —— 详情页侧的「认不出接缝」问题，
  同样源于「推送与远端窗口两套身份对不上」
