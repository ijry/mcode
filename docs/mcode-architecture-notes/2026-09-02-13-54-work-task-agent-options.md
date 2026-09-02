# 任务的智能体选项（授权模式 / 模型 / 推理程度）

## 背景

上一次把 tabbar 第三格换成任务页（`2026-09-02-03-26-tabbar-todos-to-work-tasks.md`）时，`WorkTaskConfig.mode_id` / `config_values` 与 `WorkTaskFolderSettings` 上的同名字段虽然在类型层与归一化里都到位了，但**界面上没有入口**：编辑弹层的 `buildDraft()` 恒写 `mode_id: null` + `config_values: {}`，设置弹层则原样把这两个字段读进来又写回去。结果手机端只能选 agent，不能选它的授权模式、模型和推理程度 —— 而这三样恰好是每次下单最常改的东西（PC 端在 composer 底栏一直有）。

本次补上这个入口，两处都补：**任务级覆盖**（编辑弹层）与**文件夹默认值**（设置弹层）。

需求编号：无（由用户直述「现在无法设置任务的智能体各种选项比如权限、比如模型、推理程度」）。

## 架构与数据流

### 分层（新增部分）

| 层 | 文件 | 职责 |
|---|---|---|
| 纯模块 | `src/pages/tasks/taskAgentConfig.ts` | 存储形状 ↔ 界面状态的换算：读取、投影、**定值**（effective）、`label_snapshot`、摘要文案、可选项过滤 |
| 组件 | `src/pages/tasks/components/TaskAgentConfigSheet.vue` | 选项弹层（chip 网格），纯受控 |
| 复用 | `src/services/conversation/composerTools.ts` | 快照归一化与探测缓存，**未改动** |

界面状态直接复用 composerTools 的 `DetailAgentConfigState` —— 与新建会话弹层、会话详情 composer 是同一个形状，因此 `acp_describe_agent_options` 快照的归一化只有一份实现。这点很重要：那份实现里含**摘掉 id 为 `mode` 的镜像配置项**这条规则（见 `2026-07-03-p53-detail-mode-config-replay.md`），任务这条路自己 map 一遍快照就会把它漏掉。

对应的 PC 端实现是 `codeg-plus/src/components/automations/agent-config-section.tsx`（`effectiveSelections` / `snapshotLabels`）+ `use-agent-options.ts`。

### 探测

```
(agent, 项目路径) 变化
  → buildAgentConfigContextKey(instanceKey, agentType, projectPath, "work_task")
  → readFreshAgentConfigCache(...)                    5 分钟 TTL，命中即返回
  → gateway.call("acp_describe_agent_options", {agentType, workingDir})
  → persistAgentConfigCache(...)
  → taskAgentConfigStateFromSnapshot(snapshot, storedSelection)
```

三个要点：

1. **`scope` 固定传 `"work_task"`**。缓存键与会话 composer 的分开（那边 scope 是 conversationId），但同一台连接上多个任务探测同一个 agent 时共用快照。
2. **带 `workingDir`**。同一个 agent 在不同目录下可能报出不同选项集（项目级配置）。列表页的 `filterProjectOptions` 只带名字，所以设置弹层的 `folderPath` 要从 `activeBucket.projects`（`loadRemoteProjects` 的结果）里取 —— 少传不会报错，只会让探到的是无目录上下文那份。
3. **`acp_describe_agent_options` 的 70s 超时是既有契约**（后端探测预算 60s，两个网关都注册了覆盖值），不需要新增。

### 存储

两处落点字段完全相同，因此一个模块吃两种记录：

| 落点 | 命令 | 语义 |
|---|---|---|
| `work_task.config` | `work_task_create` / `work_task_update` | 本任务的覆盖值；`mode_id: null` + `config_values: {}` = 继承 |
| `work_task_settings.config` | `work_task_settings_set` | 该文件夹（或全局行）新任务的默认值 |

引擎侧的解析顺序没有变，仍是 `work_task/engine.rs::effective_agent_config`：**任务覆盖整份胜出** → 文件夹任务设置 → 文件夹默认 agent。注意它是**整份**取的（`cfg.agent_type` 有值就连着 `cfg.mode_id` / `cfg.config_values` 一起用），这直接决定了下面那条 UI 规则。

## 三条判定（错了不会报错，只会让任务悄悄跑在另一套配置上）

### 1. 保存的是「界面上正在显示的那份」，不是「用户动过的那几个」

`effectiveTaskAgentSelection` 把每个选项的 `selectedValues[id] || kind.current_value` 都写下来。因为界面上没有「继承」这个选项 —— 每个 chip 组显示的都是一个具体值（用户没动过时显示的是该选项的当前值），所以存下来的也必须是那个具体值。

存空值等于「跟随远端默认」，而**远端默认将来会变**：用户看到 Sonnet 并接受了，半年后 agent 换了版本，同一个任务却跑在别的模型上。这与 PC 端 `effectiveSelections` 是同一条规则，注释也在同一个位置（紧挨着渲染规则），这样显示规则与保存规则不会各自漂移。

两处偏离/例外：

- **探测没落地就原样返回存储值**（`status !== "ready"`）。此时界面一个具体值都没显示过，凭一次读取失败去改写记录里的配置是最坏的结果 —— 用户只想改个标题，模型选择却被清空。
- **快照里没有的取值一律保留**。可能是 PC 端配的、这台机器上 agent 版本还不认的选项；一次探测读不到它不代表它该被删掉。

PC 端的 `effectiveSelections` 还多一道 `!hasOptions` 的闸（它在有配置项时**不画**独立的模式行）。mcode-app 两个渠道是同时画的 —— `removeSessionModeConfigMirror` 已经把重复的那个 `mode` 配置项摘掉了 —— 所以这里不需要那道闸：既然画出来了，就得能存下来。

### 2. agent 与它的选项是**一组三件套**，共享同一个 dirty 位

`mode_id` / `config_values` 的取值只在某个 agent 下有意义（`opus` 对 Codex 毫无意义）。于是：

- **改选项也置 `agentDirty`**。否则 `buildDraft()` 会走 `agent_type: null` 那条分支，把整份覆盖丢掉 —— 用户明明选了模型，保存后什么也没发生。
- **换 agent 就清空另外两样**。留着会在新 agent 上变成一份必被拒绝、或更糟（静默忽略）的配置。设置弹层里同样清（那里没有 dirty 位，直接改 draft 三个字段）。
- **「恢复继承」三样一起收回**，否则选项行还显示着上一个 agent 的模型。

这也是引擎「整份取」的必然结果：单独覆盖选项而让 agent 继续继承，在文件夹换了默认 agent 之后就是一份跨 agent 的垃圾配置。

### 3. `label_snapshot` 存的是人话

保存时顺手记下 `{agent_label, mode_label, config_labels}`。详情页头部因此能显示「Claude Code · Opus 5」而不是 `claude_code`，并且在 agent 后来被卸载、或选项集换了版本之后**依然说得出人话**。探测失败时它还是摘要行唯一的信息来源 —— 显示原始 id 会让用户以为配置坏了，什么都不显示会让他以为从没配过、进而重配一遍（覆盖掉原本正确的那份）。

与 PC 端 `snapshotLabels` 同形，两端读的是同一份 JSON。取值名**先查分组再查平铺列表**：服务端 `map_session_config_option` 在分组形态下会把分组摊平一份放进 `options`，两处都有，但分组那份才是权威。

## UI 行为

### 编辑弹层（`TaskEditorSheet`）

Agent 行下面多一行「智能体选项」，形态与新建会话弹层的「智能体配置」一致：一行摘要（`常规 · Sonnet 5 · 中`）+ 右箭头，点开二级弹层。

- 探测中显示行内 loading，此时点不开（避免开出一个空弹层）。
- 探测失败：摘要退回上次保存的名字，helper 说明「保存后将沿用原有选项」，弹层内给**重试**按钮 —— 探测要现拉一个 agent，失败只能关掉重开等于重来一遍。
- 该 agent 什么都不暴露时摘要显示「该智能体将使用远端默认配置」，箭头不画（点开是一个空弹层）。
- 模板套用时三件套一起套（模板存的就是一份 `WorkTaskConfig`）。

### 设置弹层（`TaskSettingsSheet`）

「默认 Agent」下面同一行「智能体选项」，helper 写明「新任务默认使用这些选项，每个任务仍可单独覆盖」。

- **「跟随全局」时整行不画、也不探测**：那份配置属于全局那一行，在这里改动会在保存（走 `work_task_settings_delete`）时全部丢弃，而探测本身要在远端现拉一个 CLI 进程。
- **默认 Agent 选「跟随文件夹默认」时不探测**：真正要跑的 agent 由每个项目自己的默认值决定，探不出一份有意义的选项集。此时保存也把选项留空（`agentType` 为空 → 整份 `INHERITED`）—— 选项无从解释。

### 选项弹层（`TaskAgentConfigSheet`）

两个弹层共用，纯受控（状态由父层持有，只 emit 选择）—— 父层还要拿这份状态算保存载荷，状态若归组件，一个值会被两处写。

- chip 网格而不是 picker：一屏看完全部可选项，picker 一次只露一列还要多点一次确认。
- chip 样式取 `pages/tasks/index.scss` 已有的 `.task-chip` / `.task-chip--active`，**不从会话页搬 `.config-chip`**。
- **是兄弟节点而不是嵌在各自的 popup 里**：uview-plus 的 popup 各自 fixed 定位，嵌套时内层会被外层的 transform 上下文困住（新建会话弹层的二级配置弹层同样是平铺的）。
- **只渲染有取值列表的选项**。ACP 还有 boolean 这种 kind（Cline 的 `auto_approve`），而 `types/acp.ts` 只声明了 select；没有取值列表的选项在 chip 界面里会渲染成一个空的分组标题 —— 一行看不懂也点不动的字。漏掉一个开关只是少一个功能，画一个空组是个 bug。

### 详情页头部

`task.agent_type` 那处原始 id 换成 `agentMetaText`：`label_snapshot.agent_label`（带 `config_labels.model` 时拼成「A · B」）→ `AGENT_LABELS` 映射 → 原始 id。与 PC 端 `task-detail-sheet.tsx` 的 `agentLabel` 同一套优先级。

## 顺手修掉的一处分叉

两个任务弹层各自抄了一份 agent 标签表，把 codex 写成「Codex CLI」而全局那份（`remoteSettings.AGENT_LABELS`）是「Codex」，同一个 agent 在任务弹层和别处显示成两个名字。现在都取 `AGENT_DISPLAY_ORDER` + `AGENT_LABELS`，顺带补上了副本里漏掉的 `hermes`。`CreateConversationSheet` 已经踩过并记录了同一个坑。

## 兼容性

- **老记录没有 `label_snapshot`**：摘要退回原始 id，详情页退回 `AGENT_LABELS` 映射。不做迁移 —— 下一次保存自然带上。
- **老记录的 `mode_id` / `config_values` 原样读出并投影**；快照里已经不存在的取值退回该选项的当前值，但**存储侧不动**（保留在 `effectiveTaskAgentSelection` 的兜底里），所以在这台机器上打开一个 PC 端配过的任务再保存，不会把它认不出的选项抹掉。
- **`config_values` 的键是 agent 自报的 id**，不做白名单 —— 服务端新增选项时旧客户端要能原样透传。
- 缓存与新建会话弹层共用同一个 storage key（`mcode_create_agent_config_cache_v1`），靠 contextKey 的 `scope` 段区分，无需迁移。
- **不碰 `acp_connect` / `acp_set_config_option`**：任务不在客户端起会话，选项只是写进记录，由引擎在 `spawn_agent` 时作为 `preferred_mode_id` / `preferred_config_values` 应用。

## 两处并发守卫

选项探测有三条触发路径（打开弹层、切 agent、切项目/作用域），都可能同时在飞：

- **过期响应丢弃**（单调递增 `agentProbeToken`）。切 agent 之后回来的旧探测会把另一个 agent 的选项集写进状态 —— 用户于是对着一份不属于当前 agent 的模型列表做选择，保存下去就是一份必被拒绝的配置。关闭弹层时也推进一格。
- **watch 依赖只用字符串，不含 `props.gateway`**。它是个对象，而列表每次后台刷新都会重建连接桶（于是换一个新实例）；依赖它会让一次刷新重新投影状态，把用户刚在弹层里选好的取值冲掉。

另有一处顺序问题：**存储那份选择常常晚于探测落地**（探测走缓存能立刻返回，而生效设置/设置行要一次往返）。两个弹层都有 `reprojectStoredSelection()`，在那份选择到达后重新投影一次；缺了它，界面显示的是探测时那份（可能是上一次打开留下的）选择，而不是服务端这一行的真实值。

## 测试

158 suites / 1365 tests 全绿，其中本次新增 **36** 条：

| 文件 | 覆盖 |
|---|---|
| `tests/pages/tasks/taskAgentConfig.spec.ts`（21 条，新增） | 读取归一化（空串不是合法 id、非字符串丢弃）；投影（消失的取值退回当前值）；镜像 `mode` 被摘掉；**定值三条**（未动过的选项也写下来 / 探测未落地时原样返回 / 快照没广告过的取值保留）；无会话模式时不塞 `mode_id`；`label_snapshot`（含分组形态查名字）；摘要四档（loading / ready / 失败退回名字 / 失败退回 id） |
| `tests/pages/tasks/tasksPageContract.spec.ts`（新增 15 条） | 探测命令与 70s 超时；快照必须经共享投影（含「不自己拆 `snapshot.config_options`」的反向断言）；保存写 effective 而非 `selectedValues`；三件套同一个 dirty 位（含换 agent 清空、恢复继承）；继承与模板带上三件套；存储选择晚到时重新投影；watch 依赖不含 gateway 对象；过期探测响应丢弃；跟随全局时不探测；失败可重试；只渲染有取值的选项；共享弹层是兄弟节点；标签只有一份映射（含「不出现 Codex CLI」的反向断言）；详情页显示 label 而非原始 id；设置弹层拿到项目路径 |

组件仍然从不挂载（`testEnvironment: node`，仓库无 `@vue/test-utils`），模板与接线按字符串断言 —— 与既有 `tasksPageContract.spec.ts` 同法。

`vue-tsc` 单独跑过这四个文件，除仓库既有的 uview mixin（`upThemeVar` 等注入属性）与未安装的可选依赖外无新增类型错误。

## 原生 iOS/Android 复刻指引

1. **一份换算，两个落点**：`work_task.config` 与 `work_task_settings.config` 的 `mode_id` / `config_values` 字段名相同，读写换算必须是同一段无副作用代码 —— 两份实现会在「什么算选中」上分叉。
2. **快照归一化必须共用会话那条路**，尤其是「有真实 `modes` 时摘掉 id 为 `mode` 的配置项」这条。自己 map 一遍快照会把那个镜像项画出来，replay 它会被拒绝。
3. **保存界面正在显示的具体值**，包括用户没动过的选项（取该选项的 `current_value`）。存空等于跟随远端默认，而远端默认会变。
4. **探测未落地时不要改写已存的选择** —— 原样写回。
5. **快照没有的取值要保留**，那可能是别的客户端配的。
6. **agent + mode + config 是一个覆盖单元**：改任一项都算覆盖，换 agent 清空另外两项，取消覆盖时三项一起收回。引擎是整份取的。
7. **同时存 `label_snapshot`**（agent / mode / 各配置项的显示名）。它是 agent 被卸载或探测失败后唯一还能显示人话的东西。
8. **探测带 `workingDir`**，缓存键含 (instanceKey, agent, 路径, 作用域)，TTL 5 分钟，并用单调序号丢弃过期响应。探测的触发条件只看**标量**（agent 名、路径字符串），不要看传输对象 —— 它会随连接刷新换实例，从而把用户正在做的选择冲掉。
9. **存储那份选择可能晚于探测到达**（探测命中缓存是同步的）；它到达后要重新投影一次，否则界面显示的是上一次打开留下的选择。
10. **失败要能重试**：探测会在远端现拉一个 CLI 进程，一次抖动不该让用户只能关掉重来。
11. **只渲染有取值列表的选项**；ACP 的 boolean kind 在只支持 select 的界面里会渲染成一个空分组。
12. 「跟随全局」/「跟随文件夹默认」两种继承态下**不探测**：那时的选项没有落点。
