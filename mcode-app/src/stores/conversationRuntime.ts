import { defineStore } from "pinia"
import { ref } from "vue"
import type {
  MessageTurn,
  LiveMessage,
  ConnectionInfo,
  EventEnvelope,
  SessionStats,
  ContentPart,
} from "@/types/acp"
import { acpApi } from "@/api/acp"
import { useAuthStore } from "./auth"
import { connectionSessionManager } from "@/services/conversation/connectionSessionManager"
import {
  attachConversationRealtime,
  bindConversationEventHandler,
  calibrateAfterReplayGap,
  detachConversationRealtime,
  unbindConversationEventHandler,
} from "@/services/conversation/conversationSyncService"
import { ensureConversationSchema } from "@/services/db/migrations"
import {
  getNewestTurns,
  insertCompletedTurn,
  type PersistedTurnPartRow,
  type PersistedTurnWithParts,
} from "@/services/db/repositories/conversationRepository"
import { buildPersistedTurnRecord } from "@/services/conversation/conversationDetailPersistence"

/**
 * 会话运行时状态管理
 * 管理消息流、连接状态、乐观更新等
 */
export const useConversationRuntimeStore = defineStore("conversationRuntime", () => {
  const auth = useAuthStore()
  // 会话状态映射 conversationId -> RuntimeSession
  const sessions = ref<Map<number, RuntimeSession>>(new Map())

  // 连接状态映射 connectionId -> ConnectionInfo
  const connections = ref<Map<string, ConnectionInfo>>(new Map())

  /**
   * 获取或创建会话运行时
   */
  function getOrCreateSession(conversationId: number): RuntimeSession {
    if (!sessions.value.has(conversationId)) {
      sessions.value.set(conversationId, {
        conversationId,
        localTurns: [],
        optimisticTurns: [],
        liveMessage: null,
        connectionId: null,
        instanceKey: "",
        status: "idle",
        stats: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          turnCount: 0,
        },
      })
    }
    return sessions.value.get(conversationId)!
  }

  /**
   * 获取会话的所有消息（包括本地、乐观、流式）
   */
  function getMessages(conversationId: number): MessageTurn[] {
    const session = getOrCreateSession(conversationId)
    const messages: MessageTurn[] = [
      ...session.localTurns,
      ...session.optimisticTurns,
    ]

    // 如果有流式消息，添加到末尾
    if (session.liveMessage) {
      messages.push({
        id: `live-${Date.now()}`,
        role: "assistant",
        content: session.liveMessage.content,
        timestamp: session.liveMessage.timestamp,
        status: session.liveMessage.isStreaming ? "streaming" : "completed",
      })
    }

    return messages
  }

  /**
   * 添加乐观更新的用户消息
   */
  function addOptimisticUserMessage(
    conversationId: number,
    content: string,
    attachments?: any[]
  ) {
    const session = getOrCreateSession(conversationId)
    const turn: MessageTurn = {
      id: `optimistic-${Date.now()}`,
      role: "user",
      content: [
        {
          type: "text",
          text: content,
        },
      ],
      timestamp: Date.now(),
      status: "pending",
    }

    // 添加附件
    if (attachments && attachments.length > 0) {
      attachments.forEach((att) => {
        turn.content.push({
          type: "image",
          image: {
            url: att.url,
            alt: att.name,
          },
        })
      })
    }

    session.optimisticTurns.push(turn)
  }

  /**
   * 设置流式消息
   */
  function setLiveMessage(
    conversationId: number,
    content: ContentPart[],
    isStreaming: boolean
  ) {
    const session = getOrCreateSession(conversationId)
    session.liveMessage = {
      role: "assistant",
      content,
      isStreaming,
      timestamp: Date.now(),
    }
  }

  /**
   * 追加流式内容
   */
  function appendLiveContent(conversationId: number, delta: string, contentType: string) {
    const session = getOrCreateSession(conversationId)
    if (!session.liveMessage) {
      session.liveMessage = {
        role: "assistant",
        content: [],
        isStreaming: true,
        timestamp: Date.now(),
      }
    }
    session.status = "thinking"

    // 找到或创建对应类型的内容部分
    let part = session.liveMessage.content.find((p) => p.type === contentType)
    if (!part) {
      part = buildEmptyContentPart(contentType)
      session.liveMessage.content.push(part)
    }

    // 追加内容
    if (contentType === "text") {
      part.text = (part.text || "") + delta
    } else if (contentType === "thinking") {
      part.thinking = (part.thinking || "") + delta
    } else if (contentType === "plan") {
      part.plan = parsePlanDelta(delta, (part.plan as Record<string, any> | undefined)?.steps)
    }
  }

  function hydrateLiveSnapshot(conversationId: number, snapshot: any) {
    const session = getOrCreateSession(conversationId)
    if (!snapshot || typeof snapshot !== "object") return

    const normalizedLiveMessage = mapSnapshotLiveMessage(snapshot)
    if (normalizedLiveMessage) {
      session.liveMessage = normalizedLiveMessage
    }
    session.status = deriveRuntimeStatus(snapshot, normalizedLiveMessage)

    const usage = snapshot.usage
    if (usage && typeof usage === "object") {
      session.stats.totalTokens = firstNumber(usage.used) || session.stats.totalTokens
    }
  }

  /**
   * 完成当前轮次
   */
  async function completeTurn(conversationId: number, eventData?: any) {
    const session = getOrCreateSession(conversationId)
    const completedTurns = session.optimisticTurns.map(cloneMessageTurn)
    const assistantTurn = session.liveMessage
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
          session.liveMessage = null
        }
      }
    } else {
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

  /**
   * 处理事件
   */
  function handleEvent(event: EventEnvelope) {
    connectionSessionManager.touchConnection(event.connectionId)
    const session = Array.from(sessions.value.values()).find(
      (s) => s.connectionId === event.connectionId
    )
    if (!session) return

    switch (event.type) {
      case "stream_batch":
        appendLiveContent(
          session.conversationId,
          event.data.delta,
          event.data.contentType
        )
        break

      case "tool_call":
        session.status = "running_tool"
        // 添加工具调用
        if (!session.liveMessage) {
          session.liveMessage = {
            role: "assistant",
            content: [],
            isStreaming: true,
            timestamp: Date.now(),
          }
        }
        session.liveMessage.content.push({
          type: "tool_call",
          tool_call: {
            id: event.data.id,
            name: event.data.name,
            input: event.data.input,
            status: "running",
          },
        })
        break

      case "tool_call_update":
        if (event.data.status === "error") {
          session.status = "error"
        } else {
          session.status = "running_tool"
        }
        // 更新工具调用
        if (session.liveMessage) {
          const toolCall = session.liveMessage.content.find(
            (p) => p.type === "tool_call" && p.tool_call?.id === event.data.id
          )
          if (toolCall && toolCall.tool_call) {
            toolCall.tool_call.output = event.data.output
            toolCall.tool_call.status = event.data.status
            toolCall.tool_call.error = event.data.error
          }
        }
        break

      case "status_changed":
        session.status = event.data.status
        break

      case "permission_request":
        session.status = "waiting_permission"
        break

      case "turn_complete":
        void completeTurn(session.conversationId, event.data)
        break

      case "usage_update":
        session.stats.inputTokens += event.data.inputTokens || 0
        session.stats.outputTokens += event.data.outputTokens || 0
        session.stats.totalTokens += event.data.totalTokens || 0
        break
    }
  }

  /**
   * 连接到代理
   */
  async function connect(
    conversationId: number,
    agentType: string,
    workingDir?: string,
    sessionId?: string
  ) {
    const session = getOrCreateSession(conversationId)
    session.status = "connecting"
    connectionSessionManager.touchConversation(conversationId)

    try {
      const managed = await connectionSessionManager.connectConversation({
        conversationId,
        agentType,
        workingDir,
        sessionId,
        instanceKey: auth.currentRemoteInstance().instanceKey,
      })
      session.connectionId = managed.connectionId
      session.instanceKey = managed.instanceKey
      connections.value.set(managed.connectionId, managed.connection)
      session.status = "connected"

      bindConversationEventHandler(conversationId, handleEvent)
      await attachConversationRealtime({
        conversationId,
        instanceKey: managed.instanceKey,
        connectionId: managed.connectionId,
      })

      return managed.connection
    } catch (error) {
      session.status = "error"
      throw error
    }
  }

  /**
   * 断开连接
   */
  async function disconnect(conversationId: number) {
    const session = sessions.value.get(conversationId)
    if (session?.connectionId) {
      detachConversationRealtime(conversationId)
      unbindConversationEventHandler(conversationId)
      await connectionSessionManager.disconnectConversation(conversationId)
      connections.value.delete(session.connectionId)
      session.connectionId = null
      session.status = "idle"
    }
  }

  /**
   * 清理会话
   */
  function clearSession(conversationId: number) {
    detachConversationRealtime(conversationId)
    unbindConversationEventHandler(conversationId)
    connectionSessionManager.clearConversation(conversationId)
    sessions.value.delete(conversationId)
  }

  return {
    sessions,
    connections,
    getOrCreateSession,
    getMessages,
    addOptimisticUserMessage,
    setLiveMessage,
    appendLiveContent,
    completeTurn,
    handleEvent,
    hydrateLiveSnapshot,
    connect,
    disconnect,
    clearSession,
  }
})

interface RuntimeSession {
  conversationId: number
  localTurns: MessageTurn[]
  optimisticTurns: MessageTurn[]
  liveMessage: LiveMessage | null
  connectionId: string | null
  instanceKey: string
  status: "idle" | "connecting" | "connected" | "thinking" | "running_tool" | "waiting_permission" | "error"
  stats: SessionStats
}

function buildAssistantTurn(
  session: RuntimeSession,
  liveMessage: LiveMessage,
  eventData?: any
): MessageTurn {
  const timestamp = firstNumber(eventData?.timestamp, liveMessage.timestamp) || Date.now()
  return {
    id:
      firstString(eventData?.turnId, eventData?.id) ||
      `turn-${session.conversationId}-${timestamp}`,
    role: "assistant",
    content: cloneContentParts(liveMessage.content),
    timestamp,
    status: "completed",
  }
}

async function persistCompletedTurns(
  session: RuntimeSession,
  turns: MessageTurn[]
) {
  if (!session.instanceKey) return
  try {
    await ensureConversationSchema()
    for (const turn of turns) {
      await insertCompletedTurn(
        buildPersistedTurnRecord({
          turn,
          conversationId: session.conversationId,
          instanceKey: session.instanceKey,
          seq: turn.timestamp,
          dedupeId: turn.id,
        })
      )
    }
    return true
  } catch (error) {
    console.warn("persist completed runtime turns skipped", error)
    return false
  }
}

async function reloadLocalTurns(session: RuntimeSession) {
  const limit = Math.max(session.localTurns.length, 10)
  const turns = await getNewestTurns(session.conversationId, limit)
  return turns.slice().reverse().map(mapPersistedTurnToMessage)
}

function mapPersistedTurnToMessage(turn: PersistedTurnWithParts): MessageTurn {
  return {
    id: turn.id,
    role: turn.role as MessageTurn["role"],
    timestamp: turn.createdAt,
    status: (turn.status as MessageTurn["status"] | undefined) || "completed",
    content: turn.parts
      .slice()
      .sort((a, b) => a.partIndex - b.partIndex)
      .map(mapPersistedPartToContent)
      .filter(Boolean) as ContentPart[],
  }
}

function mapPersistedPartToContent(part: PersistedTurnPartRow): ContentPart | null {
  try {
    const payload = JSON.parse(part.payloadJson || "{}") as Record<string, any>
    if (part.type === "text") {
      return { type: "text", text: String(payload.text || payload.value || "") }
    }
    if (part.type === "thinking") {
      return {
        type: "thinking",
        thinking: String(payload.thinking || payload.text || payload.value || ""),
      }
    }
    if (part.type === "tool_call") {
      return { type: "tool_call", tool_call: payload.tool_call || payload }
    }
    if (part.type === "image") {
      return { type: "image", image: payload.image || payload }
    }
    if (part.type === "plan") {
      return { type: "plan", plan: payload.plan || payload }
    }
  } catch (error) {
    console.warn("failed to parse persisted runtime part", error)
  }
  return null
}

function cloneMessageTurn(turn: MessageTurn): MessageTurn {
  return {
    ...turn,
    content: cloneContentParts(turn.content),
  }
}

function cloneContentParts(parts: ContentPart[]): ContentPart[] {
  if (parts.length === 0) return []
  return JSON.parse(JSON.stringify(parts)) as ContentPart[]
}

function buildEmptyContentPart(contentType: string): ContentPart {
  if (contentType === "thinking") {
    return { type: "thinking", thinking: "" }
  }
  if (contentType === "plan") {
    return { type: "plan", plan: { steps: [] } }
  }
  return { type: "text", text: "" }
}

function mapSnapshotLiveMessage(snapshot: any): LiveMessage | null {
  const rawLiveMessage = snapshot?.live_message
  const rawToolCalls = Array.isArray(snapshot?.active_tool_calls) ? snapshot.active_tool_calls : []
  const toolCallMap = new Map<string, ContentPart>()
  rawToolCalls.forEach((entry: any) => {
    const part = buildToolCallPart(entry)
    if (part?.tool_call?.id) {
      toolCallMap.set(part.tool_call.id, part)
    }
  })

  const parts: ContentPart[] = []
  const rawBlocks = Array.isArray(rawLiveMessage?.content) ? rawLiveMessage.content : []
  rawBlocks.forEach((block: any) => {
    const part = mapSnapshotContentBlock(block, toolCallMap)
    if (part) {
      parts.push(part)
    }
  })

  if (parts.length === 0 && toolCallMap.size > 0) {
    parts.push(...Array.from(toolCallMap.values()))
  }
  if (parts.length === 0) return null

  return {
    role: "assistant",
    content: parts,
    isStreaming: true,
    timestamp: parseTimestamp(rawLiveMessage?.started_at) || Date.now(),
  }
}

function mapSnapshotContentBlock(
  block: any,
  toolCallMap: Map<string, ContentPart>
): ContentPart | null {
  const kind = firstString(block?.kind)
  if (kind === "text") {
    return { type: "text", text: firstString(block?.text) }
  }
  if (kind === "thinking") {
    return { type: "thinking", thinking: firstString(block?.text) }
  }
  if (kind === "tool_call_ref") {
    const toolCallId = firstString(block?.tool_call_id, block?.toolCallId)
    return toolCallMap.get(toolCallId) || null
  }
  if (kind === "plan") {
    return {
      type: "plan",
      plan: normalizePlanEntries(block?.entries),
    }
  }
  return null
}

function buildToolCallPart(entry: any): ContentPart | null {
  const id = firstString(entry?.id)
  if (!id) return null
  return {
    type: "tool_call",
    tool_call: {
      id,
      name: firstString(entry?.label, entry?.name) || id,
      input: normalizeToolCallInput(entry?.input),
      status: mapToolCallStatus(entry?.status),
      output: stringifyToolCallOutput(entry?.output),
      error: extractToolCallError(entry?.output),
    },
  }
}

function deriveRuntimeStatus(snapshot: any, liveMessage: LiveMessage | null) {
  if (snapshot?.pending_permission) return "waiting_permission"
  const activeToolCalls = Array.isArray(snapshot?.active_tool_calls) ? snapshot.active_tool_calls : []
  if (activeToolCalls.some((entry: any) => mapToolCallStatus(entry?.status) === "running")) {
    return "running_tool"
  }
  if (liveMessage) return "thinking"

  const status = firstString(snapshot?.status)
  if (status === "error") return "error"
  if (status === "connecting") return "connecting"
  if (status === "connected") return "connected"
  if (status === "prompting") return "thinking"
  return "idle"
}

function normalizeToolCallInput(input: unknown) {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, any>
  }
  if (typeof input === "string" && input.trim()) {
    try {
      const parsed = JSON.parse(input)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, any>
      }
    } catch {
      return { value: input }
    }
  }
  return {}
}

function stringifyToolCallOutput(output: any) {
  if (!output || typeof output !== "object") return firstString(output) || undefined
  const kind = firstString(output.kind)
  if (kind === "text") {
    return firstString(output.content) || undefined
  }
  if (kind === "error") {
    return firstString(output.message) || undefined
  }
  if (kind === "json") {
    try {
      return JSON.stringify(output.value ?? {}, null, 2)
    } catch {
      return undefined
    }
  }
  return undefined
}

function extractToolCallError(output: any) {
  if (!output || typeof output !== "object") return undefined
  if (firstString(output.kind) !== "error") return undefined
  return firstString(output.message) || undefined
}

function mapToolCallStatus(status: unknown): "running" | "completed" | "error" {
  const normalized = firstString(status)
  if (normalized === "completed") return "completed"
  if (normalized === "failed" || normalized === "error") return "error"
  return "running"
}

function normalizePlanEntries(entries: unknown) {
  const steps = Array.isArray(entries)
    ? entries.map((entry) => ({
      description: firstString((entry as Record<string, unknown>)?.content) || "未命名步骤",
      completed: firstString((entry as Record<string, unknown>)?.status) === "completed",
    }))
    : []
  return {
    steps,
    status: steps.every((step) => step.completed) ? "approved" : "pending",
  } as ContentPart["plan"]
}

function parsePlanDelta(delta: string, previousSteps?: any[]) {
  try {
    const parsed = JSON.parse(delta)
    return normalizePlanEntries((parsed as Record<string, unknown>)?.entries ?? parsed)
  } catch {
    return {
      steps: Array.isArray(previousSteps) ? previousSteps : [],
      status: "pending",
    } as ContentPart["plan"]
  }
}

function parseTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }
  return ""
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }
  return null
}
