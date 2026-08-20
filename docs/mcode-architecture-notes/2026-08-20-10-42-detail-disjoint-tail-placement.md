# 详情页：认不出接缝时，按时间戳决定尾窗拼在前还是拼在后

**文件**：`2026-08-20-10-42-detail-disjoint-tail-placement.md`

## 现象（用户原话）

> 有问题，刚进详情页是对的，突然刷新出一个莫名奇妙的消息看着时历史消息加在实时对话
> 后边了。红框里继续往下都是错误加到后边的历史消息

截图里的阅读顺序是：最新的 assistant 回复 → 用户的新消息 → 我的回复 → **然后一整段
明显更早的历史**（一条「继续」用户气泡、"Plan mode exited"、"Baseline confirmed: 118
suites / 690 tests green" …）。也就是说**一页更早的历史被拼到了最新的实时内容之后**。

关键的两点观察：**刚进详情页时是对的**，是「突然刷新」之后才错位；**错位段的第一条是
用户消息**。这两点直接指向成因。

## 根因：null 接缝分支无条件把尾窗接在内存之后

`services/conversation/conversationTurnIdentity.ts` 的 `mergeTailIntoTurnsWithSeam`
原先是这样收尾的：

```ts
const preservedPrefix = currentTurns.slice(0, seam ?? currentTurns.length)
return {
  turns: prependHistoryPageTurns(tailTurns, preservedPrefix),
  seamIndex: seam,
}
```

`seam === null`（两段没有任何一条能互相认出）时 `preservedPrefix` 就是**整段**
`currentTurns`，于是权威尾窗被放到了内存时间线的**后面**。

这个分支原本被当成「历史被压缩重写」的罕见边界。**它其实是首次进入详情页的常态路径**
——三件事凑在一起，接缝必然找不到：

### ① 内存里往往只有实时轮次，它们**故意不带** `dedupeKey`

列表页的实时预览会预连接会话（`runLivePreviewAttach`），realtime 事件把轮次填进
`localTurns`。实时追加的轮次刻意不带 `dedupeKey` ——
`findInFlightUserTurnByContentSignature` 靠它的**缺席**区分「落库后换了 id 的同一条
prompt」和「排队发送的重复文本」，所以不能给它补上。于是它们的身份是 `i:<messageId>`。

### ② 服务端尾窗起点向前对齐到**用户轮次边界**

`codeg-plus/src-tauri/src/commands/turn_window.rs:30, 106-116` 的
`round_align_backward`：窗口起点只会**往前加**更早的轮次，`ROUND_ALIGN_CAP = 200`。
所以 `tailTurns: 30` 常常从一条更早的**用户消息**开始 —— 正是截图里那条「继续」。
这解释了为什么错位段的第一条是用户气泡。

### ③ 尾窗轮次的身份键与 ① 永不相等

尾窗里的 id 是解析器的 `turn-N`。`buildTurnDedupeKey` 对 `turn-` 前缀**退化成内容
指纹**（`fp:<role>:<hash>:<bucket>`），`isReversibleTurnId` 也拒绝把它反推成
`remote:turn-N`（下标派生的 id 在历史被压缩时整段平移，抬成身份键会误合并两条**不同**
的轮次 —— 那是静默丢消息，比重复更糟）。

所以 `i:<messageId>` 与 `fp:...` 两个键集合**不可能**相交，`seam` 必然是 `null`。

### 为什么错位会直接显形

时间线层**不做任何排序**：`stores/conversationTimeline.ts` 的
`buildConversationTimeline` 原样映射 `localTurns` 的数组顺序，`getMessages` 也不排。
所以数组里怎么拼，界面就怎么显示。

## 修法：身份键回答「是不是同一条」，时间戳回答「谁在前」

认不出同一条**不等于**答不出先后。`MessageTurn.timestamp` 在所有来源上都已被归一化成
number（`normalizeTurn` 解析字符串并在缺失时退回 `Date.now()`，
`mapPersistedTurnToMessage` 取 `turn.createdAt`），是这里唯一能跨来源比较的量。

```ts
const preservedPrefix = currentTurns.slice(0, seam ?? currentTurns.length)
if (seam == null) {
  return {
    turns: shouldPlaceTailBeforeCurrent(currentTurns, tailTurns)
      ? prependHistoryPageTurns(currentTurns, tailTurns)
      : prependHistoryPageTurns(tailTurns, preservedPrefix),
    seamIndex: null,
  }
}
```

判据是 `shouldPlaceTailBeforeCurrent`，三条刻意的设计：

| 决定 | 原因 |
| --- | --- |
| 比**尾窗最新一条**与**内存最早一条** | 只有尾窗**整段**都早于内存开头才敢前置。用最新对最早（而非首条对首条）要求两段在时间上真正不交叠 |
| 交错时维持原语义（尾部在后） | 两段时间上互相穿插时，任何一种整段摆放都是错的，不去猜一个交叉顺序 |
| 严格 `<` 而不是 `<=` | 相等意味着**分不出先后**（同一秒内的两条、时间戳精度不足），此时重排没有依据。见下文「回归教训」 |

时间戳拿不到（`NaN`）或为 `0` 时同样退回原语义。`0` 被显式排除：归一化在拿不到时间时
会退回 `Date.now()`，真正的 `0` 只可能来自缺字段的行,用它参与比较等于拿 1970 年当判据。

### `seamIndex: null` **一个字不改**

这是刻意的。`seamIndex` 的语义是「被原样保留下来的前缀条数」，被下游用来断言窗口坐标
能不能接上：

- `resolveRefreshedTailWindow` —— `null` 时放弃沿用旧的深窗口，改用尾窗坐标；
- `canApplyOlderHistoryPage` —— 用它校验下一页历史的接缝。

拼接方向变了，但「无法证明拼接后是连续的」这个事实没变。给它编一个数字会让一个永不
报错的空洞被判成合法。所以**所有窗口坐标逻辑保持原样**，这次改动只影响数组顺序。

## 调用点

`mergeTailIntoTurnsWithSeam` 的两个调用点：

| 调用点 | 尾部来源 | 是否本次故障路径 |
| --- | --- | --- |
| `pages/conversation-detail/index.vue:3091` `applyRemoteHistoryWindowDetail` | 服务端 30 条尾窗 | **是** |
| `stores/conversationRuntime.ts:1909` `reloadLocalTurns`（经 `mergeTailIntoTurns`） | 本地 SQLite 缓存 | 否 |

**这不是本地缓存那条路。** 本地轮次缓存默认**关闭**且读写双向 gate
（`readLocalTurnCacheEnabled()`），关闭时 `reloadLocalTurns` 原样返回
`session.localTurns`。用户命中的是远端路径,它有三个入口，全部汇入
`applyRemoteHistoryWindowDetail`：`ensureConversationHistoryWindow`、
`reconcileRemoteTurnsAfterLocalHydrate`、`reconcileRemoteTurnsAfterResume`。

后两个入口解释了「刚进来是对的，突然刷新」：进页面时先显示实时轮次，随后校准/恢复
拉回尾窗，那一刻错位才出现。

> 有意思的是 `services/conversation/localTurnCachePreference.ts` 的注释**早就预言了
> 这个故障模式**：「`mergeTailIntoTurns` 找不到接缝就把它们接在当前轮次后面，用户看到
> 的是一段错位的历史复活」。当时它被记为缓存路径的风险，没想到远端路径同样命中。

## 回归教训：`<=` 会打破一条既有测试，而那条测试是对的

第一版判据写的是 `tailNewest <= currentOldest`，
`tests/services/conversationTurnMerge.spec.ts` 的
「distinguishes no-overlap from full-coverage via a null seam」立刻红了：期望
`["a","b","z"]`，实际 `["z","a","b"]`。

原因是那个 spec 的 `keyed()` helper 给**每一条**轮次都设 `timestamp: 1` —— 全部相等，
`1 <= 1` 成立，于是整段被前置。**这不是测试的问题**：时间戳全等正是「谁在前」不可知的
情形，凭它调换一整段的位置只会把顺序搅得更乱。改成严格 `<`，两边同时满足。

这条边界已被 `detailHistoryPaging.spec.ts` 的
「does not reorder when both segments share one timestamp」锁住，防止有人再改回 `<=`。

## 测试

`tests/pages/conversation-detail/detailHistoryPaging.spec.ts` 新增
`describe("disjoint tail placement")`，6 条：

1. 整段更早的尾窗前置，且 `seamIndex` 仍为 `null`；
2. 真正更新的尾窗留在后面（正常刷新不受影响）；
3. 交错两段不重排；
4. 时间戳不可用（`0` / `NaN`）时退回尾部在后；
5. 两段共享同一时间戳时不重排（锁住严格 `<`）；
6. 有接缝时接缝优先于时间戳判据，且尾窗仍是权威来源（断言
   `merged.turns[1] === tail[0]`）。

**变异探针**：把条件替换成字面量 `false` 后，第 1 条失败并打印出**与用户报告完全一致
的形状** —— `["live-1","live-2","turn-7","turn-8"]`（期望
`["turn-7","turn-8","live-1","live-2"]`）。这证明测试不是空转，且确实复现了用户症状。
随后源码已恢复到字节一致。

三道闸：jest **122 suites / 790 tests 全绿**（基线 784）；
`tsc --noEmit` 仅剩既有的 3 条基线错误（`main.ts` 的 `App.vue`、`detailScrollState.ts`
两处缺失类型）；`uni build` 通过，仅剩既有的 `conversationSyncService` 动/静混合导入告警。

## 原生 iOS / Android 复刻要点

同一套逻辑必须逐条照搬，任何一条漏掉都会在原生端复现同样的错位：

1. **不要假设服务端尾窗与本地已有轮次能对上身份。** `turn-N` 是下标派生的，
   `round_align_backward` 又会让窗口从更早的用户轮次开始。原生端如果按 id 找接缝，
   结果同样必然是「找不到」。
2. **合并前先归一化时间戳成单一数值类型**（毫秒 epoch）。iOS 端注意 `Date` 与
   ISO8601 字符串混用、Android 端注意 `Instant` 与 `Long` 混用 —— 这是这套判据唯一
   依赖的量，类型不统一等于判据失效。
3. **判据要用「尾窗最新 vs 内存最早」+ 严格小于**，不要图省事比首条。交错的两段必须
   维持「尾部在后」，不要猜交叉顺序。
4. **时间戳不可用时保守退回原语义**，不要用 `0` / 缺失值参与比较。
5. **拼接方向变了，窗口坐标的「不可证明连续」状态不能变。** 原生端如果用一个整数
   表示接缝，务必保留一个独立的「无接缝」哨兵（`null` / `-1` / `Optional.empty`），
   不要用 `0` 兼任 —— `0` 的语义是「尾窗覆盖了整段内存」，与「两段不重叠」必须区分。
6. **时间线渲染层不要私自排序。** 顺序的权威在合并函数里；渲染层再排一次会掩盖合并
   的 bug，也会让「同一秒内的两条」在每次刷新时抖动。

## 待观察

- `buildConversationTimeline` 仍然完全不排序。本次修的是**拼接方向**，不是引入排序。
  如果将来发现单段内部也会乱序（例如服务端在同一窗口里给出非单调时间戳），那是另一个
  问题，不要靠在渲染层加 sort 来盖住。
- 尾窗对齐溢出（30 → 最多 230 条）意味着「更早的一段」可能相当长。本次前置的是**整段**
  尾窗，这在语义上是对的（它确实整段更早），但值得在长会话上确认一次滚动位置的观感。
