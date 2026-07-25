# Settings Experimental Feature Notice

## Architecture

`mcode-app/src/pages/settings/index.vue` 在“会话设置”标题下、实时消息流开关和 TAB 多任务选择器之前展示一条常驻提示。提示明确指出实时信息流和“同步 PC 端”TAB 为实验性功能，仅供体验，不建议正式使用；“关闭”和“移动端自管”不属于此提示的范围。

## Protocol And Data Flow

本变更只增加静态界面内容，不读取或写入新状态。`mcode_conversation_list_live_stream_enabled`、`mcode_detail_tab_multitask_mode`、实时订阅、`list_opened_tabs`、`save_opened_tabs` 和 ACP 事件流均保持不变。

## UI Behavior

提示始终显示，不随实时消息流开关或 TAB 模式选择而隐藏，也不要求确认或阻断用户继续操作。它使用 uview-plus 已有的 `--up-warning`、`--up-card-bg-color`、`--up-border-color`、`--up-main-color` 和 `--up-content-color` 变量，以便浅色和深色主题保持对比度。

## Compatibility

不涉及服务端路由、ACP 协议、SQLite 结构或偏好值迁移。已保存的实时流与 TAB 配置继续按原有规则生效。

## Native iOS/Android Replication

原生客户端应在会话设置中、实时信息流和 TAB 多任务配置之前展示相同含义的常驻提示。提示仅用于风险告知，不应改变设置值、增加确认流程，或改变实时订阅与 PC TAB 同步协议。
