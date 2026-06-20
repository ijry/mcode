# 2026-06-20 Cross-Device PC Tab Sync

## 背景

`codeg-main` 已经具备远端实例 tab 持久化与 `tabs://changed` 实时广播能力，但 `mcode-app` 之前没有把这套能力真正接起来：

- 会话列表把 `list_opened_tabs` 误当成数组，丢掉了 `version/items` 快照结构。
- 移动端新建会话、对历史会话继续发送时，不会显式确保 PC 端存在对应 tab。
- 详情页的本地 runtime 与远端校准之间没有“热会话”保护，容易在恢复期被旧快照干扰。

## 本次收口

本次只改 `mcode-app`，不调整 `codeg-main`：

- 新增 `openedTabsRealtimeCache`
  - 按 `instanceKey` 缓存远端 `opened_tabs` 快照。
  - 接收 `tabs://changed` 后按版本忽略旧快照。
- 新增 `pcTabSyncService`
  - 统一负责 `list_opened_tabs` / `save_opened_tabs`。
  - 在移动端新建会话后、详情页发送前，确保远端 PC tab 已存在。
  - 默认保守策略是 `preserve`，只补 tab，不强抢当前 PC 激活 tab。
- 新增 `hotConversationCoordinator`
  - 把“刚刚活跃过的会话”从页面生命周期中解耦出来。
  - runtime 在热窗口内不被 `clearCachedSessionState` 清掉，避免详情页恢复期被旧校准覆盖。

## 结果

- 移动端新建会话时，会同步在 PC 侧补齐 tab。
- 移动端对历史会话发消息时，会先确保 PC 侧存在对应 tab。
- 会话列表能正确消费 `opened_tabs` 版本化快照，并跟随 `tabs://changed` 实时刷新。
- 详情页恢复过程中，实时 runtime 继续作为优先权威源，远端 detail 拉取只承担冷启动元数据和必要校准职责。
