# Detail Latest Batch Runtime Reload

## Summary

会话详情页运行中如果通过 realtime 回放、`turn_complete` 校准或外部用户补回填一次性写入了多条新 turn，runtime 之前只会按当前 `localTurns.length` 重新读取最近 N 条本地 turn。这个固定窗口可能继续停留在旧范围，导致详情页偶发缺失“最新一批消息”。

本次将 runtime 的本地重载逻辑对齐到详情页首屏已使用的“最新窗口 + 向前扩窗补足用户上下文”策略，保证运行中刷新也能覆盖刚持久化的新批次。

## Architecture

- `conversationRuntime.reloadLocalTurns(...)` 不再直接调用固定窗口的 `getNewestTurns(...)`。
- 改为复用同样的查询策略：
  - 先取最近 `limit` 条。
  - 如果用户消息条数不足，则继续按历史 cursor 向前追加更老 turn。
  - 扩窗上限保持保守，避免运行中无限放大内存窗口。

## Data Flow

1. realtime 事件、`turn_complete` 或 replay gap 校准把远端 detail snapshot 落到 SQLite。
2. runtime 进入 `reloadLocalTurns(...)`。
3. runtime 先读取最新窗口，再按 oldest cursor 调用 `getOlderTurns(...)` 逐批补齐必要上下文。
4. 详情页 `messages = localTurns + optimisticTurns + liveMessage` 重新计算后，能够包含刚落库的最新批次。

## UI Behavior

- 详情页在会话运行中收到一批新增消息后，不再因为旧窗口长度复用而漏显示最新批次。
- 仍然优先展示最新消息；只在用户上下文不足时向前补少量历史，不改变现有滚动与分页交互。

## Compatibility

- 不修改 ACP 协议、不改 SQLite 表结构、不改消息去重键。
- 只调整 runtime 的本地 reload 查询策略，对已有持久化数据兼容。

## Native Replication Guidance

- iOS/Android 原生实现不要在“运行中本地重载”时只按当前内存消息数截取最近 N 条。
- 应使用两段式策略：
  - 先取最新窗口。
  - 再按最老游标向前补批，直到满足最小用户消息上下文或达到安全上限。
- 这样可以避免远端一次补进多条 turn 时，详情页仍持有旧截断窗口。
