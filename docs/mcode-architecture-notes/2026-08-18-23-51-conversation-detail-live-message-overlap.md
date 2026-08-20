# 详情页实时消息重复（live_message 与已落盘轮次重叠）

日期：2026-08-18
影响文件：
- `mcode-app/src/stores/conversationTimeline.ts`
- `mcode-app/src/pages/conversation-detail/ConversationDetailInteractivePane.vue`
- `mcode-app/src/pages/conversation-detail/index.vue`
- `mcode-app/tests/stores/conversationTimeline.spec.ts`

参考实现：`D:\Repos\xyito\lingyun\codeg-plus`（**不要**再看已删除的 `codeg-main`）。

## 1. 现象

进行中的会话详情页，agent 回复从中途开始整段重复：列表里已经出现过的若干段文本，
又被底部那条带「执行命令中」徽标的实时气泡从头重播了一遍。同时控制台抛两个
`ReferenceError`，把 `setup()` 打断。

三个问题是独立的，但后两个会掩盖第一个的修复效果，所以一起处理。

## 2. 协议：为什么会重叠

codeg-plus 侧有两条**互不知情**的数据路径，mcode 客户端把它们叠加渲染。

### 2.1 `live_message` 是「整轮累加器」

`src-tauri/src/acp/session_state.rs:24-31` 的注释写得很明确：

> 当前 streaming 中的 turn 的累积内容。turn 完成后清空。

- 唯一的清空点是 `session_state.rs:960` 的 `self.live_message = None;`，位于
  `TurnComplete` 分支内。
- `push_tool_call_ref_if_absent`（`session_state.rs:1438-1451`）是**追加**到同一个
  累加器上的 —— 一次工具调用**不是**刷新边界。

所以整轮从第一个字到 `TurnComplete`，`live_message.content` 一直在长。

### 2.2 解析器把一条逻辑回复拆成多条 assistant 轮次

`src-tauri/src/parsers/claude.rs:2535-2612` 的 `group_into_turns` 在每条 assistant
JSONL 记录处断开，代码注释：

> (stop at the next assistant message to keep turns small for virtualization)

于是同一条逻辑回复在 transcript 里是 **多条连续 assistant `MessageTurn`**。

### 2.3 `in_flight_user_turn_id` 在多段场景下是 `None`

`src-tauri/src/commands/conversations.rs:1270-1274` 以及它自己的测试
`does_not_stamp_with_two_trailing_assistant_turns`（`conversations.rs:2349-2360`）
确认：**只要尾部有 ≥2 条 assistant 轮次，服务端就不打这个标**。

而「尾部有 ≥2 条 assistant 轮次」正是多段回复的定义。所以这个字段在最需要它的场景下
恰好缺席，不能作为定位当前轮次的依据。

### 2.4 叠加结果

`localTurns`（已落盘的前半段，多条）+ `liveMessage`（整轮累加，含同样的前半段）
= 前半段渲染两次。第二次带 streaming 状态，就是用户截图标记 ② 的那条。

## 3. 修复

### 3.1 时间线抑制改为「按后缀」而非「只看最后一条」

`conversationTimeline.ts` 原来两条抑制路径都打不中这个形状：

- `suppressAnchoredAssistantPartials` 在 `inFlightUserTurnId` 为空时直接返回（见 2.3）。
- 兜底路径只检查 `turns[turns.length - 1]` 这一条，多段时只能消掉最后一段。

新增 `suppressLiveOwnedTrailingAssistantRun`：

1. `trailingAssistantRunLength` 数出尾部连续 assistant 轮次的长度。
2. `countCoveredTrailingAssistantTurns` 从**最长后缀**往回试，把 `count` 条轮次的
   `content` 顺序拼接，用 `isContentPrefix` 校验是否仍是 `liveMessage.content` 的前缀；
   第一个命中的 `count` 即为本轮已落盘的段数。
3. 抹掉这 `count` 条。上限 `MAX_LIVE_OWNED_TRAILING_ASSISTANT_TURNS = 32`，防御异常长的串。

**为什么抹后缀而不是整串**：外部客户端发来的新用户轮次可能还没落盘（等
`maybeBackfillExternalUserTurn` 补），此时上一轮的 assistant 轮次会紧贴在本轮前面。
前缀校验保证它不是 live 的前缀，因而不会被误删 —— 对应测试
`keeps trailing assistant turns from an earlier turn` 与
`suppresses only the covered suffix of a trailing assistant run`。

### 3.2 前缀比较要容忍 tool_call 漂移

同一个 `tool_call` 在两条路径里的 `status`/`input`/`output` 常常不一致：落盘的是 JSONL
里 `tool_use` 记录的初始态，实时的是 `active_tool_calls` 的当前态（快照时才由
`mapSnapshotContentBlock` 把 `tool_call_ref` 解析成实体）。严格签名比较会因此判定「不是前缀」，
抑制失效。

`isContentPrefix` 现在三级降级：

1. `buildPartSignature` —— 严格签名（含 status/input/output）。
2. `buildStablePartSignature` —— tool_call 只认 `id + name`，其余部分沿用严格签名。
3. `isTextProjectionPrefix` —— 纯文本投影（仅当前缀侧全是 text/thinking）。

对应测试 `suppresses the covered run even when tool call state drifted`。

### 3.3 两个 ReferenceError

`<script setup>` 编译成一个 `setup()` 函数，顶层 `ReferenceError` 会**中断其后全部**
声明与 watcher，所以这两个崩溃的实际影响远大于一行报错。

**`historyStatusText is not defined`** — `index.vue` 里有个 watcher 监听
`historyStatusText.value`，但这个标识符只在 pane 里声明。git blame（`e2a489a` 引入、
`61c3585` 改过、`2edf301` 后仍在）确认是存量已提交问题。历史状态提示本就归 pane 自己管
（`ConversationDetailInteractivePane.vue:1610` 起有等价实现），页面壳无需再同步视口，
故删除该 watcher。顺带清掉同样成为死代码的 `historyStatusStyle` 与
`buildHistoryStatusStyle` import（`detailLayoutPresentation.ts:69` 的导出与其单测保留，
仍被 `detailLayoutPresentation.spec.ts` 覆盖）。

被这个崩溃连带打断的（现已恢复）：mention 触发、composer/附件/队列的视口同步、草稿持久化，
以及其后所有 `function` 声明。

**`preservingHistoryAnchor is not defined`** — 计划文档
`docs/superpowers/plans/2026-07-13-conversation-detail-tab-history-loading.md:117-121`
列了这个标志，但代码里从未声明，也从未写明赋值点。它的用途从 `loadOlderTurns` 的锚点
恢复逻辑可以反推出来：前插更早历史会改变 `renderMessageItems`，触发 pane 的 watcher
调用 `scheduleViewportSync()`，把滚动位置拽走，覆盖掉紧随其后的
`setProgrammaticAnchor(firstVisibleMessageId)`。

补齐方式：在 pane 的其他分页 token 旁声明 `let preservingHistoryAnchor = false`，并在
`loadOlderTurns` 里用 `try/finally` 包住「`prependHistoryPageTurns` → 更新历史窗口 →
`await nextTick()` → `setProgrammaticAnchor`」这一段。`finally` 保证任何一步抛出都不会
把标志永久卡在 `true`（否则视口同步会彻底静默）。

## 4. 需要守住的不变量

- **用户连续发送相同文本必须是两条独立消息**（例如连着发两次「继续」）。绝不能按全部
  历史内容签名去重。本次改动只在「尾部连续 assistant 轮次」范围内做抑制，不触碰 user
  轮次，对应测试 `keeps repeated identical user text as separate messages` 仍绿。
- **`isPlaceholderThinking` 的 live 消息不抑制任何已落盘轮次** —— 它没有真实内容，
  抑制会让刚完成的回答闪失。
- **CodeG 轮次 id 不是稳定身份**（`turn-N` 按下标派生、会平移、有空洞），所以这里全部
  用内容前缀判定，不比较 id。

## 5. 已知遗留

`mcode-app/src/api/acp.ts:376-378` 的 `getFolderConversation` 不发 `tailTurns`，
按 codeg-plus 的约定这会返回**完整**轮次列表且窗口元数据全部缺席，而详情页自己走的是
30 条尾窗（`buildTailHistoryRequest`）。`maybeBackfillExternalUserTurn` →
`calibrateAfterReplayGap` 用的是前者，两条路径的窗口口径不一致会放大重叠范围。
本次未改动，单独记录。

## 6. 原生 iOS / Android 复刻要点

任何原生客户端只要同时消费「transcript 轮次列表」和「live_message 快照」，就会遇到同一个
重叠，必须自己实现这套抑制：

1. **不要相信 `in_flight_user_turn_id`**：多段回复时它是 `null`。把它当锦上添花的快路径，
   必须有不依赖它的兜底。
2. **live_message 是整轮累加器，不是「最后一个片段」**。收到它之后，要从已落盘列表的
   **尾部** 剥掉「拼起来是它前缀」的那一串 assistant 轮次 —— 数量不定，不是固定 1 条。
3. **比较时对 tool_call 只认 `id + name`**：两条路径的 status/output 必然不同步。
4. **前插历史时要有「抑制视口同步」的开关**：iOS 用 `UITableView`/`UICollectionView` 的
   `performBatchUpdates` + `contentOffset` 补偿，Android 用
   `RecyclerView` 的 `scrollToPositionWithOffset`。都需要一个类似
   `preservingHistoryAnchor` 的闸门，避免内容变更回调抢走滚动位置；且必须用
   `defer`/`finally` 保证复位。
5. **别按内容去重整个历史**：重复的用户文本是合法的两条消息。抑制范围严格限定在
   「当前 live 轮次覆盖的尾部 assistant 串」。

## 7. 验证

```bash
cd mcode-app && npx jest --config jest.config.cjs --runInBand
# 114 suites / 625 tests 全绿（新增 5 条 live 重叠回归）

npx tsc --noEmit -p tsconfig.json   # 仓库有存量类型报错，grep 过滤到改动文件确认为空
npx uni build                        # H5 构建通过
```

相关笔记：`2026-08-18-19-56-conversation-detail-turn-identity-dedupe.md`（同一条逻辑轮次在
SQLite / 服务端载荷 / ACP 事件三个 id 空间里的折叠），
`2026-08-17-android-phone-realtime-user-message-authority.md`。
