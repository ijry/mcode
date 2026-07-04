# P63 会话详情页炫酷模式

## Architecture

`mcode-app` 的会话详情页新增一个仅作用于表现层的实验性炫酷模式，使用全局 storage key `mcode_detail_cyber_mode_v1` 持久化开关，不修改 ACP、SQLite、路由或 runtime store 数据结构。

页面壳层 `mcode-app/src/pages/conversation-detail/index.vue` 负责：

- 从更多菜单切换 `炫酷模式 / 关闭炫酷模式`
- 恢复和持久化全局开关
- 基于 runtime 状态与 `liveMessage` 推导 `idle | ramp | streaming | settle` 四阶段
- 在炫酷模式下隐藏自定义背景图，但不清除原有背景配置

纯逻辑放在 `detailCyberMode.ts`，整页绿色数字雨由 `ConversationDetailCyberRain.vue` 渲染。实时消息解码效果放在 `MessageBubble.vue`，并且只对当前活动 pane 中、状态为 `streaming` 的 assistant 文本消息开启。

## Protocol And Data Flow

该功能不引入新的服务端协议，也不改动现有 websocket / polling / ACP 事件。

炫酷模式只读取以下现有状态：

- 本地 storage 中的全局开关
- 会话 runtime status
- 当前会话是否存在 `liveMessage`
- 当前 assistant 消息的文本内容与 `streaming` 状态

`index.vue` 根据这些输入推导页面阶段，并把 `cyberModeEnabled`、`cyberEffectPhase` 逐层传给 `ConversationDetailInteractivePane`、`ConversationDetailReadonlyTimeline` 与 `MessageBubble`。`MessageBubble` 本地使用定时器驱动 0/1 解码覆盖层，不向上写回任何业务状态。

## UI Behavior

- 入口位于会话详情页右上角更多菜单。
- 开启后，整页切换为偏黑绿的终端风格，并叠加低强度数字雨氛围。
- `idle` 阶段保持弱化待机效果。
- `thinking`、`running_tool`、`waiting_permission`、`waiting_question` 等阶段进入 `ramp`，页面高亮和扫描感增强。
- 有实时 `liveMessage` 时进入 `streaming`，活动 pane 内最新 assistant 流式文本会先显示绿色 0/1 解码覆盖层，再逐步收敛成真实消息。
- 流式结束后的短暂窗口进入 `settle`，随后回落到普通待机氛围。
- 只读时间线和非活动 tab 只保留整页氛围，不运行强解码动画，避免多实例同时高频重绘。

## Compatibility

- 功能完全可选，关闭时页面行为与现有实现一致。
- 背景图配置仍保留；炫酷模式只是视觉上覆盖背景图。
- `MessageBubble` 的炫酷 props 全部是可选字段，其他调用点不需要同步改协议。
- 复杂 markdown（代码块、标题、列表、表格）会降级为原始文本渲染，避免解码覆盖层破坏可读性。

## Native iOS And Android Guidance

- 原生端复刻时保留相同的全局布尔开关和四阶段状态机：`idle`、`ramp`、`streaming`、`settle`。
- 炫酷模式应放在会话详情页控制器/页面层实现，不要侵入消息模型、协议模型或本地数据库。
- 绿色数字雨建议作为整页 atmosphere 层实现；实时解码动画只绑定当前活动会话 pane 的 assistant 流式文本。
- 开启炫酷模式时隐藏详情页背景图展示，但不要删除用户已存的背景图配置。
- 低性能设备可以降低数字雨列数、减慢 tick 频率或关闭文字抖动动画，但应保持页面整体黑绿终端风与实时消息解码的核心体验。
