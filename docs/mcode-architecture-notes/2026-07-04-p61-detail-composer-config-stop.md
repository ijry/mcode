# P61 详情页 composer 配置与停止按钮

## Architecture

`conversation-detail/index.vue` 现在实际渲染每个会话页的 `ConversationDetailInteractivePane.vue`，旧的父级 `ConversationDetailBody` 分支已被禁用。因此底部 composer 的运行时控制必须落在 interactive pane 内，不能只保留在父页的旧模板里。

P61 恢复 interactive pane 工具行里的配置按钮，并继续保留停止按钮。配置按钮打开同一个 composer 内联面板，复用现有 `composerTools` 与 `detailComposerPresentation` 投影/摘要/持久化逻辑。

## Protocol And Data Flow

配置面板按 `instanceKey + agentType + projectPath + conversationId` 构造 cache key。pane 内先通过当前 `folderId` 调用远端 `list_open_folder_details` 得到项目路径，再调用 `acp_describe_agent_options` 读取模型、推理强度和授权选项。结果写入现有短期 agent config cache，用户选择写入现有 selection cache。

用户切换 session mode 时调用 `acp_set_mode`；切换普通配置项时调用 `acp_set_config_option`。如果当前会话还没有 connectionId，只更新本地选择并持久化，后续连接/发送路径仍可读取选择。

## UI Behavior

工具行显示图片、文件、快捷回复、设置和停止五个独立图标按钮。设置按钮不再被停止按钮替代；停止按钮保持 danger 样式，只负责取消当前 active turn。配置面板仍在 composer 卡片内部展开，切换或关闭工具行时会收起已展开的配置行并重新同步消息列表底部 padding。

新建会话配置弹层把远端 `modes.available_modes` 固定渲染为“授权类型”，即使同时存在模型、推理强度等 `config_options` 也不隐藏。详情页底部设置面板的模型、推理强度、授权类型分组保持垂直间距；工具行图标按钮使用固定宽度和明确 gap，避免设置与停止按钮在窄屏上视觉贴合或覆盖。

## Compatibility And Native Guidance

旧客户端如果仍把配置入口绑定在父级详情模板，迁移到多 tab interactive pane 后会丢失入口。iOS/Android 实现应把 composer 工具行视为每个会话 pane 的局部 UI：配置状态、展开状态和远端 option probe 都跟随当前 conversation pane，而不是放在外层 shell。原生端应保持五个并列操作，不要用停止按钮替换设置按钮。
