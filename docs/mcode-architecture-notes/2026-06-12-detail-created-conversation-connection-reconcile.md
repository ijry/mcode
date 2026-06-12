# Detail Created Conversation Connection Reconcile

## Summary

新建会话后，列表页会先把创建时拿到的 `connectionId` 预绑定到详情页 runtime。若远端在首次恢复阶段把该会话切换到新的会话绑定连接，详情页之前会继续沿用旧连接 attach realtime，结果表现为：

- 刚进入详情页时短暂有内容；
- 过一会不再更新；
- 重新进入页面仍然落后于桌面端，尤其缺最新文本消息。

本次在详情页 connect 阶段增加“远端权威连接校准”：即使本地已有 managed connection，也会再查询一次会话当前绑定连接；若已变化，则切换到远端返回的连接重新订阅 realtime。

## Architecture

- `conversationRuntime.connect(...)` 不再只在“本地没有 managed connection”时调用 `acp_find_connection_for_conversation`。
- 现在始终先做远端连接发现。
- 如果发现远端当前 `connectionId` 与本地预绑定不一致：
  - 用远端连接重新 adopt 当前会话；
  - 清空本地 `lastAppliedSeq`，避免带着旧连接游标去续订新连接。

## Data Flow

1. 创建页创建会话并预绑定一个初始 `connectionId`。
2. 详情页加载时调用 `connect(...)`。
3. `connect(...)` 先向远端查询该会话当前真实绑定连接。
4. 若远端连接已切换，则以远端连接替换本地 managed binding，并从空游标重新 attach。
5. 后续 snapshot / replay / event 都跟随远端当前绑定连接，详情页文本流不会停在旧连接上。

## UI Behavior

- 新建会话首次恢复后，详情页不会再因为继续监听旧连接而停更。
- 重新进入详情页时，会优先对齐远端当前绑定连接，文本消息应与桌面端保持一致。

## Compatibility

- 不修改后端协议，不要求新增接口。
- 兼容已有本地 runtime 缓存；只是在连接恢复时优先信任远端当前绑定连接。

## Native Replication Guidance

- 原生端如果存在“创建页先缓存 connectionId，再跳转详情页恢复”的链路，不要把创建瞬间拿到的连接视为长期真值。
- 详情页每次恢复都应先查询“该 conversation 当前绑定连接”。
- 一旦发现连接变化，必须：
  - 切换订阅目标连接；
  - 清掉旧连接上的序号游标；
  - 再做 snapshot / replay 恢复。
