# 详情页快捷命令面板关闭

## Architecture

会话详情页的快捷命令面板仍由 `ConversationDetailInteractivePane.vue` 局部管理。`detailSlashCommands.ts` 新增 `resolveSlashTriggerKey(text)`，用于识别当前行尾 slash 触发段，例如 `/` 和 `/review` 共享同一个触发 key，`hello\n/` 与 `hello\n/re` 共享另一个触发 key。

## Data Flow

当输入文本当前行以 `/query` 形式触发快捷命令时，pane 计算 `slashTriggerKey` 并过滤可用命令。用户点击面板右上角关闭按钮后，pane 将该 key 写入 `dismissedSlashTriggerKey`。只要输入仍处于同一个 slash 触发段，`showSlashPanel` 为 false；删除 `/`、输入空格、发送后清空输入，或在新行重新输入 `/` 时会产生空 key 或新 key，面板恢复正常触发。

## UI Behavior

快捷命令面板右上角显示一个小关闭图标。关闭不修改输入内容，不取消发送能力，也不影响用户继续输入以 `/` 开头的普通文本。点击某个快捷命令仍按旧逻辑替换当前 slash 片段并追加空格。

## Compatibility And Native Guidance

该行为不改变 ACP 协议和 command payload。原生 iOS/Android 客户端应把关闭状态实现为 composer 内存状态，粒度为“当前 slash 触发段”，不要持久化为用户设置，也不要全局禁用快捷命令。
