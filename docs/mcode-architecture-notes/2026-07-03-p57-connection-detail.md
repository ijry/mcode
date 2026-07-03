# P57 连接详情页

## 架构

MCode App 新增 `pages/connection-detail/index` 作为连接级工作台。页面通过本地 `connectionId` 恢复 `ConnectionRecordV2`，顶部展示连接基础信息，下面用四个标签承载 `文件夹`、`设置`、`连接信息`、`配置码`。

文件夹标签复用 `ProjectFolderList`，旧 `pages/projects/index` 只保留路由包装。设置标签通过现有 `CodegGateway.call(command, payload)` 调用 codeg-main 已有设置命令，不新增连接 schema。

## 协议与数据流

- 文件夹：继续使用 `list_open_folder_details`、`open_folder`、`get_home_directory`、`list_directory_entries` 等 P45 协议。
- 语言：`get_system_language_settings` / `update_system_language_settings`。
- 委派：`get_delegation_settings` / `set_delegation_settings`，移动端只编辑 enabled、depth_limit、completed_cache_max_mb。
- 对话工具：`get_feedback_settings` / `set_feedback_settings`、`get_question_settings` / `set_question_settings`。
- 快捷消息：`quick_messages_list`、`quick_messages_create`、`quick_messages_update`、`quick_messages_delete`；P57 不做 reorder。
- 外观强调色：codeg-main 当前是前端 localStorage/DOM 偏好，P57 只展示映射选项和协议缺口，不伪造远端保存。

## UI 行为

连接列表主卡进入详情页；底部主操作继续连接并打开文件夹列表。详情页 tab 顺序是 `文件夹 / 设置 / 连接信息 / 配置码`。设置页采用截图同类的分组列表：`个性化` 下有 `外观`、`语言`、`通用`、`快捷消息`。`通用` 内含 `委派` 与 `对话工具`。

连接信息页只展示本地连接记录和远端描述符的摘要，不展示 direct token、pair secret、access token 或 refresh token；需要表达凭据状态时只显示 `已保存` 或 `未保存`。

## 兼容性

codeg-main 新版本支持可读写设置。mcode-desktop 或旧 codeg-main 缺少命令时，设置标签按行显示 `当前桌面端不支持`，不阻断文件夹、连接信息或配置码。

现有项目列表路由仍然可用；配置码仍由 `buildConnectionConfigCode(connection)` 生成，保持 Wear OS 导入格式兼容。

## iOS / Android 复刻要求

原生端必须用同一连接 gateway 调用桌面命令。不要在连接信息中展示 secret。文件夹标签必须浏览远端目录。外观强调色在桌面端暴露远端偏好命令前只能展示协议限制。快捷消息 P57 只做增删改查，不做排序。
