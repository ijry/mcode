# 会话详情：全量查询下线，一律 30 条尾窗

日期：2026-08-19
适用端：mcode-app（uni-app + Vue3），同样适用于原生 iOS / Android 复刻实现

## 一、问题现象

手机端在**每次 agent 回复过程中**都在反复全量拉取整个会话历史。几百轮的会话，
每 1.5 秒传一遍全部轮次，还顺带把全表删掉重插一次。

## 二、根因：一条校准路径完全绕过了分页协议

详情页的历史分页协议（`buildTailHistoryRequest` → `tailTurns: 30`）只覆盖了 UI 层的
拉取路径。`api/acp.ts` 的 `getFolderConversation` 只发 `{ conversationId }`，不带任何
窗口选择器。

按服务端契约（`codeg-plus/src-tauri/src/commands/conversations.rs` 的
`resolve_turn_window_req`，`(None, None) => Ok(None)`），不带选择器意味着：

- 返回**完整**轮次列表；
- 四个窗口元数据字段因 `skip_serializing_if` 被**整体省略**，不是 null。

这条路径不是冷门分支：

```
turn_complete ─┬─→ calibrateAfterTurnComplete  (persistTurns: false)
               └─→ calibrateAfterReplayGap     (persistTurns: true)

流式期间 maybeBackfillExternalUserTurn 每 ≥1.5s 一次（每轮上限 4 次）
               └─→ calibrateAfterReplayGap     (persistTurns: true)
```

`persistTurns: true` 落到 `replaceCompletedTurns`（DELETE 全表 + 重插）。于是本地缓存在
「全量历史」（校准后）和「30 条尾窗」（`applyRemoteHistoryWindowDetail` 后）之间来回
摆动，取决于哪次写入最后落地。

## 三、协议事实（来源：`D:\Repos\xyito\lingyun\codeg-plus`）

以下四条都逐字核对过 Rust 实现，是复刻时最容易踩错的地方。

### 1. `tailTurns: 30` 实际可能返回 30~230 条

窗口起点会向前对齐到 user 轮次边界（`turn_window.rs` 的 `round_align_backward`，注释
明确 "alignment only ever ADDS earlier turns"），`ROUND_ALIGN_CAP = 200` 兜住溢出。

**所以绝不能假设 `detail.turns.length <= 请求的 tailTurns`。** 一切以服务端回报的
`turns_offset` / `turns_total` 为准。

### 2. `fromIndex` 永不对齐

因为客户端的 prefix 指纹必须与请求坐标可比 —— 一旦对齐，返回的 offset 就不是客户端
刷新时依据的那个坐标，两个 `prefix_hash` 无法互比。

### 3. clamp 是 `1..=500`（`MAX_WINDOW_TURNS`）

`tailTurns: 0` 会被 clamp 成 **1**，不是空窗口。>500 轮的会话**无法**用大 `tailTurns`
拿全量 —— 全量拉取在协议层面就已经被关掉了。

### 4. 窗口化响应里除 `turns` 之外的字段仍描述**完整**会话

`apply_turn_window` 只切 `turns`。`session_stats` 描述的是整个会话，不是这一页。

### 5. `prefix_hash` 与 `turns_offset` 是一组，不能拆开

`prefix_hash` 是对未覆盖前缀 `turns[0..turns_offset)` 按 `(role_tag, timestamp_millis)`
链式 FNV-1a 算出来的 16 位十六进制串（role tag：user=0, assistant=1, system=2）。
mcode **不在本地重算**，只做字符串比对。

推论：把 `turns_offset` 单独往前挪 N 条而保留原 `prefix_hash`，就得到一个自相矛盾的
三元组。`canApplyOlderHistoryPage` 里的
`page.prefix_hash_before_index === current.prefix_hash` 会变成两个不同坐标上的哈希互比，
**永远不可能相等** —— 分页静默退化成整页重载。

## 四、改动

### 1. 让全量查询无法被表达（`api/acp.ts`）

```ts
async getFolderConversation(
  conversationId: number,
  window: ConversationTurnWindowRequest = {}
): Promise<ConversationDetail> {
  const selector =
    window.fromIndex != null
      ? { fromIndex: window.fromIndex }
      : { tailTurns: window.tailTurns ?? DEFAULT_CONVERSATION_HISTORY_PAGE_SIZE }
  return await this.request("/get_folder_conversation", { conversationId, ...selector })
}
```

两点刻意的写法：

- 兜底在**函数体**里，不在签名默认值上。默认参数只在实参为 `undefined` 时生效，
  显式传 `{}` 会绕过它 —— 而 `{}` 恰好就是「不带窗口」那个我们要禁掉的形态。
- 两个选择器**互斥**（服务端对同时提供会直接报错），所以是 `if/else` 选一个，
  不是两个条件展开。`fromIndex` 优先：它是翻页坐标，更具体。

### 2. 三个只读元数据的调用点 → `tailTurns: 1`

| 位置 | 函数 | 实际只读 |
|---|---|---|
| `pages/conversations/index.vue` | `seedCreatedConversationSummary` | summary / title / folderId / agentType / status，**完全不读 turns** |
| `pages/conversations/index.vue` | `shouldSkipCreatePromptReplay` | 只判 `turns.length > 0` |
| `services/conversation/globalConversationSync.ts` | `resolveConversationFolderId` | 只读 `summary.folderId` |

用 `METADATA_ONLY_CONVERSATION_TAIL_TURNS = 1`，不是 0（0 会被 clamp 成 1，写 1 更诚实）。

### 3. 统计口径：窗口化时不用 `turns` 兜底

`deriveSessionStatsFromConversationDetail` 现在先判 `isWindowedConversationDetail`：

- `usage`：窗口化且 `session_stats.total_usage` 缺失 → 返回 `null`，调用方
  （`applyConversationDetailStatsToSession`）保留已有的 `session.stats`，不用尾窗累加
  冒充全量；
- `turnCount`：窗口化时取 `turns_total`，不取 `turns.length`（后者因为向前对齐可能是
  30~230 的任意值）。

### 4. 坍缩修复（本次最危险的点）

**策略前提：本地缓存只保留最新一页；往上翻页得到的更早历史不落库，永远走远端重新
拉取。** 这个决定让 `replaceCompletedTurns` 的 DELETE-all 语义反而变正确了 ——
它本来就该表达「缓存 = 最新一页」。

代价是：任何「用一页刷新时间线」的写入，如果是**整体替换**，就会把用户往上翻出来的
历史砍掉。两个来源都犯了这个错：

| 写入点 | 尾部来源 | 旧行为 |
|---|---|---|
| `reloadLocalTurns`（runtime store，4 个赋值点） | SQLite 缓存 | `localTurns = 缓存页` |
| `applyRemoteHistoryWindowDetail`（详情页，4 个调用点） | 服务端 30 条尾窗 | `localTurns = normalizeTurns(detail.turns)` |

两边的守卫都挡不住：

- `areLocalTurnsEquivalent` 在 `a.length !== b.length` 时直接返回 `false`，
  坍缩被当成「有变化」照样写进去；
- `hasVolatileRuntimeState` 只看 in-flight / liveMessage / pending，**不看翻页深度**。

修法是共用一个合并函数 `mergeTailIntoTurnsWithSeam`
（`services/conversation/conversationTurnIdentity.ts`）：在内存时间线里找到第一条被尾部
覆盖的轮次，它之前的部分原样保留，从那条起交给尾部（尾部是权威来源，携带最新状态与
规范 id）。因为 `memory[seam] === tail[0]`，只要内存本来连续，拼出来也一定连续。

身份判定必须优先 `dedupeKey`，不能只看 `id` —— 缓存那份是 `turn:<hash>`，远端那份是
`turn-N`，只按 id 比对认不出接缝，会在列表顶部重复插入一份（就是
[2026-08-18 的消息重复](2026-08-18-19-56-conversation-detail-turn-identity-dedupe.md) 那个 bug）。

### 5. 窗口坐标必须与轮次成对更新

`applyRemoteHistoryWindowDetail` 有两条分支，**两条都要保证「窗口坐标」与「内存轮次」
描述的是同一条时间线**。这是本次改动里最容易只修一半的地方。

#### 5.1 轮次被合并（`preserveRuntimeTurns === false`）

保住前缀就意味着内存时间线**比尾窗更深**，尾窗自带的 `turns_offset` 不再描述它的起点。
按第三节第 5 条，这里**不能做算术修正**。所以只有两种合法组合，**挑一个**，不做任何拼接：

```
接缝能证明连续（previous.turns_offset + seamIndex === incoming.turns_offset）
  → 保住前缀 + 沿用旧窗口（它本来就描述 localTurns[0]，而合并后头条仍是同一条），
    只把 turns_total 提到较大值
其余情况（没有旧窗口 / 没找到接缝 / 缺口对不上）
  → 丢掉前缀，采用尾窗的轮次和窗口
```

**关键点：轮次和窗口是同一个决定。** 判定收敛在 `canKeepPreviousTailWindow`，
`index.vue` 用它同时决定 `localTurns`（`keepPrefix ? merged.turns : remoteTail`）和
`setConversationHistoryWindow` 的入参。

第二种情况下**绝不能只换窗口而留着前缀**。本次第一版就是这么写的，理由是「偏浅的
offset 只会让下一页多回一些已有轮次，`prependHistoryPageTurns` 会按身份去重」——
**这个前提是错的**：去重是**先到先留**，而历史页被放在**最前面**
（`[...olderTurns, ...currentTurns]`），所以一段已在内存里的轮次会被**搬到列表头部**，
不是被忽略。窗口说 offset 是 200 而 `localTurns[0]` 其实是全局第 0 条时，点一次
「加载更早」就会把第 170~199 条搬到最顶上，时间线错乱，且每点一次更乱。

而且那个空洞是**不可恢复**的：没有任何请求能填上「前缀结尾 → `incoming.turns_offset`」
之间那段。宁可丢掉前缀（用户往上滑还能重新翻回来），也不要留一个永不报错的错位时间线。

为此 `mergeTailIntoTurnsWithSeam` 显式返回 `seamIndex`，且 `null` 与 `0` 严格区分：

- `0` —— 尾部覆盖了整段内存（或内存本来是空的）；
- `null` —— 两段完全不重叠，**无法证明拼接后连续**。

调用方不要用 `turns.length - tailTurns.length` 反推接缝：合并会去重，两个数字不总是差
这么多。

#### 5.2 轮次被原样保留（`preserveRuntimeTurns === true`）

流式中 / 有 in-flight 用户轮次 / detail 自带 in-flight 标记时，`localTurns` 一个字都不动。
这条分支起初仍然把窗口整体换成了尾窗 —— **代码和它自己的注释矛盾**（注释写着「窗口坐标
也不能动」）。后果比 5.1 更隐蔽：

轮次没动，所以旧窗口仍然**精确**描述 `localTurns[0]`。换成尾窗后 `turns_offset` 从 90
被打回 150，而内存里实际还是从第 90 条开始。接下来点「加载更早」会去请求
`beforeIndex: 150` 那一页 —— 拉回来的 30 条全都已经在内存里，`prependHistoryPageTurns`
按身份全部去重，列表**一条都不增加**。用户看到的是「按钮点了没反应」，要连点 2~3 次
（90→120→150）才重新开始出新内容。既不报错也不留空洞，纯粹是白拉几页。

所以这条分支走 `resolvePreservedTurnsWindow`：轮次没动 → 旧窗口整组留下，只允许刷新
`turns_total`（尾窗刷新唯一带来的新信息就是总数可能变多了）。没有旧窗口时
（首次加载 / `clearCachedSessionState` 之后）才采纳尾窗自己的那一组。

#### 5.3 接缝被**否证**时必须连轮次一起丢（`resetConversationHistoryToLatest`）

5.1 / 5.2 的原则是「连续性**无从证明**时宁可重复也不丢消息」。但有一条路径正好相反：
`canApplyOlderHistoryPage` 断言失败 —— 服务端回的 `prefix_hash_before_index` 与我们记的
`prefix_hash` 不符，也就是**已经证明**内存里的前缀是陈旧的（历史被压缩重写了）。

`ConversationDetailInteractivePane.vue` 的 `requestLatestHistoryWindow` 走的是这条路。
它过去只清窗口，靠重载路径的**整体替换**顺手把陈旧轮次冲掉。改成合并之后，这个隐含依赖
断了：陈旧轮次会被 `mergeTailIntoTurnsWithSeam` 当成「要保住的前缀」留在列表顶部，和刷新
出来的新轮次并排显示。

更糟的是它还会**永久卡死「加载更早」**：轮次没清 → `hasRenderableRuntimeState` 仍为 true
→ 重载走热路径、没人调 `setConversationHistoryWindow` → `historyWindow` 一直是 null
→ `hasOlderConversationHistory(null)` 恒为 false → 按钮在本次访问剩余时间里**整个消失**。

所以新增 `resetConversationHistoryToLatest`：`localTurns = []` **且** `historyWindow = null`，
让重载走冷路径重新水合最新一页。**「连续性不可证明」与「连续性已被否证」必须区别对待。**

### 6. 同一条轮次的跨来源身份（详情页「消息重复 2 次」的真正根因）

改成合并之后冒出一个用户可见的回归：详情页里**首条用户消息显示两遍**，而且一直粘在列表
顶部，直到切走再切回来。

根因不在合并逻辑，在身份键：

| 副本 | `id` | `dedupeKey` | 基础身份键 |
| --- | --- | --- | --- |
| 实时追加 | `<messageId>` | **无** | `i:<messageId>` |
| SQLite 缓存 | `turn:<hash>` | `remote:<messageId>` | `k:<role>:remote:<messageId>` |

两个键不相等，于是认不出接缝 → 拼接 → 重复。

实时轮次**不能**补上 `dedupeKey`：`findInFlightUserTurnByContentSignature` 正是靠它的
**缺席**来区分「落库后换了 id 的同一条 prompt」和「排队发送的重复文本」（连续两次「继续」
不该被合并）。

修法是 `resolveTurnMergeIdentityAliases`：把 `buildTurnDedupeKey` 那一步**原路反推**回去。
`remote:<X>` 只可能由 `turnId === X` 生成，两者指的必然是同一条轮次 —— 这是**等价关系**，
不是启发式猜测。每条轮次因此给出一到两个键，任意一个撞上就算同一条。
`prependHistoryPageTurns` 与 `mergeTailIntoTurnsWithSeam` 都改用别名集合。

**别名必须严格等于「原来的单键 + 这一条反推」，不能顺手多加。** 两条边界：

- `turn-N` 形式的 id **不参与反推**：`buildTurnDedupeKey` 对它退化成内容指纹，
  所以 `remote:turn-N` 这个键根本不存在。
- 带 `dedupeKey` 的轮次**不把自己的 `id` 加进别名**。缓存那份的 id 是由 dedupeKey 派生的
  `turn:<hash>`（加了等于没加），而远端解析器那份是 `turn-N` —— 按下标派生、历史被压缩
  重写时**整段平移**（见[轮次身份笔记](2026-08-18-19-56-conversation-detail-turn-identity-dedupe.md)）。
  把 `turn-N` 抬成身份键，两条**不同**的逻辑轮次会因为 id 恰好漂到同一个值而被误合并，
  那是**静默丢消息** —— 比重复严重得多。

> 走过的弯路：第一版是在 `mergeTailIntoTurns` 里加「找不到接缝就整体采用尾部」。它能压住
> 重复，但代价是**丢掉用户翻出来的前缀**（尾部只有一页），而且会静默吃掉身份不可知的
> 轮次 —— `does not collapse identity-less turns into one another` 这条既有测试当场变红，
> 正好把这个副作用暴露出来了。修身份键比在合并层打补丁更根本。

### 7. 删掉两处死代码

- `calibrateConversationDetail`（`conversationSyncService.ts`，`persistTurns: true`）——
  零调用点，只有历史设计文档引用。留着就是个「全量拉取 + 全表替换」的活雷。
- `insertCompletedTurns`（`conversationRepository.ts`）—— 零调用点。

## 五、分层约束（两次踩到）

`src/{api,services,stores}/**` 里**零** `@/pages` import，这是既有不变量。计划里两次
写了「复用 `pages/conversation-detail/detailHistoryPaging.ts` 的常量 / 函数」，两次都会
反转分层。做法是把共享契约下沉到 `services/`，页面模块 re-export 保持既有引用点不变：

- `services/conversation/conversationHistoryWindowContract.ts`（新增）——
  `DEFAULT_CONVERSATION_HISTORY_PAGE_SIZE` / `METADATA_ONLY_CONVERSATION_TAIL_TURNS` /
  `ConversationTurnWindowRequest` / `isWindowedConversationDetail`；
- `services/conversation/conversationTurnIdentity.ts`（已存在）——
  `resolveTurnMergeIdentityAliases` / `prependHistoryPageTurns` / `mergeTailIntoTurnsWithSeam`。
  注意基础单键（`resolveTurnBaseMergeIdentity`）**故意不导出**：单键不足以认出同一条轮次的
  实时副本与缓存副本，导出就是给调用方留坑（第四节第 6 条）。

`conversationTurnIdentity.ts` 之所以是独立纯模块，见
[轮次身份笔记](2026-08-18-19-56-conversation-detail-turn-identity-dedupe.md) 第四节：
`conversationDetailPersistence` 顶层 import 了 `services/db` → `sql.js` 的
`?url` 后缀，只有 Vite 能解析，jest 下会让整个模块加载失败。

## 六、必须守住的不变量

- **任何 `get_folder_conversation` 调用都必须带窗口选择器。** 新增调用点时不要传空
  对象，走默认值或显式给 `METADATA_ONLY_CONVERSATION_TAIL_TURNS`。
- **`turns_offset` / `prefix_hash` / `assistant_turns_before_offset` 永远来自同一次响应。**
  这三个字段可以整组替换，绝不能各自替换或做算术修正。
- **窗口坐标与内存轮次必须同时更新，且描述同一条时间线。** 轮次没动 → 窗口不许动
  （只放行 `turns_total`）；轮次合并了 → 窗口按接缝能否证明连续来二选一，且**轮次与窗口
  是同一个决定**（共用 `canKeepPreviousTailWindow`）。不允许「窗口浅、时间线深」这种组合
  —— 它不报错，但下一次「加载更早」会把已有轮次搬到列表头部，且空洞不可恢复。
  这几件事分散在同一个函数的两条分支里，改一条时必须回头看另一条。
- **「连续性无从证明」与「连续性已被否证」要分开处理。** 前者保住前缀（宁可重复不丢消息），
  后者（`canApplyOlderHistoryPage` 哈希不符）必须连轮次一起丢
  （`resetConversationHistoryToLatest`）。
- **同一条轮次的跨来源身份靠别名集合判定**（`resolveTurnMergeIdentityAliases`）。
  实时副本没有 `dedupeKey` 是**故意**的，不要「顺手补上」——
  `findInFlightUserTurnByContentSignature` 依赖它的缺席。
- **不能假设返回条数 ≤ 请求条数**（向前对齐，30 → 最多 230）。
- **窗口化响应的非 `turns` 字段描述完整会话**，不要拿尾窗算全量统计。
- 历史分页仍是「远端唯一、仅内存」：更早的页**不写 SQLite**。
- 缓存刷新与远端对账都必须**合并**而非替换，且身份判定优先 `dedupeKey`。

## 七、后续（已在后一批改动中完成）

本次写完时留了一个待观察项：`persistCompletedTurns` 用 `insertCompletedTurn` 单条插入、
**无裁剪**，所以 SQLite 里的缓存会缓慢超过 30 条 —— 读取侧被 `getNewestTurns` 的 LIMIT
兜住，功能上无影响，只是磁盘占用持续增长。

**这一项已经补上了**：新增 `pruneConversationTurnsToNewest`，追加路径插入后裁、全量替换
路径在同一个事务内裁，「缓存 = 最新一页」由此从读取侧的巧合变成落盘事实。实现约束
（排序键必须与 `getNewestTurns` 逐字一致、先删 part 再删轮次、事务不可嵌套）见
[[2026-08-19-18-32-conversation-detail-local-turn-cache-toggle]]。

同一篇也落实了另一个当时「已决定但尚未实现」的设置项：把「本地缓存最新页」做成实验性
开关、默认关闭。

## 八、原生 iOS / Android 复刻要点

- **默认就带 `tailTurns`。** 客户端不要提供「不带窗口」的调用形态；这是唯一能触发
  服务端 legacy 全量分支的方式，而它在长会话上是灾难性的。
- **不要用返回条数推断窗口位置。** 向前对齐会让 30 变成任意 30~230。位置一律用
  `turns_offset`，全局下标用 `turns_offset + 数组位置`。
- **窗口三元组当作不可分割的值对象。** 建议在类型层面就不给单字段 setter
  （Swift `struct` + `let`，Kotlin `data class` + `val`），只允许整组替换。
- **prefix_hash 不要本地重算。** 只做字符串比对。若坚持要算，必须与 Rust 侧逐字一致：
  链式 FNV-1a over `(role_tag, timestamp_millis)`，role tag user=0 / assistant=1 /
  system=2，输出 16 位十六进制。
- **`tailTurns: 0` 不是空窗口**（clamp 到 1）。要「只读元数据」就传 1。
- **缓存策略要和刷新逻辑配套。** 若也采用「缓存只存最新一页」，那么每一处「用一页刷新
  时间线」的代码都必须是合并而非替换，否则就会复现本文的坍缩。合并时的身份键必须与
  来源无关。
- **「只存一页」要在写入侧强制，不能只靠读取侧的 LIMIT。** 逐条追加的写入路径必须自己
  裁剪，否则会得到一个静默的存储泄漏：读不到、看不出、只是一直变大。裁剪的排序键必须
  与读取查询逐字一致 —— 否则「读取侧认为的最新一页」和「裁剪侧保留的一页」是两个集合，
  刚写进去的轮次可能当场被删。
- **同一条轮次在不同来源下的 id 形态不同，身份判定要能互认。** 原生端同样会遇到
  「乐观追加的那份」与「落库后读出来的那份」id 不一致（本文第四节第 6 条）。要么让两侧
  共享一个显式的 client-side turn uid，要么像本次一样把落库时的键变换**可逆**地反推回去。
  只按单个 id 比对必然出现首条消息重复两遍。
- **统计数字取 `session_stats` / `turns_total`**，不要遍历当前页累加。

## 九、验证

- `npx jest --config jest.config.cjs --runInBand` → 116 suites / 664 tests 全绿
  （基线 114 / 629）。
  > 注：`tests/pet/petMotionEngine.spec.ts` 偶发失败，与本次改动无关 ——
  > `services/petMotionEngine.ts` 的加权随机选择用了未打桩的 `Math.random()`。
- `npx tsc --noEmit -p tsconfig.json` → 仅剩 3 条既有错误（`App.vue` 模块声明、
  `detailScrollState.ts` 两个全局类型），改动文件零错误。
- `npx uni build` 通过（`conversationSyncService` 的动静混合 import 警告为既有问题）。
- 新增覆盖：
  - `tests/api/conversationTailWindow.spec.ts`（新建）——默认发 30 条尾窗、元数据窗口
    为 1、空对象不退化成全量、两个选择器互斥、`undefined` 不上线。
  - `tests/services/conversationTurnMerge.spec.ts`（新建）——`dedupeKey` 跨来源认同、
    角色不混淆、身份不可知时不去重（宁可重复也不丢消息）、`seamIndex` 的
    `null` / `0` 区分、输入不被修改；**外加身份别名四例**：实时副本与缓存副本互认、
    `turn-N` 不参与反推、带 `dedupeKey` 的轮次不暴露 `turn-N` 作身份（防误合并 →
    静默丢消息）、缓存读空时不清空时间线。
  - `tests/pages/conversation-detail/detailHistoryPaging.spec.ts`——
    `isWindowedConversationDetail` 判定（offset 0 / 缺字段 / 非字符串哈希）、
    尾窗刷新后 `canApplyOlderHistoryPage` 仍成立、连续性不可证明时退回尾窗、
    **轮次原样保留时窗口不被打浅**（`resolvePreservedTurnsWindow` 三例）。
  - `tests/stores/conversationRuntime.spec.ts`——窗口化统计口径三例；
    **坍缩回归**：内存 200 条 + 缓存 30 条，`turn_complete` 后长度为 202、
    最早一条 id 不变、接缝与新消息都不重复。该测试已确认对旧实现失败
    （得到 30 条），不是空测；外加接缝被否证时
    `resetConversationHistoryToLatest` 连轮次一起清掉。

端到端手测（模拟器，待执行）：开一个长会话 → 往上翻 3 页 → 发一条消息 → 确认
① 列表没有跳回底部只剩 30 条，② 「加载更早」仍可继续翻，③ 顶部 token / 轮次数不缩水，
④ 首条用户消息只出现一次（第四节第 6 条那个重复）。
