# 底部 tabbar 待办改为任务页（对接 codeg-plus Work Task）

## 背景

底部 tabbar 第三格原先是「待办」（`pages/todos/index`）：本地 `mcode_todos` 存储 + xycloud 云端待办，功能上只是一个清单，与 codeg 服务端没有关系；把待办「发送到新会话」是它唯一与 codeg 相通的动作。

codeg-plus 桌面端已有一整套 **Work Task**（任务）能力：任务由服务端引擎**无头执行**，每个任务在独立 git worktree 里跑一个 agent 会话，人只负责下单与验收（合并 / 完成 / 推回 PR / 继续处理）。这一能力此前手机端完全缺失。

本次把 tabbar 第三格换成「任务」页，完整对接 codeg-plus 的 work task 功能。待办**没有删除**：它与 codeg 连接无关（本地 + xycloud），入口移到「我的 → 应用设置 → 待办」，项目详情页的「待办」tab 也保持原样。

需求编号：无（由用户直述）。

## 架构与数据流

### 分层

| 层 | 文件 | 职责 |
|---|---|---|
| 类型 | `src/types/workTask.ts` | 镜像 `codeg-plus/src-tauri/src/models/work_task.rs`。字段名**逐字沿用服务端**（snake_case），不在类型层驼峰化 |
| 服务 | `src/services/workTask.ts` | 全部 `work_task_*` 命令的唯一封装 + 归一化。每个导出是 `gateway.call<T>("<command>", payload)` 的薄包装 |
| 服务 | `src/services/taskDetail.ts` | 详情页路由构造/解析 + 连接能力判定 |
| 服务 | `src/services/taskFilterPreference.ts` | 列表筛选偏好持久化（`mcode_task_list_filter`） |
| 纯模块 | `src/pages/tasks/taskStatus.ts` | 状态 → 分组/文案/色调；tab 定义；角标计数 |
| 纯模块 | `src/pages/tasks/taskAcceptance.ts` | 验收判定谓词（能不能合并 / 完成 / 推回 PR） |
| 纯模块 | `src/pages/tasks/taskActions.ts` | 卡片与详情页动作集推导 + 允许性校验 |
| 纯模块 | `src/pages/tasks/taskPresentation.ts` | 列表过滤/排序、卡片文案、时间格式、推进记录文案 |
| 纯模块 | `src/pages/tasks/taskFollowUp.ts` | 四种继续处理意图 |
| 纯模块 | `src/pages/tasks/taskSchedule.ts` | 定时运行的本地↔UTC 换算 |
| 纯模块 | `src/pages/tasks/taskRestartGuard.ts` | forge 复活守卫拒绝解析 |
| 页面 | `src/pages/tasks/index.vue` | 列表页（tabbar 第三格） |
| 页面 | `src/pages/task-detail/index.vue` | 详情页 |
| 组件 | `src/pages/tasks/components/*.vue` | 头部、卡片、状态胶囊 + 8 个底部弹层 |
| 共享样式 | `src/pages/tasks/index.scss` | 跨组件共享类（`<style scoped>` 不跨边界） |

纯模块不 import uni / pinia / 组件，因此可裸测；页面只保留响应式与路由。这是 `pages/conversations/conversationOverviewPresentation.ts` 已确立的分工。

### 不走 `api/acp.ts`

`acpApi` 单例默认打到全局 auth store 的网关。任务页同时装着**多条连接**的任务，每个动作必须显式选网关，所以命令走 `services/workTask.ts` 的 `gateway` 参数形式（同 `services/remoteSettings.ts`）。

例外：事件订阅仍走 `acpApi.subscribeGlobalEvent(channel, cb, instanceKey)` —— 它本来就是 instanceKey 维度的，支持多实例。

### 数据流

```
每条已连接且支持任务的连接
  → openConnectionGateway(connection)            解析网关
  → work_task_list({ folderId: null })           拉全量
  → loadRemoteProjects(gateway)                  项目名（仅显示用，失败不阻塞）
  → 打上 connectionKey 摊平成 TaskListEntry[]
  → filterTaskEntries(entries, filter)           tab/搜索/连接/项目/可见性
  → 按 updated_at 倒序渲染

subscribeGlobalEvent("task://changed", …, instanceKey)
  → scheduleRefresh()  300ms 合并窗口 → 重新拉全量
```

**每个写操作都是「发出去 → 重新拉取」，不做乐观更新。** 状态机在服务端，每次迁移都是带期望状态的 CAS（条件更新），客户端猜出来的中间态只会和真相打架。

## 协议

全部命令都是 `POST /api/<command>`（直连）或 `POST /v1/proxy/<command>`（网关），载荷 camelCase，DTO 内部（`draft` / `settings`）snake_case。

### 生命周期

| 命令 | 载荷 | 返回 | 备注 |
|---|---|---|---|
| `work_task_list` | `{folderId: number\|null}` | `WorkTask[]` | null = 全部文件夹 |
| `work_task_get` | `{id}` | `WorkTask` | |
| `work_task_events` | `{taskId, limit}` | `WorkTaskEvent[]` | limit 默认 500 |
| `work_task_create` | `{draft}` | `WorkTask` | |
| `work_task_update` | `{id, draft}` | `WorkTask` | |
| `work_task_delete` | `{id, deleteWorktree}` | `void` | |
| `work_task_start` | `{id}` | `void` | todo → queued |
| `work_task_retry` | `{id, note, blocks, allowDuplicateSource}` | `void` | failed → queued |
| `work_task_requeue` | 同上 | `void` | canceled → todo |
| `work_task_schedule` | `{id, scheduledAt}` | `void` | ISO 时刻；null 清除 |
| `work_task_return` | `{id, feedback, intent, blocks}` | `void` | 继续处理 |
| `work_task_cancel` | `{id, reason}` | `void` | |
| `work_task_merge` | `{id, message, deleteWorktree}` | **`boolean`** | true = 被排队 |
| `work_task_merge_unqueue` | `{id}` | `void` | |
| `work_task_deliver_pr` | `{id, prTitle, draft}` | **`string`** | PR 地址 |
| `work_task_complete` | `{id, deleteWorktree}` | `void` | 同步落定 |
| `work_task_archive` | `{id, archived}` | `void` | |
| `work_task_cleanup` | `{id}` | `void` | 重试 worktree 清理 |
| `work_task_diff` | `{id, file}` | `string` | file=null 全量 |
| `work_task_changed_files` | `{id}` | `WorkTaskChangedFile[]` | |
| `work_task_settings_effective` / `_get` / `_get_own` / `_set` / `_delete` | `{folderId[, settings]}` | 见 `WorkTaskFolderSettings` | folderId 0 = 全局行 |
| `work_task_template_list` / `_save` / `_delete` | `{} / {draft} / {id}` | | 按名字 upsert |

### 三条容易踩的返回值约定

1. **`work_task_merge` 返回布尔**：`true` = 合并被排在同项目另一次落地之后，而不是立即开始。读成 void 会让用户以为点击丢了（卡片还停在待验收）。非布尔响应按 false 处理（老服务端 / 代理包装），避免误报「已排队」。
2. **`work_task_deliver_pr` 与 `work_task_complete` 同步落定**，`work_task_merge` 只等派发：前两者没有 agent 参与，抛出的错误就是真实原因，所以错误显示在弹层里；合并的结果通过事件到达，错误落在卡片上。
3. **`work_task_settings_get_own` 返回 null 就是「跟随全局」**，不能补成一份默认值 —— 界面靠这个 null 区分「单独配置」与「跟随全局」，没有额外的布尔字段。

### 事件

通道 `task://changed`（服务端 `web/event_bridge.rs::WORK_TASK_CHANGED_EVENT`），载荷只有 id，客户端一律重新拉列表。引擎无头运行，**这是打开的列表唯一能知道任务推进了的途径**。写错通道名不会报错，只会安静地一直显示旧数据 —— 因此测试里把它作为硬契约断言。

### 连接能力

`work_task_*` 是 **codeg-plus 独有**的命令族：opencode（另一套 agent 协议）与 mcode-desktop（转发壳）都没有这些路由，请求会 404。`isTaskCapableConnection` 只放行 `targetAgent === "codeg"`；缺失 targetAgent 的老记录按历史默认放行，让请求自己去报错，而不是凭一个缺失字段把功能藏起来。

## 状态模型

十个服务端状态收成四个展示分组，与 PC 端看板四列同一套词汇（手机屏放不下十个 tab，且用户真正要区分的只有四件事）：

| 分组 | tab 文案 | 状态 |
|---|---|---|
| `todo` | 待办 | `todo` `queued` |
| `inProgress` | 进行中 | `preparing` `running` |
| `attention` | 等你处理 | `awaiting_input` `review` `merging` `failed` |
| `done` | 已完成 | `done` `canceled` |

三条刻意的归类，与 PC 端逐字一致：

- **`queued` 归待办**而不是进行中 —— 它还在等并发槽，什么都没发生。
- **`merging` 归等你处理**而不是已完成 —— 卡片不能在用户点了合并之后就跳组；它留在原处，落地后直接进已完成。
- **未知状态归等你处理** —— 那是唯一一个「有人得看一眼」的分组，塞进已完成会让一个还活着的任务看起来已经结束。

两个容易混的集合：

- **tab 角标计数不含 `merging`**（`ATTENTION_STATUSES`）：合并中的任务正在自己往前走，没有等着用户做的决定，算进角标会催用户去看一个看了也没事可做的任务。分组包含它是为了卡片不跳列 —— 两者服务于不同目的。
- **`isTaskLive`（能否附着看流式输出）≠ 进行中分组**：`preparing` 还没有会话可看，`awaiting_input` / `merging` 有。

## 验收判定

`taskAcceptance.ts` 的谓词决定「待验收任务给哪个按钮」。服务端会重新校验每一条，这里只决定要不要把按钮画出来，所以偏保守。

- `hasNothingToMerge`：**只有 `files_changed === 0` 算**没改动。`null` 表示引擎读不到统计，那里合并仍是安全默认 —— 一次读取失败不该让用户把有改动的任务当空任务收掉。引擎在真正结束任务前会重跑同一个 diff。
- `worktreeWasRemoved` vs `isWorktreeGone`：差一件事 —— 从未初始化过（没有 `work_branch`、没有 worktree）的任务不是「被删」，它只是还没开始。`work_branch` 是「曾有 worktree」的证人，它活过那次清空文件夹指针的解绑。
- `mustDeliverToPr`（`source_kind === "forge_pr"`）：服务端**拒绝**这类任务的本地合并（在本地落地会把 PR 的改动在作者背后吃进去，评审却还开着），所以界面上不能给合并按钮。
- `mergeQueueRanks` 按**时刻**比而不是字符串比：服务端写的 RFC 3339 小数位数不固定，`"…:00Z"` 在字典序里排在 `"…:00.5Z"` 之后。

## UI 行为

### 列表页（tabbar 第三格）

- `up-sticky` + `up-status-bar` + 大标题头部（与原待办页、圈子页同一形态；`navigationStyle: "custom"`）。
- 头部：`WORK TASKS` eyebrow + 「任务」大标题 + 筛选摘要 + 三个工具按钮（设置 / 筛选 / 新建）+ `up-search` + `up-tabs`。
- **`up-tabs` 是下标驱动的**（`:current`），页面持有 tab id，两者之间转一次。回调形状各版本不一致（`{index}` / item / 裸下标），三种都认 —— 认错会让点 tab 没反应。
- tab 角标只挂「等你处理」且只在有数时挂：每个 tab 都带数字会让顶部变成一排噪音。
- 卡片：agent 图标 + 标题 + 状态胶囊 / 项目·分支·变更·时间 / 角标行（计划开始、排队合并、预检、worktree 已删、清理失败、保留 worktree）/ forge 来源 / 副行（错误 → 实时进展 → 结果摘要，错误优先）/ 动作条（一个实心主动作 + 图标次动作）。
- 整卡点击进详情页；动作按钮 `@click.stop`。
- 下拉刷新（`enablePullDownRefresh: true`）、`onShow` 重拉、`task://changed` 实时刷新（300ms 合并窗口）。
- 空状态分三档：无连接（给「前往连接」）、加载失败（给「重试」）、筛选为空（`resolveTaskListEmptyText` 区分「还没有任务」/「没有匹配」/「该状态下暂无」/「都归档了，去打开开关」）。
- 部分连接读取失败时**不遮挡**已加载的任务，只在列表末尾说明。

### 详情页

四段，与 PC 端右侧抽屉同序（同一件事在两端按同一顺序读到）：

1. 头部（返回 / 标题 / 状态 / 项目·agent·分支）
2. 动作区（当前状态的推进动作，与卡片共用同一份判定；预检红绿灯与排队提示在此）
3. 信息与变更（任务描述、结果摘要、git 坐标、变更文件、diff）
4. 推进记录（`work_task_event` 时间线，`round` 事件被过滤 —— 它喂的是会话回放的阶段分隔）

底部工具栏放**不推进状态**的：打开会话、编辑、重试清理、删除。删除成功后 `navigateBack` —— 主体已经不存在了。

diff 复用 `components/GitDiffViewer.vue` + `services/projectGit.buildGitDiffView`。

### 「点击直接打开会话详情页」

任务跑起来后有一个真实的 codeg 会话，与会话列表里的会话是同一个东西，所以复用同一个详情页路由 `?id=&folderId=&connectionId=`，而不是做一个只读回放。

**`folderId` 用 worktree 文件夹**（`worktree_folder_id || folder_id`）：会话就跑在那里，用项目 folder_id 会让详情页拿到错误的目录上下文。

### 八个弹层

| 弹层 | 关键行为 |
|---|---|
| 编辑器 | 新建/编辑同一组件。**agent 覆盖没碰过就不写**（`agentDirty` false → draft 里 `agent_type: null`，继续继承）；已有 worktree 时锁死项目选择；模板列表 + 存为模板（按名 upsert） |
| 合并 | 自动提交信息开关 / 自定义提交信息 / 合并后删 worktree。已排队时回填挂起的那次合并选项；拒绝信息**显示在弹层内**（模态背后的 toast 读不到） |
| 验收 | `complete` 与 `deliver` 共用。推回 PR 时不给标题/草稿字段（不创建任何东西） |
| 取消 | 理由可选（一次没有解释的停止仍然正当）；待验收的「放弃」走同一个弹层 |
| 重启 | 备注可选。**forge 复活守卫**拒绝时显示在弹层内并把按钮换成「仍然重启」（带 `allowDuplicateSource` 重发）—— 它是唯一有出路的拒绝 |
| 定时 | 日期 + 时间两个 `up-datetime-picker`。**打开时是空的**除非已有计划；选了日期才补时间；过去的时间接受并说明 |
| 继续处理 | 四个意图 chip，只有「自查验证」允许空文本 |
| 设置 | 作用域 = 项目或全局（`folderId 0`）。「配置来源」两个 chip：跟随全局（delete 自己那行）/ 单独配置（set）；5 个阶段提示词 tab |
| 筛选 | 连接 → 项目 → 两个可见性开关。切连接时清掉项目（folder_id 是按连接的） |

### 两处防误触

- **点击前对着实时那一行再校验一次**（`isTaskActionAllowed(live, id)`）：卡片可能已经过期（引擎在点击瞬间领走了任务），服务端 CAS 也会拒绝，但那会以一条错误 toast 砸到用户脸上 —— 而这次点击本身是合理的。
- **重启的豁免必须显式传参**（`@click="submit(duplicate != null)"`）：直接把函数挂到 `@click` 上会让事件对象成为第一个参数，而任何事件对象都是 truthy，等于每次重启都绕过守卫。

### 编辑器有自己的连接作用域

任务 id 只在它自己的服务端唯一，所以编辑必须落在**任务自己的**连接上 —— 发错服务端会更新到一个同 id 的无关任务上。但这件事**不能靠改 `filter.connectionKey`** 来做到：那样点一下别的连接上任务的「编辑」，整个列表会跟着收窄到那条连接，用户只想改个标题却发现别的机器的任务全不见了。所以编辑器持有独立的 `editorConnectionKey` / `editorGateway`，列表筛选不动。

### 两处并发守卫

同一个刷新有三条触发路径（`onShow`、事件防抖、每个动作的 finally），它们能同时在飞：

- **列表页：在飞的拉取不复用**（`loadDirty` 标记 + `runLoadChain` 循环）。`runAction` 在 finally 里 `await loadTasks()`，如果防抖定时器刚好在这次写操作**之前**发出了请求，复用那个 promise 等于让调用方拿到一份看不到自己刚做的改动的列表。在飞时只记脏标记，飞完补跑一趟。
- **详情页：过期响应丢弃**（单调递增 `loadSeq`）。三个请求的返回顺序不保证；没有序号守卫时，一个先发出、后返回的旧响应会把新状态盖回去 —— 用户会看到刚点的操作「没生效」。两个从属请求（events / changed files）也各自带序号，否则它们的旧结果仍会覆盖。

## 兼容性

- **待办没有删除**：`pages/todos/index` 仍注册，入口移到「我的 → 应用设置 → 待办」（`navigateTo`，它已不在 tabBar 里）。待办头部新增返回箭头（判据是页面栈深度 > 1，两种入口都不用改调用方）。
- `pages/project-detail/components/ProjectTodosPanel.vue` 与 `tests/pages/todos/todoState.spec.ts` 继续依赖 todos 的组件与状态模块，未动。
- **`CONVERSATIONS_TABBAR_INDEX = 1` 是按位置取的**（`uni.setTabBarBadge({index})`）：会话必须留在下标 1。本次只替换下标 2，会话角标不受影响；测试里两条都断言。
- tabBar 图标沿用 `static/tabbar/todos.png` / `todos-active.png`（清单图标对任务同样贴切，避免为改一个字新增资源）。
- `config` 列历史上可能是 JSON **字符串**（早期版本直接塞文本），归一化两种都接，解析失败降级成 null。
- `delete_worktree_default` 内置默认是 **true**（与 Rust `Default` 一致），缺字段读成 false 会让合并弹层默认不清理 worktree，与 PC 端不一致。
- 未知状态原样透传，不做白名单校验 —— 硬校验会让服务端新增的状态整行消失。
- 手机端 composer 目前只送一个 text 块（不支持 `@` 引用与图片附件）。编辑一个 PC 端带图片块的任务会**替换掉**那些块，编辑弹层顶部明确写出这一点。

## 测试

157 suites / 1329 tests 全绿，其中本次新增 **157** 条：

| 文件 | 覆盖 |
|---|---|
| `tests/pages/tasks/taskStatus.spec.ts` | 规格表与 `groupForStatus` 一致且穷举每个状态；三条刻意归类；角标不含 merging |
| `tests/pages/tasks/taskAcceptance.spec.ts` | `files_changed` 0 vs null；worktree 三态；队列名次按时刻排；PR 来源强制交付 |
| `tests/pages/tasks/taskActions.spec.ts` | 每状态动作集；merging/已排队无主动作；每状态至多一个 primary；**画出来的每个动作都必须是允许的** |
| `tests/pages/tasks/taskPresentation.spec.ts` | 过滤/排序/搜索四字段；tab 计数忽略自身 tab；空状态措辞；卡片副行优先级；时间格式；推进记录文案 |
| `tests/pages/tasks/taskFollowUpSchedule.spec.ts` | 只有自查允许空；本地时区解析（不加 Z）；跨天退到 23:00；复活守卫解析（含标题带右括号、措辞漂移降级） |
| `tests/pages/tasks/tasksPageContract.spec.ts` | pages.json 注册与 tabBar；会话仍在下标 1；待办仍可达；订阅通道与防抖；在飞拉取不复用；过期响应丢弃；每次写后重拉；按 entry 选网关；编辑器独立作用域（含「不得改动列表筛选」的反向断言）；worktree folderId；datetime-picker 两种 mode 绑定值类型；共享样式表双向约束；`upThemeVar` 经代理取 |
| `tests/services/workTask.spec.ts` | 通道名硬契约；camelCase 载荷；merge 布尔语义；豁免默认 false；`0` 不被 `\|\|` 吞掉；legacy settings 解码 |
| `tests/services/taskDetail.spec.ts` | 路由编解码；连接能力判定；筛选偏好归一化 |

另外锁了一条 uview-plus 的隐式契约：**`up-datetime-picker` 两种 mode 的绑定值类型不同** —— `date` 吃毫秒时间戳，`time` 吃 `"HH:mm"` 字符串（见其 `correctValue`）。给 time picker 传数字会走进「时间错误，请传递如 12:24 的格式」分支：时间列直接不显示，且**不抛错**。

组件从不挂载（`testEnvironment: node`，仓库无 `@vue/test-utils`），模板与接线的不变量按字符串断言 —— 与 `conversationListNavbarHeader.spec.ts` 同法，每条断言的注释说明它防的是什么坑。

## 原生 iOS/Android 复刻指引

1. **分层照搬**：状态分组、验收谓词、动作集推导必须是无副作用的纯函数，与网络层和 UI 层分开 —— 它们是与 PC 端保持一致的唯一保证，也是唯一能单测的部分。
2. **任务按连接分区**：任务 id 只在它自己的服务端唯一。列表可以摊平多台连接，但每个动作必须携带它所属连接的传输通道；不要用「当前连接」这个隐式全局。
3. **状态收成四组，不要展示十个原始状态**：`queued` 归待办，`merging` 归等你处理，未知状态归等你处理。角标计数**不含** `merging`。
4. **`task://changed` 是唯一的推进信号**，载荷只有 id → 一律重新拉列表，并加一个 ~300ms 合并窗口（一次迁移会连发多条事件）。断线重连后必须重新拉一次（断线期间事件被服务端直接丢弃，无从补发）。
5. **不做乐观更新**：每个写操作发出去后重新拉取。点击前用实时那一行再校验一次动作允许性。
6. **刷新并发要处理两件事**：(a) 写操作之后的刷新不能复用一个在写之前就发出的在飞请求 —— 记脏标记、飞完补跑；(b) 多个刷新同时在飞时用单调序号丢弃过期响应，包括从属请求。两者缺一都会让用户看到「操作没生效」。
7. **三条返回值语义**：merge 返布尔（true=已排队）、deliver 返 PR 地址、complete/deliver 同步落定而 merge 只等派发。错误归属据此分配（弹层 vs 卡片）。
8. **`files_changed === 0` 与 `null` 必须区分**。用「取值或默认」的写法（`??` 而不是 `||`）解析所有可空整数。
9. **`work_task_settings_get_own` 的 null 是语义值**（跟随全局），不要补默认值；「跟随全局」保存时是 delete 而不是写一份等于全局的副本 —— 后者会在全局改动后静默停止跟随。
10. **定时运行是本地墙上时钟**：输入用本地日期+时刻两个字段，解析时不加时区后缀，保存时转 UTC 时刻，显示时转回本地。过去的时间接受并说明。
11. **打开任务会话用 worktree 文件夹**，不是项目文件夹。
12. **复活守卫的豁免要显式传布尔**，别让点击事件对象当参数；那个拒绝显示在弹层内并提供「仍然重启」。
13. 只用平台自己的运行时主题变量（本仓库是 `--up-*`），不新增私有别名。
