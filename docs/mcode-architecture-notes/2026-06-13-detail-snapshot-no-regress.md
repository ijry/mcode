# Detail Snapshot No Regress

## Summary

会话详情页在恢复 realtime 后，会继续主动拉一次 ACP session snapshot 补齐 live 状态。此前如果 realtime 已经先收到更高序号的 `stream_batch`，而随后拿到的 snapshot 仍是较旧状态，前端会把旧 snapshot 直接覆盖到 `liveMessage`，导致详情页尾部最新文本段丢失。

本次改为：snapshot 只允许前进，不允许用更低 `event_seq` 回退覆盖已经应用过的实时内容。

## Architecture

- `conversationRuntime.hydrateLiveSnapshot(...)` 现在先读取 snapshot 的 `event_seq`。
- 若 snapshot 的 `event_seq` 小于当前 session 的 `lastAppliedSeq`：
  - 保留当前 `liveMessage`；
  - 保留当前 `lastAppliedSeq`；
  - 仅用 snapshot 补齐权限请求、问题请求、状态和错误文本等辅助状态。

## Data Flow

1. 详情页 `connect(...)` 后 attach realtime。
2. 若先收到新的 `stream_batch`，session 会先推进 `lastAppliedSeq` 并追加 live 文本。
3. 随后详情页再拉 snapshot。
4. 若 snapshot 的 `event_seq` 更旧，则跳过对 live 内容的覆盖。
5. 后续新的 replay / event 继续从已知较高序号往前推进，不再丢失尾段文本。

## UI Behavior

- 详情页流式回复尾部不再因初始化阶段的旧 snapshot 回写而缺少最后几段。
- 已存在的权限卡片、问题卡片、状态徽标仍可从 snapshot 正常恢复。

## Compatibility

- 不修改后端协议。
- 依赖现有 snapshot 中的 `event_seq` / `eventSeq` 字段；无序号时保持原逻辑。

## Native Replication Guidance

- 原生端若同时消费 realtime 和 snapshot，必须把二者放在同一条会话序号线上比较。
- 禁止让较旧 snapshot 直接覆盖更高序号的 live 文本缓冲。
- 若需要保留 snapshot 的辅助状态，可只更新非文本主内容字段。
