# 详情页接入后台任务（Tier 0）与两条被丢弃的免费信息

落地 [[2026-09-04-11-12-background-activity-mobile-gap]] 里的 **Tier 0**：详情页显示「还有几个后台任务在跑」，
并顺手接上同一批被客户端丢弃的两条事件（`turn_retrying`、`permission_queue_depth`）。
**服务端一行未改**（PC 上是官方 codeg `main` 构建），全部是在既有协议之上做的。

## 一、为什么这件事必须做

线上一直有这些字段，mcode 的 `normalizeAcpEventRecord` 却没有对应 case，于是**静默丢弃**
（`api/acp.ts` 的兜底透传要求帧上有 `data` 键，codeg 的扁平 envelope 永远没有）。
后果是手机上「轮次结束」显示为已完成 / 空闲，而 PC 上异步子智能体与后台 shell 还在跑、还在花钱 ——
用户据此合上电脑，正在跑的活跟着死（后台工作活不过 agent CLI 进程，而它的寿命就是连接的寿命）。

## 二、两条来源，覆盖面不同，必须都接

| 来源 | 事件 / 字段 | 覆盖 | 有明细吗 |
| --- | --- | --- | --- |
| **AIR 异步任务** | `async_task{delta}` + 快照 `async_tasks[]` | `run_in_background` 的 shell、workflow、monitor | 有：名字、类型、上一个工具、tokens、耗时、能否停止 |
| **转录派生** | `background_activity{outstanding, settled[]}` + 快照 `background_outstanding` | **含异步子智能体** | 无：只有一个数字 |

所以**「计数 > 清单行数」是正常情形**，不是 bug：adapter 明确在 AIR 通道忽略
`taskType: "local_agent"`，子智能体走 subagent 通道。呈现层因此取 `max(outstanding, rows.length)`
而**不是相加** —— 一个后台 shell 会同时出现在两边（转录里有它的 `backgroundTaskId` 回执，
AIR 通道也宣告它），相加会翻倍。服务端 `has_active_background_work` 出于同一理由用 OR
（`codeg-plus/src-tauri/src/acp/session_state.rs:1316-1346`）。

清单覆盖不到的那部分用一行说明兜住（「另有 N 个后台任务（异步子智能体）只上报数量，没有明细」），
否则用户会把清单当成全部。

## 三、新增模块

### 1. `services/conversation/asyncTasks.ts`（纯模块）

`codeg-plus/src/lib/async-tasks.ts` 的移植，**合并规则必须与服务端
`SessionState::apply_event` 一致**，否则「中途 attach 的客户端」与「收全了每条增量的客户端」
会收敛到不同的行。三条规则都写了测试锁死：

- **只有 `spawned` 增量能建行。** 指向未知 id 的进度帧被丢弃 —— 宣告帧（唯一携带名字 / 类型 /
  能否停止的那一帧）漏了的话，一个无名占位行比没有行更糟。
- **缺省即保持原值。** 进度 tick 只带变化的字段，把缺省当「清空」会在第一次更新时擦掉任务名。
  归一化因此用 `?? undefined` 而不是 `|| ""`：`false` / `""` 是显式值，必须落地。
- **终态行保留在表里。** adapter 会继续修订已完成的任务（补迟到的 `outputFilePath`、把猜出来的
  `stopped` 纠正成真正的 `completed`）。删了行会被它自己的纠正重新创建，而**身份是 `spawned`
  携带的**，于是它会以无名状态回来。「显示什么」交给 `liveAsyncTasks`（只留非终态）。

空转时**返回同一个数组引用**，store 据此跳过 reactive 写入 —— 一个 monitor 每秒都发进度 tick，
这是热路径。

快照水合分两个方向，判据是「快照能否被证明比本地游标新」：

| 情形 | 函数 | 理由 |
| --- | --- | --- |
| 快照更新 | `mergeAsyncTasks`（按 id 替换整行） | 服务端已经合并过 |
| 快照已被本地追过 | `adoptUnknownAsyncTasks`（**只增不改**） | 它的行可能更旧，按 id 替换会把本地已看到跑完的任务走回 `running`，而那条终态事件不会重放来纠正。行上没有版本号，只能用结构性规则代替逐行比较 |

`usage` 三个字段**整体判定**：缺任何一个就整份丢掉。上游宁可丢半份也不发局部，
拼出来的「0 tokens」会被读成真实测量值。

### 2. `services/conversation/backgroundActivity.ts`（纯模块）

`outstanding` 缺失时留 **`null`** 而不是 0：`0` 是「后台已空」的权威结论（会让胶囊收起），
`null` 是「这一帧没说」（保持原值）。把缺失当 0 会让一条畸形帧把正在跑的后台任务从界面上抹掉。

`settled[]` 落成一条上限 5 的滚动日志，**按到达顺序追加、不按 id 去重** ——
同一个 taskId 可以结算多次（已完成的子智能体被 `SendMessage` 唤醒后会再通知一次）。

**`turns[]` 刻意不消费。** 那是转录尾解析出的出轮次轮次，按 `MessageTurn.id`
（`bg-<episode-offset>-<idx>`）upsert、靠 `watermark` 与详情拉取对账退休。要正确落地它得同时解决
「与历史分页共存」「upsert 而非 append」「与 SQLite 缓存对账」三件事，属独立一期；
`api/acp.ts` 里也**不把 turns 带进 envelope**（整轮消息数组，白占内存与桥接带宽）。

### 3. `pages/conversation-detail/detailBackgroundTasks.ts`（呈现层纯模块）

汇总胶囊、清单行、缺口说明文案，以及「状态胶囊要不要改口」的判据：
**只认空闲侧状态**（`connected` / `idle`）。`thinking` / `running_tool` 本来就在说「在跑」，
覆盖它会丢掉「模型正在写」这个更强的信息；`error` / `disconnected` 更不能被一句「后台运行中」盖住。

## 四、store 与协议改动

`api/acp.ts` 新增 case：`async_task`（原样透传 delta，归一化留给纯模块）、`background_activity`
（只带计数 / 结算 / watermark）、`permission_queue_depth`，并在 `permission_request` 上补读 `queued`。
`turn_retrying` **归一到既有的 `api_retry` 槽位**（`message` → `error`），因为它与 Claude 的
`api_retry` 是同一件事的两种上报方式，重试横幅只有一处，两条来源各写一份必然打架。

`RuntimeSession` 新增 `asyncTasks` / `backgroundOutstanding` / `backgroundSettled` /
`backgroundSettledSeq` / `permissionQueueDepth`。要点：

- **快照是中途 attach 唯一能补回后台态的地方**：`background_activity` 与 `async_task` 都是一次性
  事件，seq 低于水位后不会重放（服务端注释原话就是为此把 `background_outstanding` 放进快照，
  `session_state.rs:1854-1862`）。
- **`background_activity` 不改 `status`。** 后台有活不等于当前回合在跑；改口的决定权在呈现层。
- **连接失效 / 换连接时整表清空**（`resetBackgroundActivityState`，挂在既有的 5 处能力位清零点）。
  即便 mcode 只是本地 detach（PC 上那条连接还活着），清掉也是对的：我们已经不再收它的增量，
  留一个再也不会更新的数字比没有更糟，重新 attach 时快照会补回来。
- `permissionQueueDepth` 在 `clearPendingPermission` 里清零，等服务端下一条事件重报。
  **宁可短暂少报也不多报** —— 「还有 2 条」挂在一个其实已经空了的队列上，会让用户白守着。
- `backgroundSettledSeq` 单调递增，供 UI 建立「有新结算」的依赖：数组内容可能重复，按内容判新会漏。

## 五、UI 行为

- 状态行新增「后台 N」琥珀色胶囊（与「计划 n/m」并列）。琥珀色的理由与会话列表「待回复」chip 同源：
  绿色读作「一切正常」、红色读作「出错了」，都与「还有活在跑，别关机」相反。
- 轮次结束但后台有活时，状态文案改成「后台运行中 N」，圆点按 `running` 上色 ——
  灰色会读作「什么都没在发生」。
- 点胶囊打开底部抽屉：逐行 `名字 / 类型 · 状态 · 上一个工具 · tokens · 耗时`，`canStop` 为真才给
  **停止**按钮。停止的三条约定：`false` 是 adapter 的**裁决**（服务端 200 + `false`），文案说
  「未接受」而不是「请重试」；**成功后不锁按钮**（行的消失由线上终态事件决定，那才是真确认）；
  **不做本地乐观更新**（任务表唯一权威是服务端合并结果，抢先改成 `stopped` 会与随后到达的
  真实终态打架）。
- 授权卡片标题后显示「还有 N 条待授权」。
- 每批 `settled[]` 弹一条页内 toast。**这是妥协**：桌面端对每条弹 OS 通知
  （`codeg-plus/src/lib/notification.ts`），而 mcode 没有任何通知通道，所以只有用户正看着这条会话时
  才提示得到。真正的解法是推送，见分析笔记第三节 Tier 2。

## 六、本期**没有**做

1. **会话列表不显示后台任务。** 列表的 ≤5 张实时预览卡其实也 attach、也能收到这些事件，
   但要显示得把 `backgroundOutstanding` 串进 `conversationOverviewPresentation`；
   而列表上其余卡片**结构上拿不到** —— `pet://sessions` 的行集判据是
   `pending_permission.is_some() || status ∈ {Prompting, Error}`（`manager.rs:2448-2453`），
   轮次结束后 status 回 `Connected`，只剩后台任务的会话直接从快照里消失。
   要全列表覆盖必须服务端补字段（Tier 2）。
2. **全局状态条（Tier 1）**、**`turns[]` 渲染**、**推送**。

## 七、原生端（iOS / Android）复刻要点

1. 后台任务数**两个来源都要接**：attach 快照的 `background_outstanding`（中途 attach 唯一能补的
   路径）+ `background_activity.outstanding`（一次性、不重放）。只接事件的客户端中途 attach 会显示 0。
2. 显示数量取两者 `max`，**不要相加**（后台 shell 同时出现在两边）。
3. AIR 表的合并规则三条（只有 `spawned` 能建行、缺省即不变、终态行保留）必须与服务端一致；
   快照水合按「能否证明更新」二选一，陈旧快照**只增不改**。
4. `turn_complete` 之后 `outstanding > 0` 仍要显示忙 —— 这是整件事的要点。
5. 停止按钮只在 `can_stop` 为真时给；`false` 返回值是裁决不是错误；成功后不要锁住按钮。
6. 连接失效即清空后台态（后台工作活不过 agent CLI 进程）。
7. `settled[]` 是最佳的推送触发点；原生端有通知权限时应当在这里发本地通知，而不是像 H5 这样只弹 toast。
