# P59 Detail Permission Stale Snapshot Guard

## Summary

会话详情页的授权卡由 `session.pendingPermission` 驱动。实时 `permission_request` 先到达后，如果页面随后拉到更旧的 `acp_get_session_snapshot_by_conversation`，旧 snapshot 可能不含 `pending_permission`，从而把刚出现的授权卡清掉，表现为授权窗口一闪而过。

本次修正 `conversationRuntime.hydrateLiveSnapshot(...)` 的序号防线：当 snapshot 的 `event_seq` 小于当前 `lastAppliedSeq` 时，直接丢弃该 snapshot，不再回写 `pendingPermission`、`pendingQuestion`、`status` 或错误文本。

## Architecture

- `permission_request` realtime event 仍是授权卡的权威触发来源，会设置 `status = waiting_permission` 并保存 pending request。
- `permission_resolved` 或本机提交授权后，仍按 request id 精确清理 pending request。
- snapshot 只在无更新 realtime 状态，或 `event_seq` 不落后于当前 runtime 时参与补齐 live 状态。
- 低序号 snapshot 被视为过期读模型，不允许覆盖任何易变运行态。

## Data Flow

1. 移动端 attach realtime，并维护每个会话的 `lastAppliedSeq`。
2. 收到 `permission_request(seq = N)` 后，详情页立即显示授权卡。
3. 若稍后返回 `event_seq < N` 的 snapshot，runtime 保留当前授权卡和 `waiting_permission` 状态。
4. 只有 `permission_resolved`、同序/更新 snapshot 或后续终结事件才能收敛该 pending 状态。

## UI Behavior

- 授权卡不再因旧 snapshot 慢返回而闪现后消失。
- 旧快照也不会复活或清空问题卡、错误文本和当前运行状态。
- 已解决授权仍会在收到匹配的 `permission_resolved` 后立即关闭。

## Compatibility

- 不修改 ACP 协议和后端接口。
- 依赖现有 `event_seq` / `eventSeq` 与 realtime event `seq` 的单调序号语义。
- 无 `event_seq` 的旧 snapshot 保持原 hydration 行为。

## Native Replication Guidance

原生 iOS/Android 客户端需要把 snapshot 与 realtime 放在同一条单调序号线上比较。若 snapshot 序号低于本地已应用 event 序号，必须整体忽略其运行态字段，尤其是 pending permission/question、status、live text 和 error。授权 UI 的关闭应由匹配 request id 的 resolved event、用户提交成功或更新序号状态驱动。
