# 2026-07-01 Detail Direct API Contract Alignment

## Architecture

本次没有新增页面结构，只修正 `mcode-app` 与 `codeg-main` 直连 HTTP API 的契约对齐。

涉及两条现有链路：

- 跨端会话 tabs 持久化：`save_opened_tabs`
- 会话 live connection 探测：`acp_find_connection_for_conversation`

## Protocol And Data Flow

`save_opened_tabs` 的服务端直连 handler 接收的是 compare-and-set 结构：

- `items`
- `expectedVersion`
- `origin`

客户端之前误发成：

- `tabs`
- `version`
- `origin`

这会在 H5 直连模式下触发 `422 Unprocessable Entity`。现已统一改回 `items + expectedVersion`。

`acp_find_connection_for_conversation` 的服务端直连 handler 还要求：

- `conversationId`
- `agentType`
- 可选 `sessionId`

客户端之前只传 `conversationId`，因此在详情页打开、共享 live 探测、创建会话后的 prompt replay 探测场景里也会触发 `422`。现已统一补齐 `agentType`，并在可用时带上 `sessionId`。

## UI Behavior

用户侧行为没有新增功能变化，主要是消除 H5 详情页和会话创建流中的首屏报错：

- 打开详情页不再因 tabs 持久化失败产生 `save_opened_tabs 422`
- live connection 探测不再因缺少 `agentType` 产生 `acp_find_connection_for_conversation 422`

## Compatibility

- Tauri 命令路径原本就是 `items + expectedVersion`，本次改动让 H5 直连与桌面协议重新一致。
- 这次修复不修改 SQLite、realtime 事件、opened tabs 数据模型。
- iOS/Android 复刻时也应遵守同样的 HTTP body 结构，不要只传 `conversationId`。

## Native iOS/Android Replication

原生客户端对接直连后端时，`save_opened_tabs` 必须发送：

- `items: [OpenedTab]`
- `expectedVersion: Int64`
- `origin: String`

`acp_find_connection_for_conversation` 必须发送：

- `conversationId: Int`
- `agentType: String`
- `sessionId: String?`

否则后端 axum handler 会在参数反序列化阶段直接返回 `422`，不会进入业务逻辑。
