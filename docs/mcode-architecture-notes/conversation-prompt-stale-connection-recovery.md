# 会话发送的失效 ACP 连接恢复

## 架构与数据流

会话详情页发送提示词时，`acp_prompt` 先使用当前运行时的 `connectionId`。若服务端明确返回 `connection not found`，客户端将其视为桌面 ACP 进程重启或连接回收造成的失效 ID：

1. 删除该会话的实时订阅、运行时连接缓存和 `connectionSessionManager` 映射。
2. 保留清理前的 `externalId`（代理会话 ID），调用既有 `runtime.connect()` 恢复同一逻辑会话。
3. 使用新 `connectionId` 原样重发本次提示词一次。

重连仍失败时，错误按原有发送失败流程展示。`sendPromptWithConnectionRecovery()` 只允许一次恢复重试，不会循环发送。

## UI 行为

用户不需要手动重开详情页或重新输入内容。第一次请求尚未送达且连接缺失时，乐观消息保持在原位置，恢复后的第二次请求复用同一草稿；只有最终失败时才移除乐观消息并展示错误。

## 兼容性

仅匹配错误文本中的 `connection not found`，网络异常、鉴权失败、限流、运行中冲突和代理业务错误均不会自动重试，保留原错误语义。恢复依赖现有 `acp_connect` 对 `sessionId`/`externalId` 的会话恢复能力；缺少外部会话 ID 的新会话仍按既有连接创建流程执行。

## 原生 iOS/Android 复刻

原生客户端应将会话的临时 ACP `connectionId` 与持久化的 `externalId` 分开保存。发送遇到精确的“连接不存在”协议错误时，原子地废弃临时连接和事件订阅，使用 `conversationId + agentType + externalId` 重新连接，再对同一不可变发送载荷最多重试一次。不要把所有网络失败纳入重试，也不要在第二次失败后继续自动发送。
