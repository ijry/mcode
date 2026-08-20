# 接 AIR 结构化失败通道，并按 actions 给出重连智能体入口

**文件**：`2026-08-21-02-40-air-session-failures-and-agent-reconnect.md`

## 起因：两次把「协议适用」当成「字段适用」

用户先问「ACP 断开连接的报错有办法获取到吗，还有别的报错似乎无法获取」，并要求「看下
codeg-plus 源码到底是怎么处理报错的」、「输入框右下角有个重新连接功能，是不是也应该给
MCODE 增加」。

追查过程里我犯了两次同型的错，都被用户当场纠正：

1. 我说「ACP 事件流里没有『别人替你发了一条』这种帧，轮询是唯一手段」—— 用户反问
   「应该有 WS 事件推送的吧」。事实是 `AcpEvent::UserMessage` 早就存在且 mcode 早就接了。
2. 我说 `session_failures` 是「JetBrains AIR 的失败记录，对 Claude 无效」—— 用户反问
   「JetBrains 哪里来的你是不是看错了」。术语没看错（源码里 20 多处），但**适用范围说反了**：
   `connection.rs:3079` 说「Only the two known AIR speakers get it」，那两个正是
   **claude-agent-acp 0.67+ 和 codex-acp 1.2+**。Claude 本身就是 AIR speaker。

教训是同一条：**读到一层结论就往外推，没查「这一层对谁成立」。**

## 服务端契约（逐条查实）

`AcpEvent::SessionFailure { record: SessionFailureRecord }`，来自
`session_info_update._meta.jetbrains.air.sessionFailure`。codeg 在
`build_client_capabilities` 里声明了 `clientCapabilities._meta.jetbrains.air` 才会收到。

记录形状（`types.rs:77-98`）：

```
{ id, revision, category, severity, title, details?, actions[], resolved }
```

- `category`：`connection|access|limit|request|service|unknown`
- `severity`：`"warning"`（瞬态、自愈）或 `"error"`（终止性）
- `actions`：`retry|login|new_session` 的子集
- `title` **可能为空** —— 服务端明说，那时要退回 category 标签

### 三条硬约束

1. **线上只有 upsert**，没有 resolve、没有墓碑。靠 `id` + `revision`（每 id 从 1 起）原地修订。
2. **合并必须单调，`revision <=` 一律拒绝。** 相等也要拒绝：一条 upsert 只会被原样重播，
   不会在同一 revision 上合法修订。适配器在 `session/load` 时**会重播仍然活跃的失败**，
   不拒绝就把状态抖回旧值。
3. **`resolved` 是客户端推断的**，永不在线上。`warning` 在下一次成功回合结束时翻转；
   `error` **故意保持活跃**（`types.rs:67-69`：codex 靠它防止迟到的重复通知追加出重复行）。

### 它替代了 codex 的老通道

`registry.rs:549-557`：声明 AIR 之后 `_meta.codex.error` → `TurnRetrying` 与 warning 文本块
都不再发，**severity-`warning` 记录接过了重试横幅这个角色**。

所以对 codex 这是重试横幅的**唯一**来源。而它**在 attach 快照里**
（`session_state.rs:1671`，注释明说为 mid-session attach 设计）—— 冷启动就能拿到。

### Claude 的重试**不**走这条（已验证）

`session_state.rs:1176-1187` 把 `ClaudeSdkMessage` 和 `TurnRetrying` 放在同一个
「不改 SessionState」分支里，注释直说「与 Claude 的 api_retry 一样是前端瞬态提示（重试
横幅），**不进快照**」。而 Claude 的 `api_retry` 就是 `ClaudeSdkMessage`
（`connection.rs:9621-9634`，测试用例 `:12404` 的 `attempt: 3, max_retries: 10` 与用户截图
底部的「1/10」形状一致）。

**所以两条重试路径是分开的**：

| agent | 重试走哪 | 进快照 |
| --- | --- | --- |
| Claude Code | `_claude/sdkMessage` → `ClaudeSdkMessage` | ❌ 明确排除 |
| codex | AIR `sessionFailure`（severity=warning） | ✅ |

Claude 侧 AIR 只承载**终止性**失败 + model fallback advisory（`registry.rs:415-429`）。

## 改动

### 1. 纯模块 `services/conversation/sessionFailureRecords.ts`

抽出来是因为**同一套合并规则有两条入口**：快照整张表、实时逐条 upsert。服务端明确要求
两侧行为一致（`types.rs:332-334`），写两份必然漂移，而漂移的症状是重复行或幽灵记录 ——
都不报错。

- `normalizeSessionFailureRecord` —— `revision < 1` 或缺失一律丢弃。留下它会让后续
  **任何**一条都被判成「更新」，状态反复抖动。
- `mergeSessionFailure` —— 严格 `>` 才接受。更高 revision 会**重新激活**
  （`resolved` 回 false），那正是 codex 把重试警告升级成终止错误的方式。
- `mergeSessionFailureSnapshot` —— **保留本地推断的 `resolved`**。快照里每条都是 false，
  整表替换会让已恢复的警告在每次 attach 后复活。
- `settleRecoveredSessionFailures` —— 只结算 `warning`，`error` 保持活跃。
- `primarySessionFailure` —— `error` 优先于 `warning`，同级取最后一条。
- `sessionFailureText` —— `title` 为空时退回 category 标签，绝不显示空白胶囊。
- `sessionFailureSuggestsRetry` —— 只认 `actions` 里的 `retry`。

### 2. 三处接线

- `api/acp.ts` 新增 `session_failure` 分支：**原样透传整条记录**，不在这层做取舍（合并
  判定属于纯模块）。
- `conversationRuntime.ts` 新增 `sessionFailures` 字段 + 实时事件分支 + 快照合并 +
  回合结束结算。
- **实时分支不动 `status`、不动 `inputErrorMessage`**：这张表回答「有哪些失败、建议怎么
  处理」，与「当前是什么状态」是两件事。`severity=warning` 期间会话仍在正常跑，当成
  error 会让界面在自愈过程中反复红一下。终止性失败自己会走 `error` / `status_changed`。

### 3. 重连智能体：一个**新的** action，不是复用旧的

`agent_disconnected` 与 `bridge_*` 的恢复手段**完全不同**，此前注释已写明但没给入口：

| 状态 | 断的是什么 | 恢复手段 |
| --- | --- | --- |
| `bridge_reconnecting` / `bridge_error` | 手机↔主机的 WebSocket | `acpApi.reconnectRealtimeBridge` |
| `agent_disconnected` | **ACP agent 进程** | `invalidateConnection` + `runtime.connect` |

所以新增 `actionKey: "reconnect_agent"`。用同一个 key 会让「agent 死了」时去重连一条本来
就好好的传输通道 —— 点了没反应。

`reconnectDetailAgent()` 里 **必须先 `invalidateConnection`**：`runtime.connect` 会复用
已有 connectionId（`conversationRuntime.ts` 的 `existingManaged?.connectionId` 分支），
不失效就原样返回那条死连接。重连后立刻取一次快照 —— 新连接不会重播断连前的事件。
`reconnectingDetailAgent` 防连点（每次点都先 invalidate，并发会互相拆掉对方刚建好的连接）。

### 4. 「运行异常」的重连入口按 `actions` 给

这是接这条通道**最实在的收益**：`login`（登录过期）/ `new_session`（会话失效）时给
「重新连接」是误导 —— 重连解决不了它们，用户点几次然后放弃。只有 `retry` 才可能恢复。

拿不到记录时（Claude 重试走旁路、或旧后端不发 AIR）**不给按钮**：宁可少一个入口，
也不要给一个点了没用的。

## 测试

`tests/services/sessionFailureRecords.spec.ts`，17 条，覆盖每条契约：

- 归一化：保形 + `resolved` 默认 false；`revision` 无效的四种输入全部丢弃；未知词表退化。
- 合并：新 id 追加；更高 revision 原地修订并重新激活；**相等与更低都拒绝**；不改入参。
- 快照：保留本地 `resolved`；仍采纳真正更新的；未见过的 id 合入。
- 结算：只动 warning，error 保持活跃；无变化时返回同一数组引用。
- 选取：error 优先、同级取最新、忽略已解决。
- 文案：空 title 退回 category 标签。
- `actions`：只有 `retry` 返回 true。

**变异探针**：把合并守卫从 `<=` 改成 `<`（也就是允许相等 revision 覆盖）→
「rejects equal and lower revisions」立刻变红，其余 16 条绿。探针后源文件已还原。

三道闸：jest **125 suites / 852 tests 全绿**；`tsc --noEmit` 恰好 3 条既有基线错误
（`main.ts` 的 `App.vue`、`detailScrollState.ts` 两处），改动文件零错误；
`uni build` DONE。

## 仍然存在的缺口

**Claude 的 504 重试冷启动仍有几秒空窗** —— 它不走这条通道，服务端没在任何持久位置记录。
`attach_settling` 过渡态（见
[[2026-08-21-01-30-attach-settling-transient-status]]）是目前能做到的最好结果。真正消灭
它需要服务端加一个 `last_api_retry`，像 `last_error` 那样。

**多客户端同时收到同一个 agent 报错**这一点尚未验证。`event_bridge.rs:405` 附近有注释说
`acp://event` 被从全局广播里移除、ACP 事件改走 per-connection attach 协议 —— 如果如此，
多端能否同时收到取决于 attach 是否允许多订阅。这直接影响「手机和 PC 同看一个会话」时
报错会不会只有一边看到。

## 原生 iOS / Android 复刻要点

1. **单调合并写一份。** 快照与实时两条入口必须共用同一个 reducer，服务端明确要求两侧
   行为一致。写两份的漂移症状是重复行/幽灵记录，都不报错。
2. **相等 revision 必须拒绝。** 适配器在 `session/load` 时重播活跃失败，接受相等会把
   客户端推断的 `resolved` 抖回 false。
3. **`resolved` 是本地状态，不要被快照覆盖。** 它不在线上，快照里恒为 false。
4. **只结算 `warning`，`error` 留着。** 终止性失败要等用户实际处理。
5. **`title` 可空**，要有 category 兜底文案。
6. **按 `actions` 决定给什么按钮**，不要从错误文案猜关键字。`login`/`new_session` 给
   「重连」是误导。
7. **传输层重连与 agent 重连是两个动作**，不能共用一个入口。agent 重连前要先让旧连接
   失效，否则复用逻辑会原样返回那条死连接。
8. **重连后立刻取快照**：新连接不重播断连前的事件。
9. **未知词表要退化渲染**，不要解析失败 —— 服务端刻意留了扩展空间。

## 相关笔记

- [[2026-08-20-22-15-acp-error-evidence-and-disconnected-status]] —— `last_error` /
  `details` 的收全，`disconnected` 升为一等状态
- [[2026-08-21-01-30-attach-settling-transient-status]] —— Claude 重试的冷启动空窗
- [[2026-08-20-18-40-streaming-history-paging-and-no-polling]] —— 同一类教训的前一次
