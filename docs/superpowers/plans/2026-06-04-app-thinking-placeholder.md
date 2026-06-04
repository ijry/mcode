# App Thinking Placeholder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `mcode-app` 在用户发送消息成功后，立即在消息流中显示一条 assistant “思考中…”占位消息，并在真实流式内容到达后原地替换，不把默认占位文案落盘。

**Architecture:** 继续复用现有 `conversationRuntime` 的 `liveMessage` 单通道流式消息模型，不新增页面级临时消息源。实现集中在三个位置：`LiveMessage` 类型扩展、runtime 占位生命周期管理、详情页发送成功后触发占位创建与直接失败清理。

**Tech Stack:** Vue 3, Pinia, TypeScript, uni-app, pnpm

---

## File Structure

- Modify: `mcode-app/src/types/acp.ts`
  - 为 `LiveMessage` 增加本地占位标记，供 runtime 判断默认 thinking 是否已被真实流替换。
- Modify: `mcode-app/src/stores/conversationRuntime.ts`
  - 新增占位消息创建/清理 helper。
  - 让 `appendLiveContent`、`handleEvent(tool_call)`、`hydrateLiveSnapshot`、`completeTurn` 都正确处理占位状态。
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
  - 在 `sendDraft` 成功返回后立即启动 assistant 占位消息。
  - 在发送直接失败时清理可能存在的本地占位。

## Validation Notes

- 当前仓库 `pnpm -C mcode-app exec vue-tsc --noEmit` 已有与本需求无关的历史错误，不能作为本次通过门槛。
- `pnpm -C mcode-app build:h5` 当前可通过，输出包含大量 Sass `@import` / legacy API deprecation warnings；本次以它作为静态构建回归检查。
- 用户可见验收以手动场景验证为主。

### Task 1: Extend `LiveMessage` and Runtime Placeholder Helpers

**Files:**
- Modify: `mcode-app/src/types/acp.ts`
- Modify: `mcode-app/src/stores/conversationRuntime.ts`

- [ ] **Step 1: Add the placeholder flag to `LiveMessage`**

Update `mcode-app/src/types/acp.ts` so the runtime can distinguish a local default placeholder from real streamed content:

```ts
export interface LiveMessage {
  role: "assistant"
  content: ContentPart[]
  isStreaming: boolean
  timestamp: number
  isPlaceholderThinking?: boolean
}
```

- [ ] **Step 2: Add runtime helpers for creating and clearing placeholder live messages**

In `mcode-app/src/stores/conversationRuntime.ts`, add focused helpers near `setLiveMessage(...)`:

```ts
function createLiveMessage(content: ContentPart[] = [], isStreaming = true): LiveMessage {
  return {
    role: "assistant",
    content,
    isStreaming,
    timestamp: Date.now(),
    isPlaceholderThinking: false,
  }
}

function beginPlaceholderThinking(conversationId: number) {
  const session = getOrCreateSession(conversationId)
  session.status = "thinking"
  session.liveMessage = {
    ...createLiveMessage([{ type: "thinking", thinking: "思考中…" }]),
    isPlaceholderThinking: true,
  }
}

function clearLiveMessage(conversationId: number) {
  const session = getOrCreateSession(conversationId)
  session.liveMessage = null
}

function clearPlaceholderLiveMessage(session: RuntimeSession) {
  const current = session.liveMessage
  if (!current?.isPlaceholderThinking) return current

  const nextLiveMessage: LiveMessage = {
    ...current,
    content: [],
    isPlaceholderThinking: false,
  }
  session.liveMessage = nextLiveMessage
  return nextLiveMessage
}
```

- [ ] **Step 3: Export the new runtime helpers from the store**

Update the returned store API so the page layer can trigger placeholder lifecycle without manually mutating `session.liveMessage`:

```ts
return {
  sessions,
  connections,
  getOrCreateSession,
  getMessages,
  addOptimisticUserMessage,
  setLiveMessage,
  beginPlaceholderThinking,
  clearLiveMessage,
  appendLiveContent,
  completeTurn,
  handleEvent,
  hydrateLiveSnapshot,
  connect,
  disconnect,
  clearSession,
}
```

- [ ] **Step 4: Keep the helper wiring internally consistent**

Update `setLiveMessage(...)` to use the shared helper instead of hand-building a partial object:

```ts
function setLiveMessage(
  conversationId: number,
  content: ContentPart[],
  isStreaming: boolean
) {
  const session = getOrCreateSession(conversationId)
  session.liveMessage = createLiveMessage(content, isStreaming)
}
```

- [ ] **Step 5: Commit the runtime helper groundwork**

Run:

```bash
git add mcode-app/src/types/acp.ts mcode-app/src/stores/conversationRuntime.ts
git commit -m "refactor: add runtime helpers for thinking placeholders"
```

Expected: Git creates a commit containing only the `LiveMessage` type change and new runtime helper plumbing.

### Task 2: Make Streaming, Snapshot, Tool Calls, and Completion Placeholder-Aware

**Files:**
- Modify: `mcode-app/src/stores/conversationRuntime.ts`

- [ ] **Step 1: Replace the default placeholder on the first real stream delta**

Update `appendLiveContent(...)` so any real `text`, `thinking`, or `plan` delta first strips the default placeholder instead of concatenating onto `"思考中…"`:

```ts
function appendLiveContent(conversationId: number, delta: string, contentType: string) {
  const session = getOrCreateSession(conversationId)
  if (!session.liveMessage) {
    session.liveMessage = createLiveMessage()
  }
  session.status = "thinking"

  const currentLiveMessage =
    (session.liveMessage.isPlaceholderThinking
      ? clearPlaceholderLiveMessage(session)
      : session.liveMessage) ?? createLiveMessage()

  const nextContent = currentLiveMessage.content.slice()
  const tailIndex = nextContent.length - 1
  const shouldMergeWithTail =
    tailIndex >= 0 && nextContent[tailIndex]?.type === contentType
  const partIndex = shouldMergeWithTail ? tailIndex : -1
  const part = shouldMergeWithTail
    ? cloneContentPart(nextContent[tailIndex])
    : buildEmptyContentPart(contentType)

  if (contentType === "text") {
    part.text = (part.text || "") + delta
  } else if (contentType === "thinking") {
    part.thinking = (part.thinking || "") + delta
  } else if (contentType === "plan") {
    part.plan = parsePlanDelta(delta, (part.plan as Record<string, any> | undefined)?.steps)
  }

  if (partIndex >= 0) {
    nextContent.splice(partIndex, 1, part)
  } else {
    nextContent.push(part)
  }

  session.liveMessage = {
    ...currentLiveMessage,
    content: nextContent,
    isPlaceholderThinking: false,
  }
}
```

- [ ] **Step 2: Ensure tool calls also evict the placeholder instead of appending after it**

Update the `handleEvent(... case "tool_call")` branch so the first real tool activity also clears the default placeholder:

```ts
case "tool_call": {
  session.status = "running_tool"
  const currentLiveMessage =
    (session.liveMessage?.isPlaceholderThinking
      ? clearPlaceholderLiveMessage(session)
      : session.liveMessage) ?? createLiveMessage()

  session.liveMessage = {
    ...currentLiveMessage,
    isPlaceholderThinking: false,
    content: [
      ...currentLiveMessage.content,
      {
        type: "tool_call",
        tool_call: {
          id: event.data.id,
          name: event.data.name,
          input: event.data.input,
          status: "running",
        },
      },
    ],
  }
  break
}
```

- [ ] **Step 3: Let snapshot hydration prefer real live content but keep a local placeholder when the snapshot is empty**

Update `hydrateLiveSnapshot(...)` so runtime status derives from `normalizedLiveMessage ?? session.liveMessage`, not only the remote snapshot payload:

```ts
function hydrateLiveSnapshot(conversationId: number, snapshot: any) {
  const session = getOrCreateSession(conversationId)
  if (!snapshot || typeof snapshot !== "object") return

  const normalizedLiveMessage = mapSnapshotLiveMessage(snapshot)
  if (normalizedLiveMessage) {
    session.liveMessage = normalizedLiveMessage
  }
  const activeLiveMessage = normalizedLiveMessage ?? session.liveMessage
  session.status = deriveRuntimeStatus(snapshot, activeLiveMessage)
  session.lastAppliedSeq = firstNumber(snapshot?.event_seq, snapshot?.eventSeq) ?? session.lastAppliedSeq

  const usage = snapshot.usage
  if (usage && typeof usage === "object") {
    session.stats.totalTokens = firstNumber(usage.used) || session.stats.totalTokens
  }
}
```

Also make sure `mapSnapshotLiveMessage(...)` returns `isPlaceholderThinking: false`:

```ts
return {
  role: "assistant",
  content: parts,
  isStreaming: true,
  timestamp: parseTimestamp(rawLiveMessage?.started_at) || Date.now(),
  isPlaceholderThinking: false,
}
```

- [ ] **Step 4: Prevent an untouched placeholder from being persisted on `turn_complete`**

Update `completeTurn(...)` so a pure placeholder-only live message is ignored and cleared instead of becoming a saved assistant turn:

```ts
async function completeTurn(conversationId: number, eventData?: any) {
  const session = getOrCreateSession(conversationId)
  const completedTurns = session.optimisticTurns.map(cloneMessageTurn)
  const assistantTurn =
    session.liveMessage &&
    !session.liveMessage.isPlaceholderThinking &&
    session.liveMessage.content.length > 0
      ? buildAssistantTurn(session, session.liveMessage, eventData)
      : null

  if (assistantTurn) {
    completedTurns.push(cloneMessageTurn(assistantTurn))
  }

  if (completedTurns.length > 0) {
    const persisted = await persistCompletedTurns(session, completedTurns)
    if (persisted) {
      session.optimisticTurns = []
      session.liveMessage = null
      session.localTurns = await reloadLocalTurns(session)
    } else {
      session.localTurns.push(...session.optimisticTurns)
      session.optimisticTurns = []
      if (assistantTurn) {
        session.localTurns.push(assistantTurn)
      }
      session.liveMessage = null
    }
  } else {
    session.liveMessage = null
    try {
      await calibrateAfterReplayGap(conversationId)
      session.localTurns = await reloadLocalTurns(session)
    } catch (error) {
      console.warn("turn_complete remote backfill skipped", error)
    }
  }

  session.status = "idle"
  session.stats.turnCount++
}
```

- [ ] **Step 5: Commit the placeholder-aware runtime behavior**

Run:

```bash
git add mcode-app/src/stores/conversationRuntime.ts
git commit -m "feat: replace thinking placeholder with live response"
```

Expected: Git creates a commit covering stream, tool, snapshot, and completion logic for the new placeholder lifecycle.

### Task 3: Start the Placeholder From the Conversation Detail Send Flow

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`

- [ ] **Step 1: Trigger placeholder creation immediately after a successful prompt request**

Update `sendDraft(...)` so the assistant placeholder starts only after `acpPrompt(...)` returns successfully:

```ts
const conn = session.value?.connectionId
if (!conn) throw new Error("未连接到代理")
await acpApi.acpPrompt(conn, blocks, folderId.value, conversationId.value)
runtime.beginPlaceholderThinking(conversationId.value)
return true
```

This keeps the existing optimistic user message timing unchanged while making the assistant feedback appear as soon as the send is accepted.

- [ ] **Step 2: Clear any local placeholder if the send fails immediately**

Update the `catch` block in the same function so direct send failures do not leave an orphaned `"思考中…"` bubble:

```ts
} catch (error) {
  runtime.clearLiveMessage(conversationId.value)
  const message = toErrorMessage(error)
  draft.status = "failed"
  draft.error = message
  uni.showToast({ title: `发送失败: ${message}`, icon: "none", duration: 3000 })
  return false
} finally {
  sending.value = false
}
```

- [ ] **Step 3: Confirm no extra viewport patch is needed**

Do not add new scroll code in the page. The existing message watcher already reacts to the new assistant placeholder:

```ts
watch(
  () => messages.value.map((msg) => ({
    id: msg.id,
    role: msg.role,
    status: msg.status,
    content: JSON.stringify(msg.content || []),
  })),
  () => {
    if (loading.value || !hasInitialBottomScroll.value || isRestoringScroll.value) return
    scheduleViewportSync()
  }
)
```

Expected: the new placeholder insertion naturally reuses current bottom-follow logic instead of introducing a second scroll path.

- [ ] **Step 4: Commit the page wiring**

Run:

```bash
git add mcode-app/src/pages/conversation-detail/index.vue
git commit -m "feat: show assistant thinking placeholder after send"
```

Expected: Git creates a commit limited to the send-flow integration.

### Task 4: Validate the User-Facing Behavior and Create the Final Commit

**Files:**
- Modify: `mcode-app/src/types/acp.ts`
- Modify: `mcode-app/src/stores/conversationRuntime.ts`
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`

- [ ] **Step 1: Run the H5 build regression check**

Run:

```bash
pnpm -C mcode-app build:h5
```

Expected: command exits `0`, prints `DONE  Build complete.`, and may still emit existing Sass deprecation warnings.

- [ ] **Step 2: Run the manual send-flow smoke checks**

Execute this checklist in the app:

```text
1. 打开任一已连接会话，发送普通文本。
   预期：用户消息出现后，assistant “思考中…”立即出现。
2. 等待首个 text 分片返回。
   预期：同一条 assistant 消息原地变成正文，不新增第二条 assistant 回复。
3. 触发先返回 thinking 再返回正文的回复。
   预期：默认“思考中…”不会作为前缀残留在真实 thinking 文本前。
4. 触发工具调用或计划输出。
   预期：默认占位会被 tool/plan 内容替换，不会与“思考中…”并存。
5. 制造直接发送失败（例如断开连接）。
   预期：toast 仍显示“发送失败…”，且消息列表里没有残留的 assistant 占位气泡。
6. 发送成功后中断流式响应。
   预期：assistant 占位保留，页面状态反映异常或等待恢复，而不是立即消失。
7. 回复结束后退出并重新进入会话。
   预期：已持久化 assistant 消息中不包含默认“思考中…”文案。
```

- [ ] **Step 3: Inspect the final diff before the squash-free delivery commit**

Run:

```bash
git diff -- mcode-app/src/types/acp.ts mcode-app/src/stores/conversationRuntime.ts mcode-app/src/pages/conversation-detail/index.vue
```

Expected: diff only shows the placeholder flag, runtime helper/lifecycle logic, and the `sendDraft(...)` integration.

- [ ] **Step 4: Create the final feature commit**

Run:

```bash
git add mcode-app/src/types/acp.ts mcode-app/src/stores/conversationRuntime.ts mcode-app/src/pages/conversation-detail/index.vue
git commit -m "feat: show thinking placeholder immediately after send"
```

Expected: Git creates the final delivery commit without amending the earlier checkpoints.
