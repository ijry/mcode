# History Window Entry Refresh

## 背景

此前详情页命中热运行时或 SQLite 水合时，会先展示已有 `localTurns`，再由独立的 `ensureConversationHistoryWindow` 补一次尾窗探测。探测期间 `session.historyWindow == null`，历史指示器显示「正在确认历史范围...」，且 `loadOlderTurns` 因 `hasOlderConversationHistory(null) === false` 无法请求上一页。

`codeg-plus` PC 端没有这个慢状态，因为详情响应本身就是窗口化响应：首屏 `get_folder_conversation(tailTurns)` 返回 `turns`、`turns_offset`、`turns_total`、`prefix_hash`、`assistant_turns_before_offset`，滚到顶部时已有窗口坐标可直接请求上一页。

## 数据流变更

详情页入口现在统一发起最新远端详情刷新：

- 冷启动：继续等待 `get_folder_conversation({ conversationId, tailTurns: 30 })`，用响应建立首屏轮次和历史窗口。
- SQLite 水合：先显示本地最新页，然后立即异步请求同一份远端尾窗；请求不会因为 `liveMessage`、pending permission/question 或 `inFlightUserTurnId` 直接跳过。
- 热运行时：先显示内存态，然后立即异步请求远端尾窗；不再只启动独立的窗口探测。

历史详情请求复用当前 `getDetailGateway()`，不再为每次 `get_folder_conversation` 串行执行 relay `refreshAuth()`。需要强制刷新认证的场景仍保留在发送前 PC tab 准备等专用路径。

## 窗口与轮次一致性

窗口坐标仍必须和 `localTurns[0]` 成对：

- 如果已有 `historyWindow` 且会话处于进行中状态，远端尾窗不覆盖当前 `localTurns`，只通过 `resolvePreservedTurnsWindow` 提升 `turns_total`。
- 如果没有旧窗口，本次远端尾窗会成为新的 `localTurns` 基准，并同步采用同一响应里的窗口字段。
- 如果没有进行中状态，则沿用原有尾窗合并规则：接缝可证明连续时保留已翻出的前缀和旧窗口，否则采用远端尾窗与远端窗口。

不要把 `turns_offset`、`prefix_hash`、`assistant_turns_before_offset` 拆开推导或分别替换；它们必须来自同一次服务端响应。

## UI 行为

正常打开详情页时，「正在确认历史范围...」不再是热运行时/SQLite 水合的主路径。用户看到缓存内容后，远端尾窗会尽快建立 `historyWindow`，随后滚到顶部即可触发 `get_folder_conversation_turns` 加载上一页。

`probing` 状态仍保留，用于入口请求失败、切换过程中窗口缺失、或已有深分页窗口且流式保护暂时不能重锚定的异常场景。该状态仍表示“还不能判断有没有更早历史”，不能显示成「没有更多历史了」。

## 兼容性

协议无变化，仍依赖服务端支持窗口化详情响应和旧分页接口：

- `get_folder_conversation({ conversationId, tailTurns })`
- `get_folder_conversation_turns({ conversationId, beforeIndex, limit })`

旧服务端缺少窗口字段时，现有 `requireConversationHistoryWindow` 会继续给出升级提示。

## 原生 iOS/Android 复刻指引

原生端进入详情页时也应统一执行：

1. 读取内存/SQLite 最新轮次用于快速首屏展示。
2. 立即请求 `get_folder_conversation` 的尾窗响应，不要等待用户滚动触发。
3. 用同一份响应同时更新尾部轮次和历史窗口；若正在生成且已有旧窗口，只刷新统计和 total，不移动窗口坐标。
4. 顶部触底/下拉时只在 `historyWindow.turns_offset > 0` 时请求 `get_folder_conversation_turns`。
5. 不要为普通详情刷新串行执行 token refresh；认证失败由网关/全局认证恢复路径处理。

参见历史背景笔记：

- `2026-08-20-16-24-history-indicator-probing-state.md`
- `2026-08-20-17-08-history-indicator-guard-parity.md`
