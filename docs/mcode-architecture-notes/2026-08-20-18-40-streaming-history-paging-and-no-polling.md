# 流式期间允许翻历史，删掉外部用户轮次的轮询校准

**文件**：`2026-08-20-18-40-streaming-history-paging-and-no-polling.md`

## 两个用户质疑，两次我错了

这篇记的两件事都是用户当场推翻我的判断后才查出真相的。两次的错法一样：**没查证就下结论**。

### 质疑一

> 这不行吧，正在流式也应该允许加载更早消息啊

我当时刚给「流式中不能翻页」这个限制加了个体面的文案（`blocked` 状态 +「回复生成中，稍后
可加载更早消息」），当成 bug 修完了。用户一句话点出：问题在**限制本身**，不在文案。

### 质疑二

> 应该有 WS 事件推送的吧，怎么可能必须轮询？

我前一条消息刚说过「ACP 事件流里没有『别人替你发了一条』这种帧，轮询是唯一手段」。
事实是 `AcpEvent::UserMessage`（`codeg-plus/src-tauri/src/acp/types.rs:436`）**早就存在**，
mcode-app 也**早就接了**（`api/acp.ts:1183` → `conversationRuntime.ts:513`）。我自己在
`conversationRuntime.ts:514` 写的注释就是「后端广播的 user_message 是所有客户端当前用户
轮次的唯一来源」。

## 一、流式期间允许翻历史

### 限制的来历：一个过度保守的指纹滚出来的雪球

`loadOlderTurns` 原先有两条早退守卫：

```ts
if (!hasOlderConversationHistory(historyWindow) ||
    hasVolatileHistoryRuntimeState(runtimeSession)) return
```

第二条是 `hasVolatileRuntimeState(session) || Boolean(session.inFlightUserTurnId)`。

追到根上不是「有人决定禁止流式翻页」，而是 `isCurrentOlderHistoryRequest` 里那个
`historyRuntimeFingerprint`——它把 `liveMessage.content` **整个**塞进 JSON 指纹：

```ts
liveMessage: runtimeSession.liveMessage
  ? [id, isStreaming, timestamp, runtimeSession.liveMessage.content]  // ← 每个 delta 都变
  : null,
```

流式期间每个 delta 都会改它，所以流式中发出的请求返回时**必然**被判废。入口那道守卫于是
成了顺理成章的「既然注定被丢弃，不如别发」。两个限制互相印证，看起来像设计 —— 这是这类
雪球最难拆的地方：每一层单独看都「有道理」。

### 前插其实不关心尾部

`prependHistoryPageTurns`（`conversationTurnIdentity.ts`）只做两件事：接到最前面、按身份
去重。流式期间尾部增长多少条都不影响它。

真正会让前插出错的只有**窗口坐标变化** —— 前插位置与 `canApplyOlderHistoryPage` 的接缝
断言全都建立在 `historyWindow` 上，而它由 `setConversationHistoryWindow` 独家维护，
流式事件一个字不碰。

所以校验收敛成三条，`historyRuntimeFingerprint` 与 `hasVolatileHistoryRuntimeState`
一并删除：

1. 还在同一个会话、同一个 runtime session、这个 tab 仍激活；
2. 窗口坐标一个字没变（`isSameHistoryWindow`）；
3. 就这些。

会话切换 / `resetConversationHistoryToLatest` 仍会让请求判废 —— 第 1、2 条会失败，
那正是它们该拦的。

### 连带修掉的 UI bug

守卫放宽前还出现过一个中间症状，用户报的原话：

> 出现松手加载更早消息后，完全没反应网络请求里也没记录

`canPull`（绑 scroll-view 的 `refresher-enabled`）当时只看 `hasMore`，而 `loadOlderTurns`
有两条守卫。于是窗口已建立、`turns_offset > 0`、但会话正在流式时，下拉能拽出「松手加载
更早消息」，松手后被第二条守卫**静默 return**。

**规则（双向的）：`canPull` 必须与 `loadOlderTurns` 的早退守卫逐条对应。** 守卫新增要同步
输入；**守卫放宽时这里也要一起放宽** —— 后者正是这次差点漏掉的方向。

## 二、删掉 1.5s 的全量校准轮询

### 它是旧后端的兼容层

`maybeBackfillExternalUserTurn` 挂在 **7 个**实时事件上（snapshot / status_changed /
stream_batch / tool_call / tool_call_update / permission_request / question_request），
带 1.5s 节流 + 4 次配额 —— 也就是流式期间反复全量拉取会话历史。

它自己的注释就说明了身份（`conversationRuntime.ts:1938-1940`）：

> 即使 captured 一直判不出来（如**旧后端**既不回报 in-flight 用户轮次 id，也不落地用户轮次）

对着现在的 codeg-plus，用户轮次有两条路都已铺好：

| 场景 | 服务端机制 | mcode-app 接入点 |
| --- | --- | --- |
| 进来**之后** PC 发的 prompt | `AcpEvent::UserMessage` 广播（`acp/types.rs:436`） | `api/acp.ts:1183` → `conversationRuntime.ts:513` |
| 进来**之前**已在跑的（mid-turn attach） | `pending_user_message` 挂在 attach 快照上（`session_state.rs:1544`，测试 `:2134` 锁死） | `conversationRuntime.ts:334-337` |

`applyRealtimeUserMessage` 自己把轮次插进 `localTurns`，**一行请求都不用发**。

而且轮询有害：每次拉回 30 条尾窗，沿途的 `reloadLocalTurns` 会把用户已翻到的 200 条砍回
一页 —— 它同时是「翻上去又被砍回来」的放大器。

### 剩下的真实缺口：快照不含历史

删干净之前得先确认一件事。`LiveSessionSnapshot`（`session_state.rs:1587`）里只有
`live_message` / `active_tool_calls` / `pending_permission` / `pending_question` /
`pending_user_message`——**没有历史轮次**。

所以观察者 mid-turn attach 时 `localTurns` 是空的，界面上 agent 在自言自语。这正是那条既有
测试锁住的场景（「本地消息为空时，即使已尝试过也不锁死守卫」）。

两个职责此前被混在同一个函数里：

| 职责 | 判据 | 处理 |
| --- | --- | --- |
| 追外部用户轮次 | 1.5s 节流 + 4 次配额 | **删** —— 被 `UserMessage` 取代 |
| 首屏历史兜底 | `localTurns.length === 0` | **留** —— 快照补不了 |

改名 `maybeBackfillMissingHistory`，判据收敛成 `localTurns.length === 0`。

**判据不能是「有没有拿到 in-flight id」**：那个由快照提供、必然有值，用它当判据这个函数
永不执行。拉到内容后 `localTurns` 非空，天然一次性，不需要 `Backfilled` 标志。

5 个 session 字段收成 2 个（`historyBackfillInFlight` / `historyBackfillGeneration`），
删掉 `MAX_EXTERNAL_TURN_BACKFILL_ATTEMPTS`。**竞态保护保留**：generation 自增让在途请求
的结果失效，避免旧快照把刚确认的用户轮次换走。

### 校准现在只剩两处

| 位置 | 触发 | 干什么 |
| --- | --- | --- |
| `maybeBackfillMissingHistory` | `localTurns` 为空且流式中 | 拉一次历史，一次性 |
| `calibrateAfterTurnComplete` | 每轮结束 | **只刷统计**，不碰 `localTurns` |

异常路径交给重连权威重取（见
[[2026-08-20-14-20-realtime-reconnect-authoritative-refetch]]）。

## 测试

- `conversationRuntime.spec.ts`：6 条 backfill 测试改写成 3 条 —— 锁配额/节流的删除
  （行为不再存在），保留「本地为空要拉一次」并改为断言**只拉一次**，保留「user_message
  到达后不拉」。
- `conversationDetailBodyContract.spec.ts`：新增「流式中 `canPull` 仍为真」+
  「`loadOlderTurns` 不再引用 `hasVolatileHistoryRuntimeState`」的源码断言。
- `detailHistoryIndicatorPresentation.spec.ts`：`canPull` 与守卫对应关系的用例。

三道闸：jest **124 suites / 814 tests 全绿**；`tsc --noEmit` 恰好 3 条既有基线错误
（`main.ts` 的 `App.vue`、`detailScrollState.ts` 两处），改动文件零错误；
`uni build` DONE，仅剩既有的 `conversationSyncService` 动静混合导入告警。

## 原生 iOS / Android 复刻要点

1. **不要把「正在流式」当成翻页的禁止条件。** 前插只依赖窗口坐标，与尾部是否在增长无关。
   原生端如果用一个「会话忙」的总开关挡住所有历史操作，会复现同一个体验问题。
2. **请求返回时的时效校验只能包含「会影响这次前插正确性」的量。** 把整个实时正文塞进
   指纹会让流式期间的请求 100% 判废 —— 而且它表现为「静默无反应」，不是报错，极难定位。
3. **交互可用性判据与执行守卫必须是同一套。** 原生端下拉手势的 enabled 与实际执行条件
   分开写，就会出现「能拉但不发请求」。这个对应关系是双向的。
4. **用户轮次靠推送 + attach 快照，不要轮询。** 两条路都要接：`UserMessage` 事件覆盖
   「进来之后」，快照的 `pending_user_message` 覆盖「进来之前」。
5. **但快照不含历史轮次。** mid-turn attach 且本地无历史时仍需拉一次，判据是
   「本地轮次为空」而不是「有没有 in-flight id」。
6. **异步补齐要有 generation 令牌。** 回合边界/权威事件到达后，在途请求的结果必须失效，
   否则旧快照会把刚确认的状态换走。

## 相关笔记

- [[2026-08-19-05-14-conversation-detail-tail-window-only]] —— 尾窗协议契约，含
  `round_align_backward` 的 30→230 溢出
- [[2026-08-20-10-42-detail-disjoint-tail-placement]] —— 认不出接缝时按时间戳定先后
- [[2026-08-20-17-08-history-indicator-guard-parity]] —— `canPull` 与守卫的对应关系
- [[2026-08-20-14-20-realtime-reconnect-authoritative-refetch]] —— 异常路径的补救
- [[2026-08-17-android-phone-realtime-user-message-authority]] —— `user_message` 作为
  用户轮次唯一权威来源的由来
