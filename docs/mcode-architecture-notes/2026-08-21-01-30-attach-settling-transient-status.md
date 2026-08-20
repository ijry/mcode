# 冷启动进入正在重试的会话：不再显示成「一切正常」

**文件**：`2026-08-21-01-30-attach-settling-transient-status.md`

## 现象（用户原话）

> MCode 打开一个正在 504 重试的会话，一开始是不显示这个重试报错的，但是过了一会却又显示了，
> 我感觉是冷启动无法获取错误，但是等了一会错误里的自动重试进入下一轮或者是其他什么事件监听
> 才让 MCode 获得了报错

用户的推断**完全正确**，而且比我当时给出的答案准确。我上一轮刚说过「冷启动进入一个已失败的
会话现在能看到原因了」—— 那句话说得太满，只对 `last_error` 成立，对重试横幅不成立。

## 根因：重试横幅是瞬态的，服务端刻意不放进快照

`codeg-plus/src-tauri/src/acp/session_state.rs:1183-1184` 写得很直接：

> `TurnRetrying` 与 Claude 的 `api_retry` 一样是前端瞬态提示（重试横幅），**不进快照**
> —— 回合边界会清除它

Claude 那条更彻底：它不是一个 `AcpEvent` 变体，而是 `AcpEvent::ClaudeSdkMessage` 转发的**原始
SDK 消息**（`connection.rs:9607-9634` 的 `is_claude_api_retry_message` 按
`type=system` + `subtype=api_retry` 识别）。纯转发、不落库、不进 `SessionState`。

所以时间线是：

| 时刻 | 手机端能拿到什么 |
| --- | --- |
| attach 那一刻 | 快照里**没有**重试字段 → 横幅不显示，胶囊显示「思考中」 |
| 下一次 `api_retry` 事件 | 才第一次拿到 → 横幅出现 |

而重试是**指数退避**的（首个间隔约 0.5s，之后翻倍），那个空窗可能有好几秒。期间界面显示
「思考中」，读起来像一切正常 —— 实际上远端正在 504 重试。

## 顺手修掉一个加重症状的 bug

`hydrateLiveSnapshot` 里有一行 `session.apiRetry = null`。

如果打开时恰好刚收到一次 `api_retry` 事件、紧随其后快照才到，这行会把它**清掉** ——
横幅先闪一下又消失，比一开始就没有更让人困惑。

「快照里没有这个字段」≠「重试已经结束」。服务端刻意不放，拿它当权威去清空是把
「缺省」误读成「否」。冷启动时 `apiRetry` 本来就是 null 无需清；已经有值时那个值来自比快照
更可信的实时事件。

## 修法（方案 A：接受空窗，但不让它误导）

服务端不改的前提下这个空窗**消不掉**。但至少不该在这几秒里给出「一切正常」的暗示。

新增 `attach_settling` 状态码：attach 后 3 秒内、且远端正忙（`thinking` / `running_tool`）时，
胶囊显示「正在同步远端状态...」而不是「思考中」。

### 分支优先级是需求的一部分

它排在：

- `long_wait` / `thinking` / `running_tool` **之前** —— 否则永远走不到；
- 所有真实错误、`api_retry`、等待授权/选择**之后** —— **只要拿到了任何确切信息，就不该再
  显示这条模糊文案**。它是「还不知道」的占位，不是「正在忙」的同义词。

这条顺序被测试锁住了。变异探针：把这个分支移到 `runtimeErrorText` 之前 →
「never overrides a concrete signal that already arrived」立刻变红。探针后源文件
`diff` 校验字节一致。

### 窗口长度取 3 秒

Claude 重试首个间隔约 0.5s 且指数退避，3s 足够让第一条 `api_retry` 到达。再长就会在**正常**
会话上白挂一条噪音文案 —— 每次进详情页都先看到「正在同步远端状态」是更糟的体验。

### 状态类保持 `running`

`buildRuntimeStatusClass` 对 `attach_settling` 返回 `running`（不是 `idle`/`error`）：它仍然
表示「远端在跑」，转圈动效要延续。返回别的值会让胶囊在这 3 秒里闪成灰色再变回来。

### attach 时刻记在页面层，不进 store

`detailAttachedAtMap`（`pages/conversation-detail/index.vue`）按会话记录最近一次 attach 时刻，
`attachElapsedMs` 复用既有的 `longWaitTick`（1s 间隔、`thinking`/`running_tool` 时本来就在跑）
驱动重算，不再起第二个计时器。

**不放进 `RuntimeSession`**：它是纯 UI 的过渡窗口，与运行时状态无关，落进 store 会被当成
需要持久化的东西（`persistDetailRuntimeState` 会把 session 字段写进缓存）。

`hydrateLiveSnapshot` 有 **5 个**调用点，所以包了一层 `hydrateDetailSnapshot()`
统一记录时刻，而不是在 5 处各加一行 —— 漏一处那条路径就没有过渡态，且以后新增的调用点
自动覆盖。会话关闭时 `detailAttachedAtMap.delete()` 防止无界增长。

## 空窗仍然存在（已知限制）

这次修的是「不再误导」，不是「消灭空窗」。要真正消灭它需要服务端把重试状态放进快照
（`SessionState` 加 `last_api_retry`，像 `last_error` 那样），那是 codeg-plus 侧的改动。

另一个**尚未利用**的现成通道：快照里**有** `session_failures`
（`session_state.rs:1671-1677`，注释明确写着「A client attaching mid-session seeds its reducer
from this」），带 `category: "limit"` / `actions: ["retry"]`。它承载 JetBrains AIR 的失败记录，
对 Claude 无效，但如果接入 AIR agent，那条路是现成的 —— mcode 目前完全没读。

## 测试

`tests/pages/conversation-detail/detailStatusPresentation.spec.ts` 新增
`describe("attach settling window")`，5 条：

1. attach 后 800ms + `thinking` → `attach_settling`，文案与 `loading: true`；
2. 5000ms（超窗）→ 退回 `thinking`；
3. **确切信息优先**：同一个窗口内分别给 `runtimeRetryText` / `runtimeErrorText` /
   `waiting_permission`，三者都必须压过它（锁死分支顺序）；
4. `idle` 时不挂（空闲会话没有「远端在忙」这回事）；`attachElapsedMs` 缺省时保持原行为；
5. 状态类是 `running`、标签是「同步中」（不闪灰）。

三道闸：jest **124 suites / 835 tests 全绿**；`tsc --noEmit` 恰好 3 条既有基线错误
（`main.ts` 的 `App.vue`、`detailScrollState.ts` 两处），改动文件零错误；
`uni build` DONE，仅剩既有的 `conversationSyncService` 动静混合导入告警。

## 原生 iOS / Android 复刻要点

1. **区分「瞬态提示」与「快照状态」。** 重试横幅、`TurnRetrying` 这类只存在于事件流里，
   attach 快照拿不到。原生端如果按「快照即真相」建模，冷启动必然有这个空窗。
2. **不要用快照去清空瞬态状态。** 字段缺省的含义是「我不记录这个」，不是「它已经结束」。
   这是本次那个「先闪一下又消失」的成因。
3. **「还不知道」要有独立的表达**，不能复用「正在忙」。用户能区分「同步中」和「思考中」，
   前者暗示信息可能不全，后者暗示一切正常。
4. **过渡态的优先级必须最低**（在所有确切信号之后）。拿到任何具体信息就该让位 ——
   否则它会盖住真正需要用户看到的错误。
5. **过渡窗口长度按「最快的那条真实信号」定**，不要拍一个大数。太长会在正常路径上留噪音。
6. **过渡态的视觉连续性**：它前后都是「在跑」，中间不该变色/停转圈。
7. **多入口写入同一状态时包一层**，不要在每个调用点各写一遍 —— 漏一处就是一条没有过渡态
   的路径，而这种漏很难在测试里发现。

## 相关笔记

- [[2026-08-20-22-15-acp-error-evidence-and-disconnected-status]] —— `last_error` /
  `details` 的收全，以及 `disconnected` 成为一等状态
- [[2026-08-20-14-20-realtime-reconnect-authoritative-refetch]] —— 传输层重连与
  ACP agent 断连是两件不同的事
- [[2026-08-20-18-40-streaming-history-paging-and-no-polling]] —— 同一类教训：
  「服务端没给」不等于「不存在」，要先查协议再下结论
