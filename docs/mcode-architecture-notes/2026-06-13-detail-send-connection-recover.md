# Detail Send Connection Recover

## Summary

会话详情页之前存在两层状态错位：

- 列表或后台摘要可以继续显示会话“已连接”；
- 但详情页本地 runtime 在某些恢复路径下还没重新拿到 `connectionId`。

发送入口此前只检查共享发送权限，不检查或恢复本地发送连接，因此用户会看到可发送，但点击后直接报“未连接到代理”。

## Architecture

- 详情页将 `session.status === connected` 且 `session.connectionId` 为空的情况统一视为 `connecting`，避免把“远端仍在线”误渲染成“当前页已可发送”。
- 发送前新增本地连接恢复步骤：
  - 优先复用当前 runtime 的 `lastAppliedSeq`；
  - 调用 `conversationRuntime.connect(...)` 重新对齐当前会话绑定连接；
  - 恢复成功后再执行 `acp_prompt`。

## Data Flow

1. 页面恢复后，如果本地 session 只有状态而没有 `connectionId`，顶部状态显示为“连接中/恢复中”。
2. 用户发送消息时，详情页先调用本地连接恢复。
3. `conversationRuntime.connect(...)` 会继续沿用现有的远端权威连接发现逻辑，对齐会话当前绑定连接并重新 attach realtime。
4. 只有在恢复成功并拿到可用 `connectionId` 后，才会创建乐观消息并真正发送。

## UI Behavior

- 不再出现“顶部像是已连接，但发送立刻报未连接”的明显错位。
- 若只是本地连接丢失，发送会优先自恢复，而不是直接失败。
- 若恢复仍失败，用户看到的仍是明确的连接错误，而不是误导性的在线状态。

## Compatibility

- 不修改 ACP 协议，也不要求服务端新增字段。
- 仅调整详情页的客户端状态归一和发送前恢复流程。

## Native iOS/Android Replication Guidance

- 原生端不要仅凭远端摘要或共享桥接状态判断“当前页可发送”。
- “可发送”必须同时满足：
  - 当前会话存在本地可用的连接标识；
  - 当前端拥有发送权限。
- 发送前若发现本地连接标识缺失，应先执行一次会话连接恢复，再决定是否报错。
