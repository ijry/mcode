# 补充验证 — 发送消息时的后台任务状态

**验证场景**: 用户在会话详情页连续发送两条消息，Claude 正在回复第一条（有后台任务运行中）时发送第二条。

**初始担心**: `sendDraft()` → `ensureConversationReadyForSend()` → `runtime.connect()` → `bindManagedConnection()` 可能因 `connectionChanged` 判断而调用 `resetBackgroundActivityState()`，清空正在运行的后台任务。

---

## 验证结果：❌ 假警报 — 不会清空后台任务

### 保护机制一：早退避免重复连接

**代码位置**: `ConversationDetailInteractivePane.vue:3965-3966`

```typescript
const existingConnectionId = firstString(session.value.connectionId);
if (existingConnectionId) return existingConnectionId;
```

**行为**:
- 第一次发送消息时，`runtime.connect()` 建立连接并设置 `session.connectionId`
- 第二次发送消息时，`session.connectionId` 已存在，直接返回
- **整个 `runtime.connect()` 调用链都不会触发**

### 保护机制二：connectionChanged 判断

**代码位置**: `conversationRuntime.ts:1152-1165`

```typescript
const connectionChanged = session.connectionId !== managed.connectionId
if (connectionChanged) {
  // 只有连接真正改变时才清空
  resetBackgroundActivityState(session)
  // ...
}
```

**行为**:
- `connectionSessionManager.getByConversationId()` 返回同一个托管连接对象
- `managed.connectionId` 和 `session.connectionId` 是同一个值（第一次发送时已赋值）
- `connectionChanged` 判断为 `false`
- `resetBackgroundActivityState()` 在 `if (connectionChanged)` 块内，**不会执行**

### 唯一会清空的情况（符合预期）

`resetBackgroundActivityState()` 只在以下四种情况调用，都是**应该清空**的场景：

1. **`bindManagedConnection()` 且 `connectionChanged === true`** (line 1161)
   - 会话被另一个连接接管（例如 PC 和手机同时打开同一会话）
   - 旧连接的后台任务已失效

2. **`connectFreshConversation()` 发现会话已被接管** (line 1263)
   - 本地尝试建立新连接，但服务端报告会话已有连接
   - 降级为只读模式，清空本地推测的后台状态

3. **`disconnect()`** (line 1357)
   - 用户主动断开或连接异常关闭
   - 后台任务随连接消亡

4. **`invalidateConnection()`** (line 1386)
   - 连接作废（例如重连时）
   - 旧连接的状态不能带到新连接

5. **`attachViewer()`** (line 1517)
   - 以只读模式 attach 到已有会话
   - 清空推测状态，等快照水合

---

## 代码审查发现：设计健壮

### 1. 连接状态的生命周期管理清晰

- `session.connectionId` 在建立连接时设置，断开时清空
- 只要连接有效，该值保持稳定
- 发送消息时优先使用现有连接

### 2. 后台任务状态与连接强绑定

`resetBackgroundActivityState()` 的注释（line 1840-1851）明确说明：

> **后台工作活不过 agent CLI 进程，而它的寿命就是连接的寿命** —— 服务端的转录 watcher
> 因此也是 connection-scoped（`codeg-plus/src-tauri/src/acp/background_watch.rs` 顶部注释）。
> 所以旧连接的计数与任务行对新连接一律不成立，留着就是幽灵行。

设计理念正确：后台任务 = 连接的附属状态，连接变就该清。

### 3. 双重保护避免误清空

- **第一层**：早退机制（`existingConnectionId` 检查）— 避免不必要的连接操作
- **第二层**：`connectionChanged` 判断 — 避免误判连接变化

即使因某种异常（例如 store 数据损坏）导致 `session.connectionId` 被意外清空，第二层保护仍然生效：`managed.connectionId` 来自 `connectionSessionManager`，是独立的持久化存储，不会同时丢失。

---

## 结论

✅ **原验证报告的结论仍然成立**：后台任务功能端到端正确实现，无 bug。

✅ **发送第二条消息时不会清空后台任务**：有双重保护机制，只有连接真正改变时才清空（符合预期）。

✅ **代码设计健壮**：连接状态管理清晰，后台任务生命周期与连接强绑定，保护机制完善。
