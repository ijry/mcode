# 会话授权模式活过重连 + 任务弹层按 agent 记住上次选项

需求编号：无（用户直述「每次只要我在 Mcode 会话详情回复一条消息，Claude 的权限就会从
bypass 变成 Manual」与「任务面板创建任务能不能记忆每个 agent 的上次配置的智能体选项」）。

两件事都是「用户选过的东西没被记住」，但根因、落点和判定完全不同，所以分开写。

## 一、授权模式在重连后退回 default（显示成「Manual」）

### 根因链（三段都有实证）

1. **`Manual` 就是 `default`**。`@agentclientprotocol/claude-agent-acp@0.69.0`
   （codeg-plus registry 给 ClaudeCode 装的适配器）把 `default` 这个模式显示成
   「Manual」（`dist/acp-agent.js:5313-5316`，注释写明 Claude Code 2.1.200 起改的名）。
   mcode-app 的权限行渲染的是 `available_modes[].name`
   （`detailComposerPresentation.detailPermissionSummary` → `composerTools.findModeName`），
   所以「bypass → Manual」在协议层就是 `bypassPermissions → default`。

2. **新建/恢复的 ACP 会话一律从 `default` 起步**。同一份适配器在建会话时取
   `resolvePermissionMode(settings.permissions?.defaultMode)`（`dist:4739`，落地在
   `dist:5020-5050`）—— 用户没在 `~/.claude` 里配 `permissions.defaultMode` 就是
   `default`。`session/set_mode` 设的模式活在那个进程里，**不进任何持久化**。

3. **手机端的连接会被定时回收**。codeg-plus 有一道
   `acp/manager.rs::sweep_idle`（由 `acp/idle_sweep.rs` 定时调用）把空闲连接断掉。
   本机日志 `~/.codeg/logs/codeg.2026-09-05.log` 里 `owner_window=web` 的 5 次 spawn
   与 5 次 `idle sweep disconnecting connection=` **一一配对**（间隔 4–19 分钟），
   即手机端每隔几分钟就换一条新连接。

于是：切 bypass → 放一会儿 → 回一条消息触发重连 → 新会话从 `default` 起步 → 权限又要
一个个批。**客户端这一侧唯一能补的就是建连时把用户的选择一起交回去**，而
`connectionSessionManager.connectConversation()` 此前把 `acp_connect` 的
`preferredModeId` / `preferredConfigValues` 写死成 `undefined` —— 这两个字段只有新建会话
弹层传过（`CreateConversationSheet`）。

### 改法

新增 `src/services/conversation/sessionModeMemory.ts`：把用户在某条会话里**显式选过**的
`modeId` / 配置取值记在本机，建连时交给 `acp_connect`。

```
用户点选授权模式 / 模型
  → acp_set_mode / acp_set_config_option（立即生效，原有行为）
  → persistAgentConfigSelection(...)        本机 UI 该显示什么（原有）
  → rememberConversationSessionMode(...)    要发回远端的意图（新增）

下一次建连（页面打开 / 连接被回收后重发 / connection-not-found 恢复）
  → readConversationSessionSelection(conversationId, agentType)
  → acp_connect { preferredModeId, preferredConfigValues }
  → codeg-plus apply_preferred_session_options（connection.rs:5841）→ session/set_mode
```

存储：`mcode_conversation_session_mode_v1`，值
`Record<conversationId, {updatedAt, agentType, modeId, configValues}>`，无 TTL，上限 120 条
（按 `updatedAt` 丢最旧）。

### 五条判定

1. **不违反「不自动重放」那条约束**
   （`2026-07-03-detail-session-config-no-auto-replay.md` 禁止 attach/重连时对**已有
   会话**发 `acp_set_mode`，那会把另一端刚设好的现场配置掀掉）。这里走的不是那条路：
   codeg-plus 的 `spawn_agent` **先做连接去重** —— 命中同一个 external session 就直接
   复用并 `return`，**跳过** `apply_preferred_session_options`。所以这两个字段只在
   「这条连接由我们新建」时生效，那时根本没有活着的会话可被打扰。代码里也保留了反向
   断言：`connectionSessionManager` 不得出现 `acpSetMode`。

2. **键是 `conversationId` + agent，不含项目路径也不含 instanceKey**。建连路径只拿得到
   这两样：`runtime.connect()` 在详情页那条链上 `workingDir` 传的是 `undefined`，而详情页
   的 `detailConnectionKey`（route 上带的 `connectionKey`）与 `auth.currentRemoteInstance()`
   的 `instanceKey` 不是同一种字符串。因此**不能**复用详情页那份 UI 持久化的键
   （`buildAgentConfigContextKey(instanceKey, agent, projectPath, conversationId)`）——
   两份存储各管一件事，不可互相替代。

3. **agent 必须匹配才认**。`conversationId` 只在单个远端实例内唯一，而手机可以连多台
   电脑；换 agent 时也整条重置。把 `bypassPermissions` 交给 Codex 只会换来一次被拒绝的
   `set_mode`。

4. **只记显式选择，不记界面上显示的全部**。未动过的取值来自探测快照的 `current_value`
   （远端此刻的默认值）；把它们也钉住，会让一条几天前开的会话在重连后跑在一个早已过期
   的默认模型上。任务那条路规则相反（`taskAgentConfig.effectiveTaskAgentSelection` 存的是
   界面正在显示的整份），因为那是要写进记录、必须自解释的**存档**；这里是一次**会话
   现场**的补偿。

5. **新建会话时选的模式也要种一次**（`CreateConversationSheet`，拿到
   `newConversationId` 之后）。否则「新建时挑了 bypass、从没进过详情页 composer」的会话在
   第一次重连后就退回 Manual。**只种模式不种模型/推理程度**，理由同上一条。

### 仍然存在的上游前提

这只是客户端补偿。真正的持久化在 codeg-plus / 适配器那一侧：`sweep_idle` 照样会回收连接，
只是现在重连能把模式带回去。若用户在 `~/.claude` 配了 `permissions.defaultMode`，那份仍然
是新会话的起点，本机记忆会在建连后把它覆盖成用户在手机上挑的那个。

## 二、任务弹层按 agent 记住上次配好的智能体选项

### 缺口

新建任务时「智能体选项」（授权模式 / 模型 / 推理程度）只有两个来源：

- `work_task_settings` 生效行 —— **每文件夹 / 全局**的共享默认值，一行只存一个 agent 的
  选项（换 agent 时 `mode_id` / `config_values` 会被清空），且要显式保存一次往返。它记不住
  「给 codex 选的是什么、给 claude_code 选的是什么」。
- 探测快照里各选项的 `current_value` —— 远端此刻的默认值，与用户偏好无关。

于是每次下单都要重新点一遍。本次补上中间那一层：**本机、按 agent 分桶的上次选择**，插在
「任务自己的覆盖值」之后、「文件夹生效设置」之前。

### 改法

| 层 | 文件 | 职责 |
|---|---|---|
| 存储 | `src/services/taskAgentOptionMemory.ts`（新增） | `mcode_task_agent_options_v1`，键 `${instanceKey}::${agentType}`，值 `{updatedAt, mode_id, config_values, label_snapshot}`，无 TTL |
| 换算 | `src/pages/tasks/taskAgentConfig.ts` | 新增 `mergeTaskAgentSelection(base, overlay)` —— **逐字段**覆盖 |
| 接线 | `src/pages/tasks/components/TaskEditorSheet.vue` | 读 / 写 / 四道闸 |

优先级链（新建任务）：

```
模板（刚显式挑的）
  → 本机 per-agent 记忆        ← 本次新增
  → work_task_settings 生效行
  → 探测快照的 current_value
```

编辑已有任务时**整条记忆不参与**。

### 六条判定

1. **只在新建时读**。编辑已有任务必须显示服务端那一行的真实值 —— 否则用户改个标题就把
   这个任务的模型换了。

2. **记忆只覆盖选项，不覆盖 agent**。选哪个 agent 仍由生效设置（或用户显式挑选）决定，
   所以不与 `default_agent_type` 打架。这也正是需求的字面意思：「每个 agent 的上次配置的
   智能体选项」。

3. **`agentDirty` 与「draft 是否带覆盖」必须分开**。`agentDirty` 仍然只表示「用户在本弹层
   里动过 agent 或选项」，它同时是 `syncEffectiveAgent()` 的闸门 —— 让记忆也置它，换项目时
   agent 就不再跟随新项目的默认值了。draft 那边改判 `agentOverridden = agentDirty ||
   agentRemembered`：界面显示着 Opus 却存 `agent_type: null`，是「显示一套、跑另一套」。

4. **逐字段叠加，不整份替换**。记录里可能配了记忆不认识的选项（PC 端配的、或这台机器上
   agent 版本还不认的），整份替换会把它们抹掉 —— 与 `effectiveTaskAgentSelection`
   「快照没广告过的取值一律保留」是同一条理由。记忆为 null 时原样返回记录值，**不是**返回
   一份空选择（那会被当成「显式选了空」而盖住生效设置）。

5. **一道显式闸门 `agentMemoryEnabled`，不用 `watch(agentType)`**。`applyTemplate()` 与
   `resetAgentOverride()` 都会改 `agentType` 或撤下叠加层，watch 会在它们之后异步把记忆又
   叠回去 —— 于是「恢复继承」看起来点了没反应、模板里的模型被记忆盖掉。闸门在编辑态、
   套过模板、点过「恢复继承」之后一律关掉，直到用户重新挑一个 agent（那一下会清空旧选择，
   此时正需要一份新默认值）。「恢复继承」**不删**存储里那条记录：那一下是针对本任务的取舍，
   不是「以后都别记了」。

6. **只在用户真的点了选项时写，不在提交时写**。否则一次「什么都没改就创建」会把探测快照的
   远端默认值冻成偏好。编辑态的点选也写 —— 那同样是一次显式配置。

### 两处刻意不动

- **不按项目路径分桶**。模型 / 推理程度 / 授权模式是 agent 级的概念；快照里已经不存在的
  取值由 `createReadyDetailAgentConfigState` 在投影时自然丢掉，所以跨项目套用是安全的。
  （探测缓存仍然按路径分桶，那是另一件事：同一个 agent 在不同目录可能报出不同选项集。）
- **任务设置弹层（`TaskSettingsSheet`）不接这套**。它写的是**共享**的文件夹/全局默认值，
  不该被一台手机的个人偏好带着走；读也不行 —— 那一行必须显示它自己存的东西。

## 三、顺手删掉的死代码（P61 composer 抽离的残留）

排查第一项时发现两处已经没有作用、但会误导下一个读代码的人的残留，一并删掉。**行为零变化**。

### `conversation-detail/index.vue` 里那份 agent 配置副本

P61 把 composer 搬进 `ConversationDetailInteractivePane.vue` 时，外壳留下了一整条平行链：
`detailAgentConfig` ref + `detailConfigProjection` / `modelOption` / `reasoningOption` /
`permissionOption` / `hasModelOptions` / `hasPermissionOptions` / `modelSummary` /
`reasoningSummary` / `permissionSummary` / `activeModelStatusLabel` /
`detailAgentConfigContextKey`。这个 ref **从未被赋值、也从未被模板引用** —— 外壳里没有
`loadDetailAgentConfig`，配置探测整套都在 pane 里。

它不是无害的：`activeModelStatusLabel` 有三个**活的**消费者
（`buildDetailStatusState`、`resolveBottomGeneratingText`、`buildRuntimeStatusLabel`），
只不过因为状态恒为空态，`detailConfigOptionSummary` 恒返回「远端未提供」，
`activeModelStatusLabel` 又把这个值当成「没有模型名」而恒返回空串。也就是说这三处**今天
就已经拿到空串**，删掉之后直接传 `""` 是**行为等价**的 —— pane 里那三处同名计算本来就
写死传 `""`（`ConversationDetailInteractivePane.vue:1852` / `:1891`）。

顺带删掉因此失去引用的四个 import：`buildAgentConfigContextKey` /
`createEmptyDetailAgentConfigState` / `projectDetailConfigOptions` /
`DetailAgentConfigState`，以及未使用的 `AgentOptionsSnapshot` 类型与
`detailComposerPresentation` 的三个导入。

`detailProjectPath` / `detailProjectEntries` / `loadDetailProjectEntries` **保留** ——
导航栏副标题（`index.vue:64`）在用。

### `detailComposerPresentation.pendingComposerConfigActions()`

把配置状态摊成「待补发的 mode / config 动作」的助手，是
`2026-07-03-detail-session-config-no-auto-replay.md` 之前那套「延迟应用 / 重连后重放」设计
的最后一块，生产代码里**只有测试引用它**。留着它的坏处很具体：它正好是本次第一项明令
不能走的那条路，下一个人照着它接线就会重新引入「掀掉另一端现场配置」的问题。

两条相关测试改成断言仍然成立的那部分：`detailAgentConfigSelectionPayload` 不共享引用，
以及 P53 那条「有真实会话模式时摘掉 id 为 `mode` 的镜像配置项」（改为直接断言投影结果与
模式通道，不再经由那个助手）。

### 三处跟着收紧的契约测试

- `conversationDetailBodyContract.spec.ts`：「配置缓存键按会话分桶」那条断言原本锁在
  index.vue 的死代码上（`conversationId.value || null`），现在跟着实现挪到 pane
  （`Number(props.conversationId || 0) || null`），并新增反向断言 —— index.vue 里不该再出现
  `detailAgentConfig` / `buildAgentConfigContextKey`。
- `paneDraftPersistenceWiring.spec.ts`：那段「index.vue 里还有两处往内存缓存 / uni.storage
  写空草稿、随下一步死代码清理一起删」的注释已经过期（那两处早就没了），改成断言页面里连
  `inputText` / `attachments` / `draftQueue` 这些 composer ref 都不存在 —— 少了它们，任何
  新的草稿写入都无从下手。`cacheStore.persistViewState` 保留并显式断言：滚动位置确实归
  外壳所有。
- `detailComposerPresentation.spec.ts`：见上。

**判定：删死代码时要把「谁在消费它」查到底。** 这份副本看起来只是几个没人用的 computed，
实际上有三个活消费者靠「它恒为空」才没出问题；不核对这一点就删，会在状态文案里留下一个
说不清何时出现的模型名（或者反过来，以为传 `""` 是回归）。

## 兼容性

- 两份存储都是新键，没有迁移。读不到就退回原有行为（生效设置 / 远端默认）。
- 存储里的脏值（非对象、非字符串取值、空串、别名 agent id）在读写两侧都归一化；
  `agentType` 两侧都过 `normalizeAgentType`，否则写进去的 `codex_cli` 与下次比对用的
  `codex` 对不上，「记住」会静默失效（`persistSelectedAgentType` 已经踩过这个坑）。
- 不改 ACP 协议、不改服务端命令、不改 `work_task` / `work_task_settings` 的形状。
- `acp_connect` 的两个字段是既有参数（`api/acp.ts:90-104`），只是这条路以前没传。

## 测试

193 suites / 2062 tests 全绿，其中本次新增 **35** 条：

| 文件 | 覆盖 |
|---|---|
| `tests/services/sessionModeMemory.spec.ts`（10 条，新增） | 模式/取值往返；按会话分桶；agent 不匹配当没记过；别名折叠；换 agent 整条重置；空 id 两侧忽略；单条遗忘；**上限裁剪且保住最新那条**；脏存储可恢复 |
| `tests/services/taskAgentOptionMemory.spec.ts`（11 条，新增） | 每 agent 一份；连接隔离；未记过返回 null；别名折叠；空 instanceKey 两侧忽略；**空选择 ≠ 没记过**；空选择删桶；覆盖；**无 TTL**；脏值丢弃；脏存储可恢复 |
| `tests/pages/conversation-detail/sessionModeReconnectWiring.spec.ts`（5 条，新增） | 建连必须交出记忆（含「那两个位置不再是写死的 undefined」反向断言）；键只用建连路径拿得到的东西（含「不含 projectPath」反向断言）；两条选择分支（有连接/无连接）都要记；新建会话弹层种下模式；**反向断言不得改成「重连后补发 set_mode」** |
| `tests/pages/tasks/tasksPageContract.spec.ts`（新增 2 条，改 1 条） | 记忆按 agent 分桶且不按路径；投影与保存都用叠加后那份；`buildDraft` 判 `agentOverridden` 而非 `agentDirty`（含反向断言）；`syncEffectiveAgent` 的闸门仍是 `agentDirty`；记录/模板/恢复继承压住记忆；写入只在两处点选、不在 `submit()`；设置弹层不接这套 |
| `tests/pages/tasks/taskAgentConfig.spec.ts`（新增 6 条） | `mergeTaskAgentSelection`：无记忆原样返回、不共享引用、逐字段覆盖、记忆没模式时保留记录的、补充记录没有的键、两边都空仍是继承 |

删死代码那一节没有新增测试，改的是三个既有契约（见上），总数不变。

组件仍然从不挂载（`testEnvironment: node`，仓库无 `@vue/test-utils`），模板与接线按字符串
断言 —— 与既有 `tasksPageContract.spec.ts` / `paneDraftPersistenceWiring.spec.ts` 同法。

`vue-tsc` / `tsc` 对四个改动文件与上游基线**逐条同数**（`TaskEditorSheet` 只剩 2 条既有的
uview mixin 注入属性；pane 与 `CreateConversationSheet` 各自 55 条，与未改动版本完全一致）。
注意：本次验证在 worktree 里跑，依赖装在主仓库，jest / tsc 是借主仓库的 `node_modules` 跑的。

## 原生 iOS/Android 复刻指引

1. **ACP 会话的授权模式是进程内状态，会随连接回收消失**。原生端必须把「用户为这条会话选过
   的模式」单独存一份，并在**每次建连**时通过 `acp_connect` 的 `preferredModeId` /
   `preferredConfigValues` 交回去。只调一次 `acp_set_mode` 就以为设好了，是错的。
2. **不要在 attach / 重连后主动补发 `acp_set_mode`**。服务端会在建连时去重复用已有会话，
   补发会掀掉另一端的现场配置。把意图交给建连参数，让服务端决定要不要应用。
3. **那份会话记忆的键只能用建连时拿得到的东西**（会话 id + agent），不要塞项目路径或某个
   界面层的连接键 —— 建连路径没有它们，键对不上等于没修。
4. **agent 要匹配才认，换 agent 整条重置**：会话 id 只在单个远端实例内唯一，跨 agent 的模式
   id 一律无意义。
5. **会话现场只记用户显式点过的取值**；未动过的那些是远端默认值，钉住它们会让老会话跑在
   过期的默认模型上。
6. **任务那条路相反**：存的是界面上正在显示的整份具体值（含未动过的），因为它要写进记录、
   必须自解释。两条路的规则不同是有意的，不要统一。
7. **任务的 per-agent 偏好按 (连接, agent) 分桶，不按项目路径**；它只覆盖选项，不覆盖 agent。
8. **「用户动过没有」与「这份 draft 要不要带覆盖」是两个位**。前者是「是否跟随文件夹生效
   设置」的闸门，后者决定落库写不写 `agent_type`。合成一个位，必然在「换项目时 agent 不再
   跟随默认值」和「界面显示一套、落库另一套」之间二选一。
9. **自动回填要有一道显式闸门**，并在「套模板」「恢复继承」「编辑已有记录」三种情况下关掉；
   靠监听 agent 变化来触发回填，会在这三个显式动作之后把偏好又叠回去。
10. **偏好一律只在用户真的点选时写入**，不要在提交时顺手把当前显示值写成偏好 —— 那会把远端
    默认值冻成用户偏好。
11. **agent 标识两侧都要归一化**（别名 → canonical id），否则「记住上次」会静默失效。
12. **编辑已有记录时，服务端那一行必须胜出**，本机偏好不参与投影。
13. **抽离组件后不要留下平行的状态副本**。外壳那份 agent 配置从未被赋值，却有三个活消费者
    靠「它恒为空」才没出问题 —— 原生端做同样的拆分时，要么把状态彻底交给持有输入框的那一层
    并让上层显式传常量，要么让上层通过事件拿到真实值，不要留一个永远是空态的 ref。
