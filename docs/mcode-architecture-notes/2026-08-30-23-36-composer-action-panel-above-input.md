# Composer Action Panel Above Input

## 背景

详情页输入框的设置与快捷消息原先复用 `composerPanelMode`，但面板节点放在输入工具行之后，视觉上出现在输入框下方。`+` 按钮展开的工具也原本是输入框下方横向工具行，不利于承载更多操作。设置内容也是纵向 row 展开，用户要先点「设置」再点某一行，选项才在下方铺开。

本次把 `+` 菜单、快捷消息和设置入口都改成输入框上方的操作面板，并把设置面板改为类似桌面端的左右结构：左侧是配置分类与当前摘要，右侧是当前分类的可选项。截图只作为样式参考，不新增当前移动端还没有实际行为支撑的功能入口。

## 架构与数据流

- 状态仍复用 `composerPanelMode: "" | "quick_reply" | "config"`。
- `toolRowExpanded` 不再渲染输入框下方横向工具行，而是驱动 `showInputToolMenu`，在没有打开 `composerPanelMode` 时显示 `+` 操作菜单。
- `quick_reply` 继续使用 `quickReplyItems`，点击后仍走 `sendQuickReply()`。
- `config` 通过 `composerConfigNavItems` 投影出左侧分类：`Mode`、`Model`、`Reasoning`。
- 右侧内容由 `activeComposerConfigKey` 决定：
  - `permission` 优先展示 `detailAgentConfig.modes.available_modes`，没有 modes 时退回 permission config option。
  - `model` 展示 model config option 的 `kind.options`。
  - `reasoning` 展示 reasoning config option 的 `kind.options`。
- 选择行为不变：mode 仍调用 `selectDetailMode()`；普通配置仍调用 `selectDetailConfigValue()`，并继续持久化到 agent config selection。

## UI 行为

- 操作面板节点放在 `input-main-row` 之前，因此在底部 composer 栈内显示于输入框上方。
- 点击 `+` 按钮后，输入框上方左侧弹出 `input-tool-menu`。菜单第一项是「快捷继续」，点击后发送固定快捷消息 `继续`；其后用 `up-divider` 分隔其他工具。
- `+` 菜单只保留已有行为：附加文件、快捷消息、设置、停止当前会话。实时反馈、斜杠命令等截图中有但当前未落地为明确移动端入口的功能不出现在菜单中。
- 点击菜单里的快捷消息或设置按钮打开同一个 `composer-panel` 容器；再次点击当前按钮关闭。
- 设置面板左侧分类点击只切换当前分类，不再折叠行。
- 右侧选项以列表呈现，当前选中项显示勾号；有 description 时在标题下方显示说明。
- 面板使用 `--up-*` 主题变量，透背景主题继续走既有 `composer-panel--translucent`。

## 兼容性

不改协议，不改已持久化的配置格式，不改快捷消息发送流程。旧的 `expandedConfigKey` 状态名保留，但语义变为当前激活配置分类，避免扩大变更面。父页量测底部 composer 高度时应查找 `.detail-shell__page--active .input-tool-menu`，不要再依赖已移除的 `.input-tool-row`。

## 原生 iOS/Android 复刻指引

原生端应把 composer 附属操作面板挂在输入框上方，而不是工具栏下方：

1. 输入区垂直顺序：附件/临时状态、`+` 操作菜单或 composer action panel、输入行。
2. 快捷消息面板使用同一个 action panel 容器，内部为可换行 chips。
3. 设置面板使用双栏布局：左栏固定宽度展示 `Mode`/`Model`/`Reasoning` 与摘要，右栏滚动展示选项。
4. 点击左栏分类只更新当前分类；点击右栏选项才调用后端配置接口并更新本地选择。
5. `+` 菜单左对齐悬浮在输入框上方，首项「快捷继续」后用分隔线隔开附加文件、快捷消息、设置、停止当前会话。
6. 不要新增移动端专用配置协议；继续消费 agent options snapshot 中的 modes 与 config options。
