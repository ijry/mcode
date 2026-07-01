# P46 会话总览状态判定收窄

## 背景

P46 修复会话列表在返回详情页后大量显示“远程运行中”的问题。根因是总览页把详情页运行时的 `connected` / `connecting` 也当成执行中状态覆盖了已保存的会话摘要状态。

## 架构

- 会话总览以持久化的会话摘要状态作为基线。
- 仅当 runtime 状态属于真实执行态时，才覆盖成 `in_progress`。
- 连接建立态 `connected`、`connecting` 和空闲态 `idle` 不再覆盖总览状态。
- 总览页把状态判定收敛到独立的 presentation helper，避免页面内再散落状态规则。

## 数据流

1. `conversationOverviewSnapshot` 先从摘要/打开标签构建总览卡片状态。
2. `conversations/index.vue` 读取 runtime store 的会话状态。
3. `resolveOverviewCardDisplayStatus(summaryStatus, runtimeStatus)` 只在 `thinking`、`running_tool`、`waiting_permission`、`waiting_question` 时返回 `in_progress`。
4. 返回详情页后，如果 runtime 只是 `connected`，总览继续显示摘要状态。

## UI 行为

- “远程运行中”只代表当前确实有任务在执行、等待授权或等待选择。
- 打开详情页、重新聚焦页面、或者仅建立连接，都不会把历史会话误标成运行中。
- 已完成、失败、待处理等摘要状态保持稳定。

## 兼容性

- 不改变任何网络协议或桌面端命令。
- 不修改会话摘要持久化格式。
- 旧数据仍可直接读取，只是总览展示更严格。

## 原生复刻

- iOS / Android 原生端也应以摘要状态为基线。
- 只有明确的实时执行事件才可覆盖为进行中。
- 连接已建立不等于任务执行中，不能单独驱动列表状态。
