# 后台任务在 mcode 上完全不可见：PC 端形态、协议现状与分期建议

**性质：分析 + 提案，本次未改任何代码。** 触发问题：「Claude 会话可以在后台跑任务，PC 版本用一条顶部状态条表示，
mcode 是不是也该支持」。参考的 codeg 版本是上游 `codeg/main` = `3ebdfed1`（v0.30.2，本次已把
`codeg-plus` 本地 main 快进到它）。文中 `codeg/...` 路径均指该 ref。

## 一、先纠正前提：PC 上不是「一条状态条」，是两套数据 + 五个界面

### 1.1 两套数据，来源完全不同

| 通道 | 内容 | 怎么来的 |
| --- | --- | --- |
| **AIR 异步任务** `async_task{delta}`（`codeg/src-tauri/src/acp/types.rs:551`） | `run_in_background` 的 shell、workflow、monitor | ACP 线上的正规通道。`build_client_capabilities` **只对 claude-agent-acp** 广告 `asyncTasks`（codex-acp 1.8.0 没实现） |
| **出轮次活动** `background_activity{…}`（`types.rs:577-601`） | 异步子智能体的 `<task-notification>` 结算、结算后智能体继续写的内容、cron//loop 自主轮次 | **线上没有可靠表示**（cron 轮次一个 wire 事件都不发，claude-agent-acp #270），codeg 只能 tail Claude 自己的 JSONL |

`background_watch.rs` 的记账办法值得单独记一笔：launch ack 是从 record 级 `toolUseResult` 认的
（`status:"async_launched"` → `agentId`；后台 shell 是 `backgroundTaskId`）——**这两个字段只存在于磁盘，
从不上线**；结算认三个信号：`<task-notification>` 记录、`TaskOutput` 的结构化 `task.status` 到终态、
`TaskStop`/`KillShell` 调用。后台 shell 几乎从不发 task-notification，靠后两个信号才不会挂死。
轮询 1s（有未结算任务时）/ 3s，mtime 门控，watch 永不停——cron 随时可能落。

`background_activity` 载荷四个字段各有讲究：

- `outstanding` —— 已启动未结算的后台任务数
- `settled[]` —— 本批结算的任务（`BackgroundSettledInfo`，`types.rs:719`）。注释原话：
  **"the frontend raises one OS notification per entry"**
- `turns[]` —— 从转录尾解析出的出轮次轮次，按 `MessageTurn.id`（`bg-<episode-offset>-<idx>`）**upsert**，
  一个还在长的轮次每个 tick 整条重发
- `watermark` —— 解析到的字节偏移，前端靠它退休 overlay 轮次，避免与详情拉取重复

### 1.2 五个界面（用户说的「顶部状态条」是第 1 个）

1. **会话内、transcript 正上方那条 = `codeg/src/components/chat/async-task-strip.tsx`**
   （挂载点 `chat/conversation-shell.tsx:283-284`，数据来自 `conversations/conversation-detail-panel.tsx:2056-2061`）。
   每行：类型图标（shell/workflow/monitor）、名字、`last_tool_name · N tokens`、**Output**（打开
   `output_file_path`，`:88-100`）、**Stop**（按 `task.can_stop` 开门，`:157-179`）。只渲染未终结的任务，
   结算即消失。**这就是要参考的那条。**
2. 底部 `codeg/src/components/layout/status-bar.tsx`（挂 `src/app/workspace/layout.tsx:1209`）——
   **与智能体无关**，只跟本地操作（连接、git、导图），数据源是内存 reducer `contexts/task-context.tsx`，
   终态立即移除。**别拿它当参考。**
3. 侧栏：卡片转圈（`sidebar-conversation-card.tsx:527-565`）+ 文件夹/分组头的聚合数字
   （`sidebar-conversation-list.tsx:1417-1420, 2603-2610, 2621-2626`，文案 "{count} sessions running"）。
4. 标签页状态点（`tabs/tab-item.tsx:329-331`）。
5. **桌宠窗口**（独立 always-on-top）：角标 running/awaiting/errored 三档
   （`src/lib/pet/session-display.ts:19-31`），面板逐行列活跃会话且能**就地批授权**
   （`pet-panel/_components/PanelPermissionCard.tsx`）。这才是 PC 上真正的跨会话全局指示器。

值得注意：`backgroundOutstanding` 在 PC 前端**不渲染任何数字**，只用来挡拆连接
（`src/lib/connection-teardown.ts:29-34` 的 `isConnectionBusy`）。也就是说 PC 自己也没做
「跨会话的后台任务总数」这件事。

### 1.3 后端拿它保命

`has_active_background_work` = 转录记账的 `background_outstanding` **OR** AIR 任务表
（`session_state.rs:1316-1346`，刻意不求和以免重复计数），两侧都被 1h 上限兜底（`:1768-1783`）。
空闲清扫（默认 3 分钟，`idle_sweep.rs:19-23`）见到它就跳过（`manager.rs:600-612`）——
**断连接等于杀掉 agent CLI，后台工作跟着死**。注释的权衡原话：误判「还在跑」只浪费一条空闲连接，
误判「跑完了」会连活一起杀掉。

## 二、这些信息到手机上还剩多少

### 2.1 传输

codeg 自带 axum：`POST /api/<command>`（约 500 条命令，`codeg/src-tauri/src/web/router.rs:21`）+
`/ws/events`（`web/ws.rs:47`）。**ACP 事件只走 per-connection attach**（帧定义 `web/ws_attach.rs:41/59/91`），
给 WS 客户端的全局 firehose 已经删掉（`web/event_bridge.rs:437-441`），只剩 Tauri webview 自己还收
`acp://event`。mcode 走 `directGateway.ts` 直连，或经 mcode-desktop 隧道 + relay。

### 2.2 协议里有、mcode 客户端没接的

| 事件 / 字段 | 服务端位置 | mcode 现状 |
| --- | --- | --- |
| `background_activity` | `types.rs:577` | **丢**。`api/acp.ts:1202` 没有 case；`:1146` 的 fallthrough 要求帧上有 `data` 键，codeg 的扁平 envelope 从来没有 |
| `async_task` | `types.rs:551` | **丢** |
| `LiveSessionSnapshot.background_outstanding`、`async_tasks[]` | `session_state.rs:1854-1862`、`:1787` | **不读**（grep 零命中） |
| `plan_approval_request` / `_resolved` | `types.rs:693/701` | **丢**，且没有 `acp_answer_plan_approval` 调用（`api/acp.ts` 只有 `acp_respond_permission:259`、`acp_answer_question:274`） |
| `turn_retrying` | `types.rs:505` | **丢**（正在重试第几次、还要等多久，全部看不到） |
| `permission_queue_depth`、`permission_request.queued` | `types.rs:357/336` | **丢** / 读到即弃（后面还排着几个授权，看不到） |

一个容易误判的点：**Claude 的计划审批不在 `plan_approval` 这条通道上**。Claude 的 ExitPlanMode（以及 codex 的
plan_review）走的是 `session/request_permission`，落在 `pending_permission`，所以**手机上是能批的**；
`pending_plan_approval` 是 Grok `_x.ai/exit_plan_mode` 专用。mcode 里那 9 处 `plan_approval` 字样全部只是
「待审批」状态标签（`conversationOverviewPresentation.ts:180`、`awaitingReplyStore.ts:74`），没有应答路径。

顺带：`services/conversation/subagentToolCall.ts:52-54` 已经把 `background_task` / `background_cancel` /
`background_output` 放进 DENY 名单——认得出，但当普通工具折叠掉了。

### 2.3 三处结构性缺口（客户端单方面补不了）

1. **全局快照看不见「纯后台」会话。** `list_active_sessions`（`codeg/src-tauri/src/acp/manager.rs:2434`）
   的行集判据是 `pending_permission.is_some() || status ∈ {Prompting, Error}`（`:2448-2453`）。
   轮次结束后 `status` 回到 `Connected`，于是**只剩后台任务在跑的会话直接从 `pet://sessions` 里消失**，
   `runningCount` 也不含它。这和「待回复」那次是同一个判据太窄的问题，见
   [[2026-09-03-17-54-conversation-list-awaiting-reply-chip]]。
2. **切后台期间的事件不可恢复。** 全局通道在没有 WS 订阅者时直接丢弃
   （`web/event_bridge.rs:48` 的 `receiver_count() > 0`），帧上无 id。per-connection 事件有环形缓冲，
   但只能靠**活着的**重新 attach 带 `since_seq` 取回，而 `lastAppliedSeq` 只在内存
   （`conversationSyncService.ts:112-117`）。所以 mcode 只能 onShow 重拉
   （`App.vue:28-38` → `refreshConversationTabBadge()` + `resumeRealtimeAfterForeground()`）。
3. **mcode 没有任何推送 / 本地通知**（grep 验证：无 `createPushMessage`、`plus.push`、`APNs`、`Notification`、
   `setAppBadge`、service worker）。而 `settled[]` 正是 PC 用来弹 OS 通知的信号
   （`contexts/acp-connections-context.tsx:3731-3749`，`lib/notification.ts:4-22`，且只在 `document.hidden` 时发）。

### 2.4 mcode 目前唯一的跨会话「在忙」信号

会话 tab 上那个数字角标：`services/conversation/conversationTabBadgeService.ts:34-51,78-109`（App 级常驻，
见 [[2026-08-20-16-05-tabbar-badge-autonomous-service]]），计数 = `runningCount + waitingCount`
（`tabbarActiveSessions.ts:47-50`）。除此之外没有横幅、没有常驻条、没有应用角标。
更关键的是**离开详情页时 `runtime.clearSession()` 会销毁运行态**
（`pages/conversation-detail/index.vue:2401`），所以一条全局条读不到已离开会话的 runtime，
只能读 `awaitingReplyStore` + 角标那份 per-instance 计数。

## 三、建议：该支持，分三层，第一层不用动服务端

### Tier 0 —— 详情页 / 实时预览卡的「后台 N」（纯客户端，当前协议就够）

接 `background_activity` 的 `outstanding` 与 `settled[]`，以及 `async_task` delta（增量语义：
字段缺省即未变，只有 `spawned:true` 能建行——PC 侧的合并规则在 `codeg/src/lib/async-tasks.ts:83-129`）。
attach 时以 `LiveSessionSnapshot.background_outstanding` 为准：一次性事件不重放，snapshot 是中途 attach
唯一能补回计数的路径。UI 落在详情页现有状态胶囊旁（`ConversationDetailInteractivePane.vue:206-237`），
点开是一张 AIR 任务清单；Stop 复用 `can_stop` 语义。

**为什么这层最值得先做**：手机上现在轮次一结束就显示「已完成」，而后台 shell / 异步子智能体可能还在跑、
还在花钱。这是当前**唯一会让用户做出错误决定**的信息缺失（以为可以合电脑了）。

`turns[]`（cron/loop 自主轮次、task-notification 之后的续写）是另一件更大的活：upsert by id +
watermark 退休 + 与历史分页共存。建议单独一期，不要混进状态条。

### Tier 1 —— 全局状态条（纯客户端，但要动 26 个页面的布局数学）

数据只用现成的两条全局通道：`pet://sessions`（counts + 行）与 `conversation://changed{kind:"status"}`
（后者由 `event_bridge.rs:520-545` 中央桥接，专门给「没 attach 的客户端也能看见运行态变化」）。

挂载点唯一合理的选择是 `App.up.vue:6`：uview 的 `UniUpRoot` 已经把每个页面模板包进 `global-up-root`，
一处覆盖全部 26 页；状态必须放模块/pinia，因为 **`App.up.vue` 是每页实例化、不是单例**
（`conversationTabBadgeService` 已经是这个形状），先例见 `components/pet/PetFloat.vue:51-69`。

**代价要说清**：14 个用原生导航栏的页面上，这条 fixed 条会压在系统导航栏下面；自定义导航栏那些页面的
top offset 数学（`detailLayoutPresentation.ts:63-67`、`ConversationsNavbar` 占位）都要跟着抬高。
零结构改动的次优解是那个**每页都挂载却从未被使用**的 `up-notify` host（`duration:0` 可常驻）。

**倾向**：tabBar 角标已经在传「有 N 个会话在忙」。一条全局条的增量价值在于「在忙什么 / 在等你干什么 /
一键跳过去」，如果只是把同一个数字换个位置，不值得动全局布局。建议先做**会话列表页顶部 + 详情页**两处，
除非要的就是 Claude Code 桌面版那种 "Claude is working in N sessions" 的全局存在感。

### Tier 2 —— 服务端补字段（codeg-plus 有 fork，这里改动是划算的）

1. `PetSessionEntry` 加 `backgroundOutstanding`，`list_active_sessions` 的判据加
   `|| has_active_background_work(now)`。这样「纯后台」会话才会回到全局视图（§2.3.1）。
   加字段是安全的：`#[serde(default, skip_serializing_if …)]`，对老客户端字节等同——codeg 一直这么演进
   （`session_state.rs:1787-1935`），协议层没有版本协商，只有字段级向后兼容。
2. 顺手把上一份笔记论证过的 `blockedOn` 一起补上：客户端 `awaitingReplyStore.ts:61-90` 已经先读它、
   回落 `pending`，补上当天全列表「待回复」自动生效，客户端一行不用改。
3. 推送：`settled[]` 与三类阻塞是天然触发点。**没有推送，前面所有远程能力都得等用户主动打开 App 才生效**——
   这是整条远程链最大的漏点。

## 四、顺带查出的其他重要缺失（按手机价值排序）

1. **推送 / 本地通知全无**——见 §2.3.3。一个卡在授权上的智能体会一直卡到用户恰好打开 App。
2. **`git_commit` 没有**（`services/projectGit.ts` 只有 `git_commit_branches`，语义无关）：
   能看 status、能读 diff、能 push、能 reset，**独缺「提交」**；`git_pull` / `git_fetch` / `git_stash`
   也没有，一旦分叉手机侧就是死路。
3. **Token 用量零入口**（无 `token_usage_*` 调用）：无人看管的 work task 在花钱，而手机恰恰是
   「人在场」的那台设备。
4. **MCP / Skills 状态完全不可见**（`mcp_`、`skill` 两个命令族 grep 零命中）：坏掉的 MCP server 或被关掉的
   skill 会静默改变智能体行为，手机上连当前状态都看不到，远程排查直接撞墙。
5. **文件不能编辑**：`services/projectFiles.ts` 只有 `get_file_tree:64/78`、`read_file_preview:90`、
   `create_file_tree_entry:106`，没有 `save_file_content`。改一行错字也要回桌面。
6. **Automations / cron 没有**（无 `automation_*`）：只有 work task 的一次性排期，没有重复执行。
7. **子智能体无法钻取**：只有折叠胶囊（`components/SubagentCapsuleBlock.vue`），父会话挂五个胶囊时
   看不出哪个卡住了——而并行子智能体正是桌面端的招牌能力。
8. **详情页的断线 / 重连 / replay_miss / 长等待横幅链是死代码**：`buildDetailStatusState` 把
   `bridge_recovered`、`bridge_reconnecting`、`agent_disconnected`、`api_retry`、`long_wait` 连
   `reconnect` 动作全算好了，却没有任何消费者（`pages/conversation-detail/index.vue:1232-1244`，
   `detailStatusPresentation.ts:96-338`）。**最便宜的一笔**：接上就有。
9. **免费的信息量被丢**：`turn_retrying`（正在第几次重试）、`permission_queue_depth` /
   `permission_request.queued`（后面还排着几个授权）。
10. **计划审批的独立通道收不到也答不了**（§2.2）——但注意 Claude/codex 的计划走 permission，那部分手机上是通的，
    缺的只是 Grok 那条。

反向说明，避免误判 mcode 整体落后：work task 一线（目录设置、合并、交付 PR、模板、审阅 diff）与
forge 一线（13 个 `forge_*` 命令）基本已达桌面平价。mcode 缺的不是「派活和收活」，
而是「被告知有事」「把审过的东西提交掉」「看见花了多少钱」。

## 五、原生端（iOS / Android）复刻要点

1. 后台任务数有两个来源，**必须都接**：attach 时读 `LiveSessionSnapshot.background_outstanding`
   （中途 attach 唯一能补的路径），之后读 `background_activity.outstanding`（一次性、不重放）。
   只接事件的客户端在中途 attach 时会显示 0。
2. `settled[]` 每条对应一次「任务完成」提醒；`turns[]` 是按 `MessageTurn.id` 的 **upsert**，不是 append。
3. **「轮次结束」与「活干完」是两件事**：`turn_complete` 之后只要 `outstanding > 0` 就仍要显示忙。
4. 全局聚合不要指望 `pet://sessions` 覆盖后台任务（服务端行集判据不含它，§2.3.1）。
5. 常驻指示器的生命周期必须在 Application 层，不能挂在任何页面上
   （同 [[2026-08-20-16-05-tabbar-badge-autonomous-service]] 的教训）。
6. 重连后必须整份重拉：全局通道无序号，且无订阅者时服务端直接丢弃。
