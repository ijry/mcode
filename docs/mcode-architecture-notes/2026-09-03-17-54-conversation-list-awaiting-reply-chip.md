# 会话列表显示「待回复」

会话列表的状态 chip 新增「待回复 / 待授权 / 待审批」一档，用于表达**智能体停在那里等用户回话**。
**改动只在 mcode-app 客户端**，CodeG 服务端一行未改（PC 上装的是官方 codeg `main` 构建，
不含二次开发）。因此客户端是在服务端既有能力之上做的，覆盖面见第三节。

## 一、问题：这个状态原先在服务端不存在

服务端有两套 status 枚举，**都不表达「在等用户」**：

| 枚举 | 位置 | 取值 |
| --- | --- | --- |
| `ConversationStatus` | SQLite `conversation.status` | `in_progress` / `pending_review` / `completed` / `cancelled` / `failed` |
| `ConnectionStatus` | 内存 `SessionState.status` | `connecting` / `connected` / `prompting` / `disconnected` / `error` |

`pending_review` 是「轮次跑完等你看结果」，不是「在问你」。而一个卡在提问上的会话，
`ConnectionStatus` 仍然是 `prompting` —— **与正常干活完全无法区分**。

真实状态是 `SessionState` 上三个 per-connection 的内存槽：

- `pending_permission` —— ACP `session/request_permission`（工具授权，含 Claude ExitPlanMode、codex plan_review）
- `pending_question` —— MCP `ask_user_question`（含 codex `request_user_input`、MCP elicitation 表单）
- `pending_plan_approval` —— Grok `_x.ai/exit_plan_mode` 计划审批

它们**不落库、无 TTL**，连接断或进程重启即丢。服务端已有统一判定
`SessionState::blocking_prompt(max_chars) -> Option<BlockedOn>`，返回
`BlockedOn { kind: Permission | Question | PlanApproval, request_id, title }`，
但原先只有委派 broker 与 work_task 引擎在用。

> 参考：持久化的等价物只有 work_task 那条线（`WorkTaskStatus::AwaitingInput` +
> `flip_awaiting` 落库 + `work_task_attention_count` 端点），会话侧一层都没有。
> 本次**没有**给会话补持久化，见「已知限制」。

## 二、根因：`pet://sessions` 只认 permission

mcode 唯一的跨会话活跃快照是 `pet_list_active_sessions` / `pet://sessions`，
而 `ConnectionManager::list_active_sessions` 原先只映射 `pending_permission`：

```rust
let pending = state.pending_permission.as_ref().map(PetPermissionSummary::from);
let is_active = pending.is_some() || matches!(state.status, Prompting | Error);
```

于是一个卡在 `ask_user_question` 上的会话 `pending: None` + `status: prompting`
→ 被 `PetSessionsPayload::from_entries` 算进 **`runningCount`** 而不是 `waitingCount`。
也就是说「智能体在提问」这件事在服务端侧**连聚合视图都没覆盖**。

同时 `pet_sessions.rs` 的事件过滤器 `is_sessions_relevant` 不含
`QuestionRequest` / `QuestionResolved` / `PlanApprovalRequest` / `PlanApprovalResolved`，
所以即便改了聚合，提问也不会触发重算推送。

## 三、服务端**不改**（重要前提）

本次**没有**也**不会**修改 CodeG 服务端 —— PC 上装的是官方 codeg（`main` 分支）构建，
不含任何二次开发。所以客户端必须在「服务端只上报 permission」这个既有约束下工作。

于是「待回复」的覆盖面被拆成两条独立来源，能力不同：

| 来源 | 覆盖范围 | 能识别 question 吗 |
| --- | --- | --- |
| **runtime 事件流**（客户端自己订阅 ACP `question_request` / `permission_request`） | 只有被订阅的会话：详情页当前那条 + 列表实时预览前 5 条，且要页面可见 | **能**。`RuntimeSession.status` 直接翻成 `waiting_question` |
| **`pet_list_active_sessions` 快照 / `pet://sessions` 推送** | 全实例、全活跃会话 | **不能**。官方 `list_active_sessions` 只映射 `pending_permission`，卡在 `ask_user_question` 上的会话 `pending: None` + `status: prompting`，被算进 `runningCount` |

**实际效果**：

- 列表实时预览挂着的那 ≤5 张卡 → 「待回复」**可用**（走 runtime）
- 其余所有卡 → 只有「待授权」可用（走 pet 快照的 `pending`）；question 看不见
- 客户端的归一化已经预留了 `blockedOn`：**如果**将来服务端补上这个字段（三类阻塞统一上报），
  全列表的「待回复」自动生效，客户端一行都不用改

如果哪天要推动服务端补齐，缺口是：`ConnectionManager::list_active_sessions` 只读
`pending_permission`，应改调已有的 `SessionState::blocking_prompt()`（它已经统一处理
permission / question / plan_approval 三类，返回 `BlockedOn{kind, request_id, title}`）；
`PetSessionEntry` 加一个 camelCase 的 `blockedOn`（**不要**直接复用 `BlockedOn` 类型 ——
它没有 `rename_all`，嵌进去会变成 `{kind, request_id, title}` 混合命名，而给它加 `rename_all`
会打断委派状态那边的既有消费者）；`PetSessionsPayload::from_entries` 改按新字段分桶；
`pet_sessions.rs` 的事件白名单补 question / plan_approval 四个事件。

**注意那是个牵连面不小的改动**：桌面端 `src/lib/pet/session-display.ts` 的
`sessionStatusKind` / `sessionSortRank`、`pet_state_mapper.rs` 的 ambient `pet://state`、
以及面板的应答卡（`SessionRow.tsx` 只在 `pending` 为真时渲染）都得跟着改，
否则角标说「等你」而面板行说「运行中」、桌宠动画还在跑。不是客户端能单方面解决的事。


## 四、客户端改动（mcode-app）

### 1. `services/conversation/awaitingReplyStore.ts`（新增）

`instanceKey → Map<conversationId, AwaitingReplyEntry>` 的纯模块。

**为什么外层要有 instanceKey**：会话号在不同连接上会重复，只用 conversationId
会把 A 机器的待回复标到 B 机器的同号会话上（与 `buildBulkSelectionKey` 同一个理由）。

归一化的兼容矩阵（同时吃 camelCase 与 snake_case）：

| 载荷 | 结果 |
| --- | --- |
| `blockedOn.kind === "permission"` | `waiting_permission` |
| `blockedOn.kind === "question"` | `waiting_question` |
| `blockedOn.kind === "plan_approval"` | `waiting_plan_approval` |
| 无 `blockedOn`，有 `pending` | `waiting_permission`（旧服务端回落） |
| 都没有 | `null` |

`ingestPetSessionsPayload` 是**整体替换**该实例的 Map，不合并 —— 载荷是全量活跃快照，
合并会让已经回答完的会话永远挂着 chip。

模块自带一个单调递增的 `version`，供 Vue 建立依赖（下文）。

### 2. `conversationTabBadgeService.ts`

ingest 挂在这里而不是列表页：这个服务由 `App.vue` 的 `onLaunch` / `onShow` 驱动，是
**App 级常驻**的，列表页没挂载时它也在收 `pet://sessions`。挂在页面上会重演角标那个老 bug
（冷启动落在「连接」页 → 会话页从未挂载 → 状态永远是空的）。

`tabbarActiveSessions.ts` 拆出 `fetchActiveSessionsPayload()` 返回原始载荷，
`fetchOngoingActiveSessionCount()` 变成它的薄封装。角标那条路改走前者，
于是**一次请求同时喂角标数字和待回复状态**，不必为列表再拉一遍。

### 3. `conversationOverviewPresentation.ts`

`resolveOverviewCardDisplayStatus` 不再把 waiting 折叠进 `in_progress`。新优先级：

1. `runtime === "error"` → `failed`
2. **runtime 说在等回复** → 原样返回（事件直接翻转，最快最准）
3. **pet 快照说在等回复** → 原样返回
4. runtime 真在执行（`thinking` / `running_tool`）→ `in_progress`
5. 其余 → summary 持久状态

**第 3 条压过第 4 条是刻意的**：断线期间事件被直接丢弃（帧上没有 event id、服务端无订阅者时
不入队），runtime 可能永久卡在 `thinking`；而 pet 快照是重连后按服务端内存态重算下发的，
那时它才是对的。让快照赢，这个洞就自愈。

配套：

- `isRuntimeExecutionStatus` 里删掉那两个 waiting 值（留着会重新折叠回去）
- `overviewStatusLabel`：`waiting_question` → 「待回复」、`waiting_permission` → 「待授权」、
  `waiting_plan_approval` → 「待审批」。文案分开是因为「回一个问题」和「批一次授权」
  对用户是两种不同的动作
- `overviewStatusClass`：三者共用 `waiting` 一种样式
- `sortRunningOverviewCardsFirst` 改**三档**：待回复 > 运行中 > 其余。等回复的会话在被回复前
  不会自己往前走，比在跑的更需要立刻被看到；tiebreak 仍用数组下标，不碰时间字段
- `buildOverviewDisplayModel` 增可选回调 `resolveAwaitingStatus(instanceKey, conversationId)`，
  与 `resolveRuntimeSession` 同样是回调而非 Map，保持纯模块可裸测

### 4. `conversationLivePreview.ts`

`LIVE_PREVIEW_STATUSES` 补 `waiting_plan_approval`。**这个集合的入参是 `displayStatus`**，
漏掉任何一个 waiting 值，那种卡就会被 `selectConversationLivePreviewIds` 排除 → 不再订阅
→ 「等待回答」预览文案消失，连 runtime 那一手待回复状态也一起丢。
预览文案同步补 `waiting_plan_approval` → 「等待审批」。

### 5. `pages/conversations/index.vue`

- `awaitingReplyVersion = ref(...)` 镜像存储版本号。`overviewDisplayModel` 里读一下它建立依赖。
  **不能把 Map 做成 `reactive`** —— Vue 3 对 Map 只在整体替换时触发依赖，改 key 不触发
- `pet://sessions` 处理器里 ingest + 同步版本号，走**立即**路径。原有的
  `scheduleActiveSessionsOverviewRefresh` debounce 是给「重拉会话列表」用的，
  秒级延迟对刷新标题无所谓，但「在等你回话」晚一秒出现就是一秒空等
- `onShow` 同步一次版本号，并在 `refreshConversationTabBadge()` 完成后再同步一次 ——
  页面未挂载期间常驻服务一直在 ingest，冷启动第一屏要能带上 chip
- 新增 `.status-chip--waiting` 样式：琥珀色（绿色读作「一切正常在自己跑」，正好相反；
  红色是异常，会让人以为出错）；呼吸动画 2.4s，比 `--running` 的 1.5s 慢，
  表达「停在这儿等你」而不是「正在推进」

## 五、已知限制

1. **全列表的「待回复」依赖服务端补字段。** 官方服务端只上报 `pending`（permission），
   所以只有实时预览挂着的 ≤5 张卡能靠 runtime 事件识别 question。见第三节的能力矩阵。
2. **不跨服务端重启。** pending 状态只在服务端内存（`SessionState` 的三个槽），
   `conversation` 表没有对应列。服务端重启后 chip 全部消失，但 agent 侧阻塞的 tool call
   可能仍在等 —— 状态与事实脱钩。
3. **`pet://sessions` 推送是 desktop-only。** 那个重算+推送的后台任务在 Tauri `setup` 里 spawn；
   纯 server 模式只有 HTTP 端点按需应答。server 模式下 chip 的实时性退化成
   「onShow / 下拉刷新 / 重连补拉」这几个轮询点。
4. **`DbConversationSummary` 没有待回复字段。** chip 是客户端 join 出来的，不是服务端一等字段。
5. **pet 列表与会话列表的行集不等价。** pet 侧过滤掉了没有 `conversation_id` + `folder_id` 的
   连接，以及非阻塞的委派子会话。没匹配到的卡片就是没有 chip，不会报错。


## 五之二、若将来服务端补齐，桌面端会连带出现的三处不一致

记录在此以免重复踩：把服务端分桶判据从 `pending` 换成统一的 blocking 判据之后，
CodeG **桌面端**有三处仍按老判据走，会与角标当场矛盾。mcode 客户端不受影响
（它只读 counts 与 `sessions[].blockedOn`），但那个服务端改动落地时这三处需一并处理。

1. **面板行的状态点 / 文案 / 排序**（`src/lib/pet/session-display.ts` 的 `sessionStatusKind`
   与 `sessionSortRank`，被 `src/app/pet-panel/_components/SessionRow.tsx` 使用）仍读
   `session.pending`。结果：卡在 `ask_user_question` 上的会话，精灵角标是琥珀时钟（waiting），
   面板那一行却是蓝色脉冲点 + 「运行中」，并被排到列表最后。
   该文件顶部的注释恰好承诺「这几处判据不会漂移」。
2. **ambient `pet://state` 与 `pet://sessions` 分叉**（`src-tauri/src/pet_state_mapper.rs`）。
   `PetGlobalState` 只有 `pending_permissions` 概念，`compute_pet_state` 的 Waiting 分支只看它,
   `is_acp_event_relevant` 白名单也不含 question / plan_approval 四个事件。于是角标说「等你」、
   桌宠动画仍是 `Running` 跑动；只有一个会话时，用户答题前后精灵一次都不变。
   现成判据可抄 `src-tauri/src/acp/lifecycle.rs` 的 `is_blocking_prompt_event`（正好是那六个事件）。
3. **卡在提问上的委派子会话会新增一行，但面板里无卡可应答**
   （`SessionRow.tsx` 只在 `session.pending` 为真时渲染 `PanelPermissionCard`）。
   点该行会跳到**父会话**，在那里展开子会话对话框才能答。连接维度是成立的
   （`acp_answer_question` 是 connection-scoped，`entry.connection_id` 就是子连接），缺的只是 UI。

另有两处属既有语义的扩大：errored 但残留提问的会话会从 `error_count` 挪进 `waiting_count`
（`pending_permission` 原本就是这个行为）；断连时 status 写入与 `cancel_questions_by_parent`
之间没有顺序保证，会短暂多出一行僵尸行，下次 rebuild 自愈。



## 六、原生端复刻要点（iOS / Android）

1. 拉 `POST /api/pet_list_active_sessions`，订阅 WS 全局频道 `pet://sessions`（帧形状
   `{channel, payload}`）。两者载荷同构。
2. 逐行读 `sessions[].conversationId`；阻塞类型优先读 `sessions[].blockedOn.kind`
   （官方服务端目前**不发**这个字段，为将来预留），回落 `sessions[].pending` → 视为 permission。
   存成 `(instanceKey, conversationId) → kind`，**必须带实例维度**（会话号跨连接重复）。
3. 每次载荷到达**整体替换**该实例的映射，不要合并 —— 载荷是全量活跃快照，
   合并会让已回答完的会话永远挂着 chip。
4. question（「待回复」）目前只能从**自己订阅的 ACP 事件流**里得到：`question_request` →
   置 `waiting_question`，`question_resolved` / `turn_complete` → 清除。所以原生端也要像
   mcode 一样对「正在跑的前若干条」建立实时订阅，否则只能显示「待授权」。
5. 卡片状态优先级：runtime error → runtime waiting → 快照 waiting → runtime 执行中 → 持久状态。
   「快照压过 runtime 执行态」那条不要省 —— 断线期间事件被直接丢弃，runtime 可能永久卡在
   `thinking`，快照是重连后按服务端内存态重算的，让快照赢这个洞才会自愈。
6. 断线重连后必须重新拉一次全量（事件无序号、断线期间直接丢弃），否则 chip 停在断线前的旧值。
7. 回答提问用 `POST /api/acp_answer_question`
   （`{connectionId, questionId, answer:{answers:[{questionId, labels}], declined}}`），
   授权用 `acp_respond_permission`（`{connectionId, requestId, optionId}`），
   计划审批用 `acp_answer_plan_approval`。三者都以 **connectionId** 而非 conversationId 定位。

