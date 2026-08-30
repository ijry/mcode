# Composer Action Panel Above Input

## 背景

详情页输入框的设置与快捷消息原先复用 `composerPanelMode`，但面板节点放在输入工具行之后，视觉上出现在输入框下方。`+` 按钮展开的工具也原本是输入框下方横向工具行，不利于承载更多操作。设置内容也是纵向 row 展开，用户要先点「设置」再点某一行，选项才在下方铺开。

本次把 `+` 菜单、快捷消息和设置入口都改成输入框上方的操作面板，并把设置面板改为类似桌面端的左右结构：左侧是配置分类与当前摘要，右侧是当前分类的可选项。截图只作为样式参考，不新增当前移动端还没有实际行为支撑的功能入口。随后补上 PC 同款「实时反馈」入口，不新增移动端协议：服务端能力允许时优先走 native steering，不支持时回退到已有的 `check_user_feedback` pull 通道。

## 架构与数据流

- 状态仍复用 `composerPanelMode: "" | "quick_reply" | "feedback" | "config"`。
- `toolRowExpanded` 不再渲染输入框下方横向工具行，而是驱动 `showInputToolMenu`，在没有打开 `composerPanelMode` 时显示 `+` 操作菜单。
- `quick_reply` 继续使用 `quickReplyItems`，点击后仍走 `sendQuickReply()`。
- 全局 `feedback.enabled` 默认关闭；只有远端设置返回开启时才显示入口。详情页随后读取当前连接快照，把 `native_steering_available` 与 `feedback_tool_available` 水合到反馈旁路状态。native 优先，native 不可用且 pull 工具已在启动时注入时回退到 pull；两者都不可用则禁用入口。
- 反馈快照调用 `hydrateFeedbackSnapshot()`，只更新能力位、便签和消费墓碑，不更新 `status`/`liveMessage`/`historyWindow`/`localTurns`，也不调用 `maybeBackfillMissingHistory()`；反馈不进入 SQLite 或历史窗口。
- `feedback_consumed` 先于快照到达时，消费 id 会保存在当前连接的墓碑表；后续快照中没有实时版本的 `pending` 便签必须用该墓碑结算为 `delivered`，避免已被 agent 读取的意见重新显示为待读取。实时同 id 便签仍优先保留。
- 「实时反馈」面板使用独立文本框，校验非空、无附件、当前会话运行中后调用 `acpSubmitSessionFeedback(connectionId, text)`。服务端根据连接能力选择通道，native 返回的便签出生即 `delivered`，pull 返回的便签初始为 `pending`，收到 `feedback_consumed` 后才变为 `delivered`。
- Claude 会话由 `normalizedAgentType === "claude_code"` 判定，菜单项进入禁用态，不调用 native steering。Claude 自身已有更实时的当前会话插入能力，移动端不要让这条通用反馈入口可用。
- `config` 通过 `composerConfigNavItems` 投影出左侧分类：`Mode`、`Model`、`Reasoning`。
- 右侧内容由 `activeComposerConfigKey` 决定：
  - `permission` 优先展示 `detailAgentConfig.modes.available_modes`，没有 modes 时退回 permission config option。
  - `model` 展示 model config option 的 `kind.options`。
  - `reasoning` 展示 reasoning config option 的 `kind.options`。
- 选择行为不变：mode 仍调用 `selectDetailMode()`；普通配置仍调用 `selectDetailConfigValue()`，并继续持久化到 agent config selection。

## UI 行为

- 操作面板节点放在 `input-main-row` 之前，因此在底部 composer 栈内显示于输入框上方。
- 点击 `+` 按钮后，输入框上方左侧弹出 `input-tool-menu`。菜单第一项是「快捷继续」，点击后发送固定快捷消息 `继续`；其后用 `up-divider` 分隔其他工具。
- `+` 菜单保留已有行为：附加文件、快捷消息、设置、停止当前会话；新增「实时反馈」入口，位于快捷消息和设置之间。斜杠命令等截图中有但当前未落地为明确移动端入口的功能不出现在菜单中。
- 非 Claude 会话点击「实时反馈」时提交面板文本，不再二次弹出「插入当前回合」action sheet；Claude 入口保持禁用，因为 Claude 已有更实时的「插入当前回合」能力。异常条件用 toast 解释，包括空文本、带附件、无运行中回合、后端未声明任一反馈通道。
- 反馈提交遇到 `NoActiveTurn` 时不自动替用户发送：主输入没有文本或附件则把草稿移回主输入并关闭面板；主输入已有内容则保留反馈面板草稿，避免覆盖用户内容。
- 点击菜单里的快捷消息或设置按钮打开同一个 `composer-panel` 容器；再次点击当前按钮关闭。
- 设置面板左侧分类点击只切换当前分类，不再折叠行。
- 右侧选项以列表呈现，当前选中项显示勾号；有 description 时在标题下方显示说明。
- 面板使用 `--up-*` 主题变量，透背景主题继续走既有 `composer-panel--translucent`。

## 兼容性

不改已持久化的配置格式和快捷消息发送流程；反馈复用既有 `submit_session_feedback` 协议，服务端负责 native/pull 选择。旧的 `expandedConfigKey` 状态名保留，但语义变为当前激活配置分类，避免扩大变更面。父页量测底部 composer 高度时应查找 `.detail-shell__page--active .input-tool-menu`，不要再依赖已移除的 `.input-tool-row`。反馈便签是轮次级瞬态：不进时间线、不进 SQLite；下一轮 `user_message` 清空，断开/换连接也清空。native 能力一旦被提交结果明确降级，`nativeSteeringDowngraded` 会阻止迟到旧快照恢复 native。

## 原生 iOS/Android 复刻指引

原生端应把 composer 附属操作面板挂在输入框上方，而不是工具栏下方：

1. 输入区垂直顺序：附件/临时状态、`+` 操作菜单或 composer action panel、输入行。
2. 快捷消息面板使用同一个 action panel 容器，内部为可换行 chips。
3. 设置面板使用双栏布局：左栏固定宽度展示 `Mode`/`Model`/`Reasoning` 与摘要，右栏滚动展示选项。
4. 点击左栏分类只更新当前分类；点击右栏选项才调用后端配置接口并更新本地选择。
5. `+` 菜单左对齐悬浮在输入框上方，首项「快捷继续」后用分隔线隔开附加文件、快捷消息、实时反馈、设置、停止当前会话。
6. 原生端应按 agent type 禁用 Claude 的「实时反馈」入口；其他 agent 先读当前连接快照，native 优先、pull fallback，并保持反馈文本 only。
7. 反馈状态只保存在当前回合内；反馈专用快照水合不能触发历史范围确认、历史回填或 SQLite 写入。
8. 合并反馈快照时保留当前连接的 `feedback_consumed` id 墓碑；快照独有条目先结算墓碑再渲染，实时同 id 条目优先。
9. 不要新增移动端专用配置协议；继续消费 agent options snapshot 中的 modes 与 config options。
