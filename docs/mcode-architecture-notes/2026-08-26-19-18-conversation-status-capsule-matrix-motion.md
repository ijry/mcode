# Conversation Status Capsule Matrix Motion

## Scope

详情页输入区上方的状态胶囊在 Matrix 主题下增加状态感知的扫描、圆点脉冲和文字闪烁动效；普通主题保持原有布局与颜色语义。

## Architecture And Data Flow

运行时状态仍由会话 runtime 提供，`ConversationDetailInteractivePane` 将现有的 `runtimeStatus` 与 `runtimeStatusClass` 传给 `ConversationDetailBody`，并把状态类挂在状态行上。`ConversationDetailBody` 仅根据这些展示属性组合胶囊 CSS 类，不改变 ACP 事件、会话状态机、持久化消息或请求协议。

## UI Behavior

- Matrix 的 `thinking` 使用较慢的绿色扫描与轻微文字闪烁，`running_tool` 使用更快的扫描和圆点脉冲。
- 等待授权/选择使用低强度琥珀色反馈；错误状态使用红色静态警示，不播放绿色扫描。
- 空闲/已连接状态保留低亮静态边框，避免持续强动效。
- `prefers-reduced-motion: reduce` 下停止胶囊边框、扫描、圆点和文字动画。

## Compatibility

这是展示层变化，不改变运行状态值、消息结构或跨端协议。样式继续使用现有 `--up-*` 主题变量与 Matrix 主题选择器；状态类缺省回退到 `idle`，旧调用方不传新增属性时仍可正常渲染。

## Native iOS/Android Replication Guidance

- 将会话状态映射为 `idle`、`online`、`running`、`pending`、`error`，同时保留 `thinking` 与 `running_tool` 的原始状态用于节奏选择。
- Matrix 主题下对胶囊内容叠加横向扫描渐变；对状态点使用不同周期的缩放/透明度脉冲，对状态文字使用低幅度随机闪烁。
- 错误使用红色静态环与点，等待状态使用低亮琥珀色，不要让错误继续播放绿色扫描。
- 尊重系统减少动态效果设置，关闭上述动画但保留静态颜色和状态文本。
