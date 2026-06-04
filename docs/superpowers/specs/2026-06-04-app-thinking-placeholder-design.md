# App Thinking Placeholder Design

**Date:** 2026-06-04  
**Scope:** `mcode-app` 会话详情页发送后即时思考反馈  
**Primary Files:** `mcode-app/src/pages/conversation-detail/index.vue`, `mcode-app/src/stores/conversationRuntime.ts`, `mcode-app/src/types/acp.ts`

---

## Problem

当前 APP 在用户发送消息后，会先插入乐观用户消息，但 assistant 侧通常要等到 ACP 首个流式分片到达，消息列表里才会出现回复气泡。

这会产生一个明显的反馈空窗期：

- 用户已经发送成功，但对话流里没有 assistant 侧反馈
- 顶部运行状态即使切到“思考中”，感知也弱于消息流内反馈
- 如果首包延迟较高，页面看起来像是“没反应”

现有实现里，assistant 流式内容已经统一通过 `runtime.liveMessage` 渲染为消息列表末尾的一条消息，因此问题不在渲染能力缺失，而在“发送成功到首个流式事件到达之间”没有占位消息。

## Goal

为 `mcode-app` 增加“发送成功后立即显示 assistant 思考占位消息”的能力，满足以下目标：

- 用户发送成功后，消息列表立即出现一条 assistant 气泡，内容为“思考中…”
- 首个真实 assistant 分片到达后，原地替换这条占位消息，不新增第二条 assistant 消息
- 默认占位文案不残留到最终落盘内容中
- 继续复用现有 `runtime.liveMessage -> turn_complete` 的流式与持久化链路

## Non-Goals

- 不新增页面级临时消息队列
- 不修改 ACP 协议或服务端事件格式
- 不重新设计顶部运行状态条
- 不改变乐观用户消息、待发送队列、失败 toast 的既有交互

## Options Considered

### 1. 发送成功后立即创建 assistant `liveMessage` 占位（采用）

**做法**

- 在 `sendDraft` 发送成功后，立即为当前会话创建一个仅包含 `thinking("思考中…")` 的 `liveMessage`
- 真实流式分片到达后，直接在同一个 `liveMessage` 上替换或追加内容
- 最终仍由 `turn_complete` 统一收口

**优点**

- 复用现有消息流、滚动、持久化与完成收口逻辑
- assistant 消息顺序稳定，不会先插占位再插正式消息
- 改动集中在 runtime 层和发送入口

**缺点**

- 需要精确定义“默认占位”和“真实首包”的替换规则

### 2. 页面层拼接一条本地 assistant 临时消息

**做法**

- 页面在 `messages` 之外额外渲染一条“思考中…”假消息
- 真正 `liveMessage` 出现后再移除假消息

**优点**

- 不需要改 runtime 内部结构

**缺点**

- 会形成第二套消息状态源
- 滚动、异常清理、消息替换时机都更容易分叉

### 3. 仅提前切换顶部运行状态

**做法**

- 发送后立即把 runtime 状态切到 `thinking`
- 不在消息列表中显示 assistant 占位消息

**优点**

- 实现最简单

**缺点**

- 用户反馈不在消息流里，感知不足
- 不满足“发送后立即给出思考中反馈”的主要目标

## Chosen Design

采用 **方案 1**：发送成功后立即创建 assistant `liveMessage` 占位，并在首个真实分片到达时原地替换。

核心原则如下：

1. **只维护一条 assistant 流式消息。**
2. **默认占位只负责即时反馈，不参与最终内容。**
3. **首个真实分片负责清除或覆盖占位。**
4. **`turn_complete` 仍然是唯一的最终持久化收口点。**

## Detailed Design

### 1. 占位消息创建时机

在 `mcode-app/src/pages/conversation-detail/index.vue` 的 `sendDraft` 中：

1. 保持现有乐观用户消息逻辑不变
2. `acpPrompt(...)` 调用成功返回后，立即通知 runtime 为当前会话创建 assistant 占位 `liveMessage`
3. 占位消息内容固定为一个 `thinking` part，文案为 `思考中…`

这样消息列表会立刻出现一条 assistant 流式气泡，不依赖后端首包何时到达。

### 2. 占位消息形态

当前 `LiveMessage` 仅包含：

- `role`
- `content`
- `isStreaming`
- `timestamp`

为了区分“本地默认占位”和“真实流式内容”，为 `LiveMessage` 增加一个轻量标记：

```ts
isPlaceholderThinking?: boolean
```

创建默认占位时：

- `content = [{ type: "thinking", thinking: "思考中…" }]`
- `isStreaming = true`
- `isPlaceholderThinking = true`

该标记只用于运行时衔接，不需要持久化。

### 3. 首个真实分片替换规则

在 `conversationRuntime.appendLiveContent(...)` 中，新增“占位替换”分支。

当 `session.liveMessage?.isPlaceholderThinking === true` 时：

#### 首包为 `text`

- 先清空占位 `content`
- 以空消息作为真实流的起点
- 再按现有逻辑写入 `text` delta

结果：用户看到同一条 assistant 消息从“思考中…”变为正文。

#### 首包为 `thinking`

- 不把默认占位文案继续拼接
- 直接将当前 `thinking` part 视为真实思考内容起点
- 用真实 `thinking` delta 覆盖默认占位

结果：不会出现“思考中…真实思考内容”的重复前缀。

#### 首包为 `plan`

- 先清空默认占位
- 再创建 `plan` part 并写入真实内容

#### 首包触发工具相关快照回填

如果 live message 是通过 snapshot hydrate 或其他非 `thinking` 内容初始化，同样应丢弃默认占位，只保留真实内容块。

一旦首个真实内容进入 `liveMessage`，立即将：

```ts
isPlaceholderThinking = false
```

后续所有分片继续走原有追加逻辑。

### 4. 消息列表与顺序

`runtime.getMessages(...)` 维持当前结构：

- `localTurns`
- `optimisticTurns`
- `liveMessage`

本次不引入新的临时消息来源，因此列表中的 assistant 占位消息天然位于乐观用户消息之后、流式消息位置之前，不会新增顺序抖动问题。

### 5. 失败收口

需要区分两类失败：

#### `acpPrompt` 直接失败

如果发送请求本身抛错：

- 保持现有 draft 失败回退逻辑
- 同时移除刚创建的 assistant 占位 `liveMessage`

否则消息列表会残留一条无对应回复的“思考中…”气泡。

#### 发送成功后，后续运行异常

如果请求已经成功发出，只是后续流式响应中断或连接异常：

- 不立即移除占位消息
- 继续沿用现有 runtime 状态显示错误或等待恢复

这是刻意保守的选择，避免短暂抖动时 assistant 气泡闪现后又消失。

### 6. 完成收口

`conversationRuntime.completeTurn(...)` 继续作为唯一完成收口点：

1. 将 `optimisticTurns` 和当前 `liveMessage` 组装为本轮完成消息
2. 尝试持久化
3. 成功后清空 `optimisticTurns` 与 `liveMessage`
4. 失败时沿用现有 fallback 逻辑

因为默认占位会在首个真实分片到达时被替换，所以最终落盘内容中不应包含 `思考中…` 这段默认文案。

### 7. 与快照恢复的关系

当前 runtime 支持通过 `hydrateLiveSnapshot(...)` 恢复远端 live 状态。该流程需要兼容本次占位逻辑：

- 如果快照中存在真实 `live_message` 内容，则直接以快照内容替换本地占位
- 如果快照为空，则保留现有本地占位，直到真实事件或完成事件到达

这保证首屏恢复和正常流式不会互相覆盖出脏状态。

## Data Flow

1. 用户点击发送
2. 页面创建并显示乐观用户消息
3. `acpPrompt(...)` 成功返回
4. runtime 立即创建 assistant 占位 `liveMessage("思考中…")`
5. 消息列表末尾立刻出现 assistant 思考气泡
6. 首个真实流式分片到达
7. runtime 检测到 `isPlaceholderThinking`
8. 清空或覆盖默认占位，并写入真实内容
9. 后续分片继续追加到同一个 `liveMessage`
10. `turn_complete` 到达后统一落盘并清空 live 状态

## Files

- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
- Modify: `mcode-app/src/stores/conversationRuntime.ts`
- Modify: `mcode-app/src/types/acp.ts`

## Proposed API Shape

推荐在 runtime 中新增显式方法，而不是让页面直接拼装 `liveMessage`：

```ts
function beginPlaceholderThinking(conversationId: number) {
  const session = getOrCreateSession(conversationId)
  session.status = "thinking"
  session.liveMessage = {
    role: "assistant",
    content: [{ type: "thinking", thinking: "思考中…" }],
    isStreaming: true,
    timestamp: Date.now(),
    isPlaceholderThinking: true,
  }
}

function clearLiveMessage(conversationId: number) {
  const session = getOrCreateSession(conversationId)
  session.liveMessage = null
}
```

页面发送成功后调用 `beginPlaceholderThinking(conversationId)`；发送直接失败时调用 `clearLiveMessage(conversationId)` 兜底清理。

## Error Handling

- 默认占位创建失败不应阻断主发送流程；最多降级为“无即时思考反馈”
- 发送直接失败时必须清掉本地占位
- snapshot 或流式事件到达时，如果发现 live message 结构异常，沿用现有 `appendLiveContent` 的重建逻辑

## Testing Strategy

手动验证以下场景：

1. **发送后、首包前**
   - 发送一条普通文本消息
   - 预期：底部立即出现 assistant “思考中…”气泡

2. **首包为 `text`**
   - 让 agent 直接输出正文
   - 预期：占位气泡原地变成正文
   - 预期：不会新增第二条 assistant 消息

3. **首包为 `thinking`**
   - 让 agent 先输出 reasoning / thinking 分片
   - 预期：默认文案被真实 thinking 覆盖
   - 预期：不会出现“思考中…真实 thinking”前缀拼接

4. **首包为 `plan`**
   - 触发返回 plan 内容的路径
   - 预期：默认占位被 plan 内容替换

5. **发送直接失败**
   - 制造未连接或发送报错场景
   - 预期：assistant 占位消息不会残留在列表中
   - 预期：现有失败 toast 和 draft 队列行为保持不变

6. **发送成功后响应异常**
   - 发送成功后中断连接
   - 预期：占位消息保留，顶部状态反映异常或等待恢复

7. **完成落盘**
   - 回复结束后重新进入详情页
   - 预期：最终持久化消息中不包含默认 `思考中…` 文案

## Acceptance Criteria

- 用户发送成功后，消息流中立即出现 assistant “思考中…”反馈
- 真实首包到达后，占位消息原地替换，不新增第二条 assistant 消息
- 默认 `思考中…` 文案不会残留到最终完成消息
- 发送直接失败时，占位 assistant 消息会被清理
- 不新增页面级临时消息状态源
- 继续复用现有 `runtime.liveMessage -> completeTurn` 的主链路
