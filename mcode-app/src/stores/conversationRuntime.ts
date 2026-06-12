import { defineStore } from "pinia"
import { reactive, ref } from "vue"
import type {
  MessageTurn,
  LiveMessage,
  ConnectionInfo,
  ConversationConnectionInfo,
  EventEnvelope,
  SessionStats,
  ContentPart,
  PermissionRequest,
  PermissionOption,
  PendingQuestionState,
  ApiRetryEvent,
  RuntimeErrorEvent,
} from "@/types/acp"
import { acpApi } from "@/api/acp"
import { useAuthStore } from "./auth"
import { connectionSessionManager } from "@/services/conversation/connectionSessionManager"
import {
  attachConversationRealtime,
  bindConversationEventHandler,
  calibrateAfterTurnComplete,
  calibrateAfterReplayGap,
  detachConversationRealtime,
  unbindConversationEventHandler,
} from "@/services/conversation/conversationSyncService"
import { ensureConversationSchema } from "@/services/db/migrations"
import {
  getOlderTurns,
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
      sessions.value.set(conversationId, reactive({
        conversationId,
        localTurns: [],
        optimisticTurns: [],
        liveMessage: null,
        connectionId: null,
        instanceKey: "",
        status: "idle",
        inputErrorMessage: null,
        apiRetry: null,
        pendingPermission: null,
        pendingQuestion: null,
        lastAppliedSeq: null,
        externalTurnBackfillInFlight: false,
        externalTurnBackfillLastAttemptAt: 0,
        stats: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          turnCount: 0,
        },
      }) as RuntimeSession)
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
        id: `live-${conversationId}`,
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
    const turnId = `optimistic-${Date.now()}`
    const turn: MessageTurn = {
      id: turnId,
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
    return turnId
  }

  function removeOptimisticUserMessage(conversationId: number, turnId: string) {
    const session = getOrCreateSession(conversationId)
    const index = session.optimisticTurns.findIndex((turn) => turn.id === turnId)
    if (index >= 0) {
      session.optimisticTurns.splice(index, 1)
    }
  }

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
    if (
      session.liveMessage &&
      !session.liveMessage.isPlaceholderThinking &&
      session.liveMessage.content.length > 0
    ) {
      return
    }
    if (session.liveMessage?.isPlaceholderThinking) {
      session.status = "thinking"
      return
    }
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

  function syncManagedSendPermission(conversationId: number) {
    const session = sessions.value.get(conversationId)
    const managed = connectionSessionManager.getByConversationId(conversationId)
    if (!session || !managed) return

    const allowSend = !(
      managed.role === "viewer" &&
      isSharedInProgressStatus(session.status)
    )
    connectionSessionManager.setConversationSendAllowed(conversationId, allowSend)
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
    session.liveMessage = createLiveMessage(content, isStreaming)
  }

  /**
   * 追加流式内容
   */
  function appendLiveContent(conversationId: number, delta: string, contentType: string) {
    const session = getOrCreateSession(conversationId)
    if (!session.liveMessage) {
      session.liveMessage = createLiveMessage()
    }
    session.status = "thinking"

    const currentLiveMessage = session.liveMessage.isPlaceholderThinking
      ? clearPlaceholderLiveMessage(session) ?? createLiveMessage()
      : session.liveMessage
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

  function hydrateLiveSnapshot(conversationId: number, snapshot: any) {
    const session = getOrCreateSession(conversationId)
    if (!snapshot || typeof snapshot !== "object") return

    const normalizedLiveMessage = mapSnapshotLiveMessage(snapshot)
    if (normalizedLiveMessage) {
      session.liveMessage = normalizedLiveMessage
    }
    session.pendingPermission = normalizePendingPermission(snapshot?.pending_permission)
    session.pendingQuestion = normalizePendingQuestion(snapshot?.pending_question)
    session.status = deriveRuntimeStatus(snapshot, normalizedLiveMessage ?? session.liveMessage)
    session.inputErrorMessage = deriveRuntimeError(snapshot)
    session.apiRetry = null
    session.lastAppliedSeq = firstNumber(snapshot?.event_seq, snapshot?.eventSeq) ?? session.lastAppliedSeq

    const usage = snapshot.usage
    if (usage && typeof usage === "object") {
      session.stats.totalTokens = firstNumber(usage.used) || session.stats.totalTokens
    }
    maybeBackfillExternalUserTurn(session, "snapshot")
  }

  /**
   * 完成当前轮次
   */
  async function completeTurn(conversationId: number, eventData?: any) {
    const session = getOrCreateSession(conversationId)
    session.externalTurnBackfillInFlight = false
    session.externalTurnBackfillLastAttemptAt = 0
    const hadOptimisticTurns = session.optimisticTurns.length > 0
    const completedTurns = session.optimisticTurns.map(cloneMessageTurn)
    const assistantTurn = session.liveMessage
      && !session.liveMessage.isPlaceholderThinking
      && session.liveMessage.content.length > 0
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
        if (!hadOptimisticTurns && assistantTurn) {
          try {
            await calibrateAfterReplayGap(conversationId)
          } catch (error) {
            console.warn("turn_complete external-user backfill skipped", error)
          }
        }
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
      session.pendingPermission = null
      session.pendingQuestion = null
      try {
        await calibrateAfterReplayGap(conversationId)
        session.localTurns = await reloadLocalTurns(session)
      } catch (error) {
        console.warn("turn_complete remote backfill skipped", error)
      }
    }

    try {
      await calibrateAfterTurnComplete(conversationId)
    } catch (error) {
      console.warn("turn_complete summary calibrate skipped", error)
    }

    session.status = "idle"
    session.pendingPermission = null
    session.pendingQuestion = null
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
    if (typeof event.seq === "number" && Number.isFinite(event.seq)) {
      session.lastAppliedSeq = Math.max(session.lastAppliedSeq || 0, event.seq)
    }

    switch (event.type) {
      case "stream_batch":
        session.inputErrorMessage = null
        session.apiRetry = null
        session.pendingPermission = null
        session.pendingQuestion = null
        appendLiveContent(
          session.conversationId,
          event.data.delta,
          event.data.contentType
        )
        maybeBackfillExternalUserTurn(session, "stream_batch")
        break

      case "tool_call": {
        session.status = "running_tool"
        session.inputErrorMessage = null
        session.apiRetry = null
        session.pendingPermission = null
        session.pendingQuestion = null
        const currentLiveMessage = session.liveMessage?.isPlaceholderThinking
          ? clearPlaceholderLiveMessage(session) ?? createLiveMessage()
          : session.liveMessage ?? createLiveMessage()
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
        maybeBackfillExternalUserTurn(session, "tool_call")
        break
      }

      case "tool_call_update": {
        session.pendingPermission = null
        if (event.data.status === "completed" || event.data.status === "error") {
          session.pendingQuestion = null
        }
        if (event.data.status === "error") {
          session.status = "error"
        } else {
          session.status = "running_tool"
        }
        if (!session.liveMessage) break

        const nextContent = session.liveMessage.content.map((part) => {
          if (part.type !== "tool_call" || part.tool_call?.id !== event.data.id) {
            return part
          }
          const currentToolCall = part.tool_call
          if (!currentToolCall) return part
          return {
            ...part,
            tool_call: {
              ...currentToolCall,
              output: event.data.output,
              status: event.data.status,
              error: event.data.error,
            },
          }
        })
        session.liveMessage = {
          ...session.liveMessage,
          content: nextContent,
        }
        maybeBackfillExternalUserTurn(session, "tool_call_update")
        break
      }

      case "status_changed":
        if (event.data.scope === "conversation") {
          if (event.data.status === "error") {
            session.status = "error"
            session.inputErrorMessage =
              firstString(event.data.message) || session.inputErrorMessage || "会话运行失败"
          } else if (event.data.status === "idle" && !session.liveMessage && !session.pendingPermission && !session.pendingQuestion) {
            session.status = session.connectionId ? "connected" : "idle"
            session.inputErrorMessage = null
            session.apiRetry = null
          }
          syncManagedSendPermission(session.conversationId)
          break
        }
        const previousStatus = session.status
        session.status = event.data.status
        if (event.data.status === "error") {
          session.inputErrorMessage =
            firstString(event.data.message) || session.inputErrorMessage || "连接异常"
        } else {
          const preserveTerminalError =
            event.data.status === "idle"
            && previousStatus === "error"
            && Boolean(firstString(session.inputErrorMessage))
          if (!preserveTerminalError) {
            session.inputErrorMessage = null
          }
          session.apiRetry = null
        }
        if (event.data.status !== "waiting_permission") {
          session.pendingPermission = null
        }
        if (event.data.status !== "waiting_question") {
          session.pendingQuestion = null
        }
        maybeBackfillExternalUserTurn(session, "status_changed")
        syncManagedSendPermission(session.conversationId)
        break

      case "permission_request":
        session.status = "waiting_permission"
        session.inputErrorMessage = null
        session.pendingPermission = normalizePermissionRequest(event.data)
        session.pendingQuestion = null
        maybeBackfillExternalUserTurn(session, "permission_request")
        syncManagedSendPermission(session.conversationId)
        break

      case "question_request":
        session.status = "waiting_question"
        session.inputErrorMessage = null
        session.pendingPermission = null
        session.pendingQuestion = normalizeQuestionRequest(event.data)
        maybeBackfillExternalUserTurn(session, "question_request")
        syncManagedSendPermission(session.conversationId)
        break

      case "api_retry":
        session.apiRetry = normalizeApiRetryEvent(event.data)
        session.inputErrorMessage = null
        break

      case "error":
        session.status = "error"
        session.apiRetry = null
        session.inputErrorMessage =
          normalizeRuntimeErrorEvent(event.data)?.message || "请求失败"
        break

      case "permission_resolved":
        clearPendingPermission(session.conversationId, firstString(event.data?.requestId))
        syncManagedSendPermission(session.conversationId)
        break

      case "question_resolved":
        clearPendingQuestion(session.conversationId, firstString(event.data?.questionId))
        syncManagedSendPermission(session.conversationId)
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
    sessionId?: string,
    sinceSeq?: number,
    instanceKey?: string
  ) {
    const session = getOrCreateSession(conversationId)
    session.status = "connecting"
    connectionSessionManager.touchConversation(conversationId)

    try {
      let managed = connectionSessionManager.getByConversationId(conversationId)
      const targetInstanceKey =
        instanceKey ||
        managed?.instanceKey ||
        auth.currentRemoteInstance().instanceKey
      let discovered: ConversationConnectionInfo | null = null
      try {
        discovered = await acpApi.acpFindConnectionForConversation(conversationId)
      } catch (error) {
        console.warn("acp_find_connection_for_conversation failed", error)
      }

      const discoveredConnectionId = firstString(
        discovered?.connection_id,
        discovered?.connectionId
      )
      if (
        managed &&
        discoveredConnectionId &&
        discoveredConnectionId !== managed.connectionId
      ) {
        managed = connectionSessionManager.adoptConversation({
          conversationId,
          instanceKey: targetInstanceKey,
          connectionId: discoveredConnectionId,
          agentType:
            firstString(discovered?.agent_type, discovered?.agentType) ||
            managed.connection.agentType ||
            agentType,
          sessionId:
            firstString(discovered?.session_id, discovered?.sessionId) ||
            managed.externalId ||
            sessionId ||
            null,
          status: "connected",
          role: "viewer",
          sharedLive: true,
          detachOnly: true,
          allowSend: false,
        })
        const session = getOrCreateSession(conversationId)
        session.lastAppliedSeq = null
      }

      if (!managed && discoveredConnectionId) {
        managed = connectionSessionManager.adoptConversation({
          conversationId,
          instanceKey: targetInstanceKey,
          connectionId: discoveredConnectionId,
          agentType,
          sessionId: sessionId || null,
          status: "connected",
          role: "viewer",
          sharedLive: true,
          detachOnly: true,
          allowSend: false,
        })
      }

      if (!managed) {
        let snapshot: any = null
        try {
          snapshot = await acpApi.acpGetSessionSnapshotByConversation(conversationId)
        } catch {}
        const snapshotConnectionId = firstString(snapshot?.connection_id, snapshot?.connectionId)
        if (snapshotConnectionId) {
          managed = connectionSessionManager.adoptConversation({
            conversationId,
            instanceKey: targetInstanceKey,
            connectionId: snapshotConnectionId,
            agentType,
            sessionId: firstString(snapshot?.external_id, snapshot?.externalId) || null,
            status: normalizeConnectionInfoStatus(snapshot?.status),
            role: "viewer",
            sharedLive: true,
            detachOnly: true,
            allowSend: false,
          })
        }
      }

      if (!managed) {
        managed = await connectionSessionManager.connectConversation({
          conversationId,
          agentType,
          workingDir,
          sessionId,
          instanceKey: targetInstanceKey,
        })
      }

    session.connectionId = managed.connectionId
    session.instanceKey = managed.instanceKey
      connections.value.set(managed.connectionId, managed.connection)
      session.status = "connected"
      session.inputErrorMessage = null
      session.apiRetry = null
      syncManagedSendPermission(conversationId)

      bindConversationEventHandler(conversationId, handleEvent)
      await attachConversationRealtime({
        conversationId,
        instanceKey: managed.instanceKey,
        connectionId: managed.connectionId,
        sinceSeq,
      })

      return managed.connection
    } catch (error) {
      session.status = "error"
      session.inputErrorMessage = error instanceof Error && error.message.trim()
        ? error.message.trim()
        : "连接失败"
      session.apiRetry = null
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
      session.inputErrorMessage = null
      session.apiRetry = null
      session.pendingPermission = null
      session.pendingQuestion = null
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

  function clearCachedSessionState() {
    for (const session of sessions.value.values()) {
      if (isSharedInProgressStatus(session.status) || session.liveMessage || session.optimisticTurns.length > 0) {
        continue
      }
      session.localTurns = []
      session.optimisticTurns = []
      session.liveMessage = null
      session.inputErrorMessage = null
      session.apiRetry = null
      session.pendingPermission = null
      session.pendingQuestion = null
      session.lastAppliedSeq = null
      session.externalTurnBackfillInFlight = false
      session.externalTurnBackfillLastAttemptAt = 0
      session.status = session.connectionId ? "connected" : "idle"
    }
  }

  function clearPendingPermission(conversationId: number, requestId?: string | null) {
    const session = sessions.value.get(conversationId)
    if (!session?.pendingPermission) return
    if (requestId && session.pendingPermission.id !== requestId) return
    session.pendingPermission = null
    if (session.status === "waiting_permission") {
      session.status = session.liveMessage
        ? "thinking"
        : session.connectionId
          ? "connected"
          : "idle"
    }
  }

  function clearPendingQuestion(conversationId: number, questionId?: string | null) {
    const session = sessions.value.get(conversationId)
    if (!session?.pendingQuestion) return
    if (questionId && session.pendingQuestion.question_id !== questionId) return
    session.pendingQuestion = null
    if (session.status === "waiting_question") {
      session.status = session.liveMessage
        ? "thinking"
        : session.connectionId
          ? "connected"
          : "idle"
    }
  }

  function bindCreatedConversationRuntime(input: {
    conversationId: number
    folderId: number
    agentType: string
    connectionId: string
    instanceKey: string
    sessionId?: string
  }) {
    const managed = connectionSessionManager.adoptConversation({
      conversationId: input.conversationId,
      instanceKey: input.instanceKey,
      connectionId: input.connectionId,
      agentType: String(input.agentType || "").trim() || "claude_code",
      sessionId: input.sessionId || null,
      status: "connected",
      role: "owner",
      sharedLive: true,
      detachOnly: true,
      allowSend: true,
    })
    const session = getOrCreateSession(input.conversationId)
    session.connectionId = managed.connectionId
    session.instanceKey = managed.instanceKey
    session.status = "connected"
    session.inputErrorMessage = null
    session.apiRetry = null
    session.pendingPermission = null
    session.pendingQuestion = null
    session.lastAppliedSeq = 0
    connections.value.set(managed.connectionId, managed.connection)
    syncManagedSendPermission(input.conversationId)
  }

  function setSessionError(conversationId: number, message: string | null) {
    const session = getOrCreateSession(conversationId)
    const normalized = firstString(message)
    session.inputErrorMessage = normalized || null
    session.apiRetry = null
    if (normalized) {
      if (session.status === "idle") {
        session.status = session.connectionId ? "connected" : "idle"
      }
    } else if (session.status === "error") {
      session.status = session.connectionId ? "connected" : "idle"
    }
  }

  function canSend(conversationId: number) {
    const managed = connectionSessionManager.getByConversationId(conversationId)
    if (!managed) return true
    return managed.allowSend
  }

  function getManagedConversation(conversationId: number) {
    return connectionSessionManager.getByConversationId(conversationId)
  }

  return {
    sessions,
    connections,
    getOrCreateSession,
    getMessages,
    addOptimisticUserMessage,
    removeOptimisticUserMessage,
    beginPlaceholderThinking,
    clearLiveMessage,
    setLiveMessage,
    appendLiveContent,
    completeTurn,
    handleEvent,
    hydrateLiveSnapshot,
    connect,
    disconnect,
    clearSession,
    clearCachedSessionState,
    clearPendingPermission,
    clearPendingQuestion,
    bindCreatedConversationRuntime,
    setSessionError,
    canSend,
    getManagedConversation,
  }
})

interface RuntimeSession {
  conversationId: number
  localTurns: MessageTurn[]
  optimisticTurns: MessageTurn[]
  liveMessage: LiveMessage | null
  connectionId: string | null
  instanceKey: string
  status: "idle" | "connecting" | "connected" | "thinking" | "running_tool" | "waiting_permission" | "waiting_question" | "error"
  inputErrorMessage: string | null
  apiRetry: ApiRetryEvent | null
  pendingPermission: PermissionRequest | null
  pendingQuestion: PendingQuestionState | null
  lastAppliedSeq: number | null
  externalTurnBackfillInFlight: boolean
  externalTurnBackfillLastAttemptAt: number
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

function isSharedInProgressStatus(status: RuntimeSession["status"]) {
  return (
    status === "thinking" ||
    status === "running_tool" ||
    status === "waiting_permission" ||
    status === "waiting_question"
  )
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
  const turns = await getNewestTurnsWithUserCoverage(session.conversationId, limit)
  return turns.slice().reverse().map(mapPersistedTurnToMessage)
}

const INITIAL_USER_TURN_TARGET = 3
const INITIAL_TURN_EXPAND_BATCH = 12
const INITIAL_TURN_MAX_BATCH = 48

async function getNewestTurnsWithUserCoverage(
  conversationId: number,
  limit: number
) {
  let turns = await getNewestTurns(conversationId, limit)
  if (turns.length === 0) return turns

  const userTurnCount = (items: PersistedTurnWithParts[]) =>
    items.filter((item) => String(item.role || "") === "user").length

  let oldestCursor = getOldestCursorFromPersistedTurns(turns)
  while (
    oldestCursor != null &&
    turns.length < INITIAL_TURN_MAX_BATCH &&
    userTurnCount(turns) < INITIAL_USER_TURN_TARGET
  ) {
    const remaining = INITIAL_TURN_MAX_BATCH - turns.length
    const batchSize = Math.min(INITIAL_TURN_EXPAND_BATCH, remaining)
    const older = await getOlderTurns(conversationId, oldestCursor, batchSize)
    if (older.length === 0) break
    turns = [...turns, ...older]
    oldestCursor = getOldestCursorFromPersistedTurns(turns)
  }

  return turns
}

function getOldestCursorFromPersistedTurns(turns: PersistedTurnWithParts[]) {
  const oldest = turns[turns.length - 1]
  if (!oldest) return null
  return {
    sortKey: oldest.sortKey,
    id: oldest.id,
  }
}

function maybeBackfillExternalUserTurn(
  session: RuntimeSession,
  reason: "snapshot" | "status_changed" | "stream_batch" | "tool_call" | "tool_call_update" | "permission_request" | "question_request"
) {
  if (session.optimisticTurns.length > 0) return

  const hasInFlightRemoteTurn =
    session.liveMessage != null ||
    session.pendingPermission != null ||
    session.pendingQuestion != null ||
    session.status === "thinking" ||
    session.status === "running_tool" ||
    session.status === "waiting_permission" ||
    session.status === "waiting_question"
  if (!hasInFlightRemoteTurn) return

  const now = Date.now()
  if (session.externalTurnBackfillInFlight) return
  if (now - session.externalTurnBackfillLastAttemptAt < 1500) return

  session.externalTurnBackfillInFlight = true
  session.externalTurnBackfillLastAttemptAt = now
  void (async () => {
    try {
      await calibrateAfterReplayGap(session.conversationId)
      session.localTurns = await reloadLocalTurns(session)
    } catch (error) {
      console.warn(`external-user backfill skipped (${reason})`, error)
    } finally {
      session.externalTurnBackfillInFlight = false
    }
  })()
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

function cloneContentPart(part: ContentPart): ContentPart {
  return JSON.parse(JSON.stringify(part)) as ContentPart
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
    isPlaceholderThinking: false,
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
  if (snapshot?.pending_question) return "waiting_question"
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

function deriveRuntimeError(snapshot: any): string | null {
  const status = firstString(snapshot?.status)
  if (status === "error") {
    return (
      firstString(snapshot?.error, snapshot?.message, snapshot?.detail) ||
      "会话运行失败"
    )
  }
  return null
}

function normalizeApiRetryEvent(raw: any): ApiRetryEvent | null {
  if (!raw || typeof raw !== "object") return null
  return {
    sessionId: firstString(raw.sessionId, raw.session_id) || undefined,
    attempt: firstNumber(raw.attempt),
    maxRetries: firstNumber(raw.maxRetries, raw.max_retries),
    error: firstString(raw.error) || undefined,
    errorStatus: firstNumber(raw.errorStatus, raw.error_status),
    retryDelayMs: firstNumber(raw.retryDelayMs, raw.retry_delay_ms),
  }
}

function normalizeRuntimeErrorEvent(raw: any): RuntimeErrorEvent | null {
  if (!raw || typeof raw !== "object") return null
  const message = firstString(raw.message, raw.detail, raw.error)
  if (!message) return null
  return {
    message,
    code: firstString(raw.code) || undefined,
    agentType: firstString(raw.agentType, raw.agent_type) || undefined,
  }
}

function normalizePendingQuestion(raw: any): PendingQuestionState | null {
  if (!raw || typeof raw !== "object") return null
  const questionId = firstString(raw.question_id, raw.questionId, raw.id)
  const questions = normalizeQuestionSpecs(raw.questions)
  if (!questionId || questions.length === 0) return null
  return {
    question_id: questionId,
    questions,
    created_at:
      firstString(raw.created_at, raw.createdAt) ||
      new Date().toISOString(),
  }
}

function normalizeQuestionRequest(raw: any): PendingQuestionState | null {
  if (!raw || typeof raw !== "object") return null
  const questionId = firstString(raw.questionId, raw.question_id, raw.id)
  const questions = normalizeQuestionSpecs(raw.questions)
  if (!questionId || questions.length === 0) return null
  return {
    question_id: questionId,
    questions,
    created_at:
      firstString(raw.createdAt, raw.created_at) ||
      new Date().toISOString(),
  }
}

function normalizeQuestionSpecs(rawQuestions: unknown): PendingQuestionState["questions"] {
  if (!Array.isArray(rawQuestions)) return []
  const normalized: PendingQuestionState["questions"] = []
  rawQuestions.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") return
    const record = raw as Record<string, unknown>
    const question = firstString(record.question)
    const options = normalizeQuestionOptions(record.options)
    if (!question || options.length < 2) return
    normalized.push({
      id:
        firstString(record.id, record.question_id, record.questionId) ||
        `q-${index}`,
      question,
      header: firstString(record.header) || `问题${index + 1}`,
      multi_select: record.multi_select === true || record.multiSelect === true,
      options,
    })
  })
  return normalized
}

function normalizeQuestionOptions(rawOptions: unknown): PendingQuestionState["questions"][number]["options"] {
  if (!Array.isArray(rawOptions)) return []
  const normalized: PendingQuestionState["questions"][number]["options"] = []
  rawOptions.forEach((raw) => {
    if (!raw || typeof raw !== "object") return
    const record = raw as Record<string, unknown>
    const label = firstString(record.label)
    if (!label) return
    normalized.push({
      label,
      description: firstString(record.description),
    })
  })
  return normalized
}

function normalizePendingPermission(raw: any): PermissionRequest | null {
  if (!raw || typeof raw !== "object") return null
  const requestId = firstString(raw.request_id, raw.requestId, raw.id)
  if (!requestId) return null

  const toolCall = raw.tool_call && typeof raw.tool_call === "object" ? raw.tool_call : raw.details
  return {
    id: requestId,
    type: normalizePermissionType(raw.kind, toolCall),
    description:
      describePermission(toolCall) ||
      firstString(raw.description, raw.title) ||
      "智能体请求继续当前操作",
    details: toolCall || raw,
    options: normalizePermissionOptions(raw.options),
  }
}

function normalizePermissionRequest(raw: any): PermissionRequest | null {
  if (!raw || typeof raw !== "object") return null
  const requestId = firstString(raw.id, raw.request_id, raw.requestId)
  if (!requestId) return null

  return {
    id: requestId,
    type: normalizePermissionType(raw.type, raw.details),
    description:
      firstString(raw.description) ||
      describePermission(raw.details) ||
      "智能体请求继续当前操作",
    details: raw.details,
    options: normalizePermissionOptions(raw.options),
  }
}

function normalizePermissionOptions(rawOptions: unknown): PermissionOption[] {
  if (!Array.isArray(rawOptions)) return []
  const normalized: PermissionOption[] = []
  for (const option of rawOptions) {
    if (!option || typeof option !== "object") continue
    const id = firstString((option as any).id, (option as any).option_id, (option as any).optionId)
    if (!id) continue
    normalized.push({
      id,
      label:
        firstString((option as any).label, (option as any).name, (option as any).kind) ||
        "确认",
      description: firstString((option as any).description, (option as any).kind) || undefined,
    })
  }
  return normalized
}

function normalizePermissionType(...values: unknown[]): PermissionRequest["type"] {
  const normalized = values.map((value) => {
    if (typeof value === "string") return value
    if (value && typeof value === "object") {
      return firstString((value as any).kind, (value as any).type, (value as any).name) || ""
    }
    return ""
  })
  const raw = firstString(...normalized)?.toLowerCase()
  if (raw === "file_change" || raw === "filechange" || raw === "edit") return "file_change"
  if (raw === "network") return "network"
  if (raw === "plan") return "plan"
  return "command"
}

function describePermission(toolCall: unknown) {
  if (!toolCall || typeof toolCall !== "object") return ""
  const record = toolCall as Record<string, unknown>
  return (
    firstString(record.title, record.name, record.kind, record.description) ||
    firstString(record.tool_call_id, record.toolCallId)
  )
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

function normalizeConnectionInfoStatus(value: unknown): ConnectionInfo["status"] {
  const status = firstString(value)
  if (status === "connecting") return "connecting"
  if (status === "error") return "error"
  if (status === "disconnected") return "disconnected"
  if (status === "prompting") return "prompting"
  return "connected"
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
