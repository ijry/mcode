import { defineStore } from "pinia"
import { reactive, ref } from "vue"
import type {
  MessageTurn,
  LiveMessage,
  ConnectionInfo,
  ConversationConnectionInfo,
  ConversationDetail,
  EventEnvelope,
  SessionStats,
  ContentPart,
  PermissionRequest,
  PermissionOption,
  PendingQuestionState,
  ApiRetryEvent,
  RuntimeErrorEvent,
  TurnQueueEvent,
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
import {
  isHotConversation,
  releaseHotConversation,
  touchHotConversation,
} from "@/services/conversation/hotConversationCoordinator"
import { ensureConversationSchema } from "@/services/db/migrations"
import {
  getOlderTurns,
  getNewestTurns,
  insertCompletedTurn,
  type PersistedTurnPartRow,
  type PersistedTurnWithParts,
} from "@/services/db/repositories/conversationRepository"
import { buildPersistedTurnRecord } from "@/services/conversation/conversationDetailPersistence"
import { getRelayClientId } from "@/services/gateway/relayClientIdentity"
import {
  buildConversationTimeline,
  buildLiveMessageTurnId,
  dedupeTurnsByRoleAndId,
  type ConversationTimelineTurn,
} from "./conversationTimeline"

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
        sharedPromptQueue: createSharedPromptQueueState(),
        inFlightUserTurnId: null,
        lastAppliedSeq: null,
        lastCompletedTurnKey: null,
        lastCompletedTurnAt: 0,
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
    return getTimelineTurns(conversationId).map((entry) => entry.turn)
  }

  function getTimelineTurns(conversationId: number): ConversationTimelineTurn[] {
    const session = getOrCreateSession(conversationId)
    return buildConversationTimeline({
      conversationId,
      localTurns: session.localTurns,
      optimisticTurns: session.optimisticTurns,
      liveMessage: session.liveMessage,
      inFlightUserTurnId: session.inFlightUserTurnId,
    })
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

  function createLiveMessage(content: ContentPart[] = [], isStreaming = true, id?: string): LiveMessage {
    return {
      id: resolveLiveMessageId(id),
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
    session.inFlightUserTurnId = null
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
    isStreaming: boolean,
    options?: {
      id?: string
      timestamp?: number
    }
  ) {
    const session = getOrCreateSession(conversationId)
    const liveMessage = createLiveMessage(
      content,
      isStreaming,
      firstString(options?.id, session.liveMessage?.id) || undefined
    )
    liveMessage.timestamp = options?.timestamp ?? liveMessage.timestamp
    session.liveMessage = liveMessage
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
    touchHotConversation(conversationId)

    const snapshotSeq = firstNumber(snapshot?.event_seq, snapshot?.eventSeq)
    const currentSeq = session.lastAppliedSeq
    const shouldIgnoreOlderSnapshot =
      typeof snapshotSeq === "number" &&
      Number.isFinite(snapshotSeq) &&
      typeof currentSeq === "number" &&
      Number.isFinite(currentSeq) &&
      snapshotSeq < currentSeq

    if (shouldIgnoreOlderSnapshot) {
      session.pendingPermission = normalizePendingPermission(snapshot?.pending_permission)
      session.pendingQuestion = normalizePendingQuestion(snapshot?.pending_question)
      session.status = deriveRuntimeStatus(snapshot, session.liveMessage)
      session.inputErrorMessage = deriveRuntimeError(snapshot)
      session.apiRetry = null
      maybeBackfillExternalUserTurn(session, "snapshot")
      return
    }

    applySnapshotInFlightUserTurnId(session, snapshot)
    const normalizedLiveMessage = mapSnapshotLiveMessage(snapshot, session.liveMessage)
    const shouldIgnoreSnapshotLiveMessage =
      normalizedLiveMessage != null &&
      isStaleSnapshotLiveReplay(session, normalizedLiveMessage)
    if (normalizedLiveMessage && !shouldIgnoreSnapshotLiveMessage) {
      session.liveMessage = normalizedLiveMessage
    }
    session.pendingPermission = normalizePendingPermission(snapshot?.pending_permission)
    session.pendingQuestion = normalizePendingQuestion(snapshot?.pending_question)
    session.status = deriveRuntimeStatus(
      snapshot,
      shouldIgnoreSnapshotLiveMessage
        ? session.liveMessage
        : normalizedLiveMessage ?? session.liveMessage
    )
    session.inputErrorMessage = deriveRuntimeError(snapshot)
    session.apiRetry = null
    session.lastAppliedSeq = snapshotSeq ?? session.lastAppliedSeq

    const usage = snapshot.usage
    if (usage && typeof usage === "object") {
      session.stats.totalTokens = firstNumber(usage.used) || session.stats.totalTokens
    }
    maybeBackfillExternalUserTurn(session, "snapshot")
  }

  function applyConversationDetailStats(conversationId: number, detail: ConversationDetail | any) {
    const session = getOrCreateSession(conversationId)
    return applyConversationDetailStatsToSession(session, detail)
  }

  /**
   * 完成当前轮次
   */
  async function completeTurn(conversationId: number, eventData?: any) {
    const session = getOrCreateSession(conversationId)
    const completeTurnKey = buildCompleteTurnKey(session, eventData)
    if (shouldIgnoreDuplicateCompleteTurn(session, completeTurnKey)) {
      console.warn("[conversation-runtime] duplicate completeTurn ignored", {
        conversationId,
        completeTurnKey,
      })
      return
    }
    markCompleteTurnHandled(session, completeTurnKey)
    session.externalTurnBackfillInFlight = false
    session.externalTurnBackfillLastAttemptAt = 0
    const hadOptimisticTurns = session.optimisticTurns.length > 0
    const completedTurns = session.optimisticTurns.map(cloneMessageTurn)
    const completionLiveMessage = resolveCompletionLiveMessage(session, eventData)
    const assistantTurn = completionLiveMessage
      && !completionLiveMessage.isPlaceholderThinking
      && completionLiveMessage.content.length > 0
      ? buildAssistantTurn(session, completionLiveMessage, eventData)
      : null

    if (assistantTurn) {
      completedTurns.push(cloneMessageTurn(assistantTurn))
    }

    if (completedTurns.length > 0) {
      const persisted = await persistCompletedTurns(session, completedTurns)
      if (persisted) {
        session.localTurns = await reloadLocalTurns(session)
        session.optimisticTurns = []
        session.liveMessage = null
        session.inFlightUserTurnId = null
        if (!hadOptimisticTurns && assistantTurn) {
          try {
            const replayDetail = await calibrateAfterReplayGap(conversationId)
            applyConversationDetailStats(conversationId, replayDetail)
            session.localTurns = await reloadLocalTurns(session)
          } catch (error) {
            console.warn("turn_complete external-user backfill skipped", error)
          }
        }
      } else {
        session.localTurns = dedupeTurnsByRoleAndId([
          ...session.localTurns,
          ...completedTurns,
        ])
        session.optimisticTurns = []
        session.liveMessage = null
        session.inFlightUserTurnId = null
      }
    } else {
      session.liveMessage = null
      session.inFlightUserTurnId = null
      session.pendingPermission = null
      session.pendingQuestion = null
      try {
        const replayDetail = await calibrateAfterReplayGap(conversationId)
        applyConversationDetailStats(conversationId, replayDetail)
        session.localTurns = await reloadLocalTurns(session)
      } catch (error) {
        console.warn("turn_complete remote backfill skipped", error)
      }
    }

    try {
      const calibratedDetail = await calibrateAfterTurnComplete(conversationId)
      applyConversationDetailStats(conversationId, calibratedDetail)
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
    const eventSeq = firstNumber(event.seq)
    if (eventSeq != null) {
      const currentSeq = session.lastAppliedSeq
      if (
        typeof currentSeq === "number" &&
        Number.isFinite(currentSeq) &&
        eventSeq <= currentSeq
      ) {
        return
      }
      session.lastAppliedSeq = eventSeq
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
        if (
          event.data.status === "idle" &&
          !session.liveMessage &&
          session.optimisticTurns.length === 0
        ) {
          releaseHotConversation(session.conversationId)
        } else {
          touchHotConversation(session.conversationId)
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
        touchHotConversation(session.conversationId)
        session.status = "waiting_permission"
        session.inputErrorMessage = null
        session.pendingPermission = normalizePermissionRequest(event.data)
        session.pendingQuestion = null
        maybeBackfillExternalUserTurn(session, "permission_request")
        syncManagedSendPermission(session.conversationId)
        break

      case "question_request":
        touchHotConversation(session.conversationId)
        session.status = "waiting_question"
        session.inputErrorMessage = null
        session.pendingPermission = null
        session.pendingQuestion = normalizeQuestionRequest(event.data)
        maybeBackfillExternalUserTurn(session, "question_request")
        syncManagedSendPermission(session.conversationId)
        break

      case "api_retry":
        touchHotConversation(session.conversationId)
        session.apiRetry = normalizeApiRetryEvent(event.data)
        session.inputErrorMessage = null
        break

      case "error":
        touchHotConversation(session.conversationId)
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

      case "turn_cancel_requested": {
        touchHotConversation(session.conversationId)
        const requester = firstString(event.data?.cancelRequestedByClientId)
        session.inputErrorMessage =
          requester && requester === getRelayClientId()
            ? "正在取消当前任务..."
            : "其他设备正在取消当前任务。"
        syncManagedSendPermission(session.conversationId)
        break
      }

      case "turn_cancelled":
        session.liveMessage = null
        session.pendingPermission = null
        session.pendingQuestion = null
        session.status = session.connectionId ? "connected" : "idle"
        session.inputErrorMessage = null
        session.apiRetry = null
        releaseHotConversation(session.conversationId)
        syncManagedSendPermission(session.conversationId)
        break

      case "turn_cancel_failed":
        touchHotConversation(session.conversationId)
        session.status = "error"
        session.inputErrorMessage = "取消当前任务失败，请刷新后重试。"
        syncManagedSendPermission(session.conversationId)
        break

      case "turn_queued":
      case "turn_queue_updated":
      case "turn_dequeued":
      case "turn_started":
      case "turn_queue_cancelled":
      case "turn_queue_failed":
        handleTurnQueueEvent(session, event.type, event.data)
        syncManagedSendPermission(session.conversationId)
        break

      case "turn_complete":
        touchHotConversation(session.conversationId)
        void completeTurn(session.conversationId, {
          ...(event.data && typeof event.data === "object" ? event.data : {}),
          __eventSeq: event.seq,
        })
        break

      case "usage_update":
        // ACP usage_update carries live context-window usage, not split token
        // accounting. Parsed conversation detail supplies input/output totals.
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
    touchHotConversation(conversationId)
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
        session.lastCompletedTurnKey = null
        session.lastCompletedTurnAt = 0
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
    releaseHotConversation(conversationId)
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
      session.sharedPromptQueue = createSharedPromptQueueState()
      session.inFlightUserTurnId = null
      session.lastCompletedTurnKey = null
      session.lastCompletedTurnAt = 0
    }
  }

  /**
   * 清理会话
   */
  function clearSession(conversationId: number) {
    releaseHotConversation(conversationId)
    detachConversationRealtime(conversationId)
    unbindConversationEventHandler(conversationId)
    connectionSessionManager.clearConversation(conversationId)
    sessions.value.delete(conversationId)
  }

  function clearCachedSessionState() {
    for (const session of sessions.value.values()) {
      if (
        isSharedInProgressStatus(session.status) ||
        session.liveMessage ||
        session.optimisticTurns.length > 0 ||
        isHotConversation(session.conversationId)
      ) {
        continue
      }
      session.localTurns = []
      session.optimisticTurns = []
      session.liveMessage = null
      session.inputErrorMessage = null
      session.apiRetry = null
      session.pendingPermission = null
      session.pendingQuestion = null
      session.sharedPromptQueue = createSharedPromptQueueState()
      session.inFlightUserTurnId = null
      session.lastAppliedSeq = null
      session.lastCompletedTurnKey = null
      session.lastCompletedTurnAt = 0
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
    touchHotConversation(input.conversationId)
    session.connectionId = managed.connectionId
    session.instanceKey = managed.instanceKey
    session.status = "connected"
    session.inputErrorMessage = null
    session.apiRetry = null
    session.pendingPermission = null
    session.pendingQuestion = null
    session.sharedPromptQueue = createSharedPromptQueueState()
    session.inFlightUserTurnId = null
    session.lastAppliedSeq = 0
    session.lastCompletedTurnKey = null
    session.lastCompletedTurnAt = 0
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
    getTimelineTurns,
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
    applyConversationDetailStats,
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
  sharedPromptQueue: SharedPromptQueueState
  inFlightUserTurnId: string | null
  lastAppliedSeq: number | null
  lastCompletedTurnKey: string | null
  lastCompletedTurnAt: number
  externalTurnBackfillInFlight: boolean
  externalTurnBackfillLastAttemptAt: number
  stats: SessionStats
}

interface SharedPromptQueueState {
  count: number
  items: SharedPromptQueueItem[]
  lastMessage: string | null
}

interface SharedPromptQueueItem {
  queueItemId: string
  sessionId: string | null
  queuePosition: number | null
  sourceClientId: string | null
  sourceDeviceName: string | null
  promptPreview: string | null
  createdAtMs: number | null
  runtime: string | null
  agentType: string | null
}

function createSharedPromptQueueState(): SharedPromptQueueState {
  return {
    count: 0,
    items: [],
    lastMessage: null,
  }
}

function handleTurnQueueEvent(
  session: RuntimeSession,
  eventType: EventEnvelope["type"],
  raw: unknown
) {
  const data = normalizeTurnQueueRuntimeEvent(raw)
  if (!data) return
  touchHotConversation(session.conversationId)

  switch (eventType) {
    case "turn_queued":
      upsertSharedPromptQueueItem(session.sharedPromptQueue, data, true)
      applySharedPromptQueueCount(session.sharedPromptQueue, data)
      session.sharedPromptQueue.lastMessage =
        data.sourceClientId && data.sourceClientId === getRelayClientId()
          ? "任务已加入队列。"
          : "其他设备提交的任务已加入队列。"
      session.inputErrorMessage = session.sharedPromptQueue.lastMessage
      break
    case "turn_queue_updated":
      upsertSharedPromptQueueItem(session.sharedPromptQueue, data, false)
      applySharedPromptQueueCount(session.sharedPromptQueue, data)
      break
    case "turn_dequeued":
      removeSharedPromptQueueItem(session.sharedPromptQueue, data.queueItemId)
      applySharedPromptQueueCount(session.sharedPromptQueue, data)
      session.sharedPromptQueue.lastMessage = "队列任务已开始执行。"
      break
    case "turn_started":
      removeSharedPromptQueueItem(session.sharedPromptQueue, data.queueItemId)
      applySharedPromptQueueCount(session.sharedPromptQueue, data)
      session.status = "thinking"
      session.inputErrorMessage = null
      session.apiRetry = null
      break
    case "turn_queue_cancelled":
      removeSharedPromptQueueItem(session.sharedPromptQueue, data.queueItemId)
      applySharedPromptQueueCount(session.sharedPromptQueue, data)
      session.sharedPromptQueue.lastMessage = "队列任务已取消。"
      session.inputErrorMessage = null
      break
    case "turn_queue_failed":
      removeSharedPromptQueueItem(session.sharedPromptQueue, data.queueItemId)
      applySharedPromptQueueCount(session.sharedPromptQueue, data)
      session.status = "error"
      session.inputErrorMessage =
        firstString(data.message) || "队列任务启动失败，请重试。"
      session.sharedPromptQueue.lastMessage = session.inputErrorMessage
      break
  }
}

function normalizeTurnQueueRuntimeEvent(raw: unknown): TurnQueueEvent | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  return {
    sessionId: firstString(record.sessionId, record.session_id) || null,
    queueItemId: firstString(record.queueItemId, record.queue_item_id) || null,
    queuePosition:
      firstNumber(record.queuePosition, record.queue_position) ?? null,
    queueLength:
      firstNumber(record.queueLength, record.queue_length) ?? null,
    sourceClientId:
      firstString(record.sourceClientId, record.source_client_id) || null,
    sourceDeviceName:
      firstString(record.sourceDeviceName, record.source_device_name) || null,
    promptPreview:
      firstString(record.promptPreview, record.prompt_preview) || null,
    createdAtMs:
      firstNumber(record.createdAtMs, record.created_at_ms) ?? null,
    activeTurnId:
      firstString(record.activeTurnId, record.active_turn_id) || null,
    message: firstString(record.message, record.error) || null,
    runtime: firstString(record.runtime) || null,
    agentType: firstString(record.agentType, record.agent_type) || null,
  }
}

function upsertSharedPromptQueueItem(
  queue: SharedPromptQueueState,
  data: TurnQueueEvent,
  allowInsert: boolean
) {
  const queueItemId = firstString(data.queueItemId)
  if (!queueItemId) return
  const item = mapTurnQueueEventToItem(data, queueItemId)
  const existingIndex = queue.items.findIndex((entry) => entry.queueItemId === queueItemId)
  if (existingIndex >= 0) {
    queue.items.splice(existingIndex, 1, {
      ...queue.items[existingIndex],
      ...item,
    })
  } else if (allowInsert) {
    queue.items.push(item)
  }
  sortSharedPromptQueueItems(queue)
}

function mapTurnQueueEventToItem(
  data: TurnQueueEvent,
  queueItemId: string
): SharedPromptQueueItem {
  return {
    queueItemId,
    sessionId: data.sessionId ?? null,
    queuePosition:
      typeof data.queuePosition === "number" && Number.isFinite(data.queuePosition)
        ? Math.max(1, Math.trunc(data.queuePosition))
        : null,
    sourceClientId: data.sourceClientId ?? null,
    sourceDeviceName: data.sourceDeviceName ?? null,
    promptPreview: data.promptPreview ?? null,
    createdAtMs:
      typeof data.createdAtMs === "number" && Number.isFinite(data.createdAtMs)
        ? Math.trunc(data.createdAtMs)
        : null,
    runtime: data.runtime ?? null,
    agentType: data.agentType ?? null,
  }
}

function removeSharedPromptQueueItem(
  queue: SharedPromptQueueState,
  queueItemId?: string | null
) {
  const normalized = firstString(queueItemId)
  if (!normalized) return
  const index = queue.items.findIndex((entry) => entry.queueItemId === normalized)
  if (index >= 0) {
    queue.items.splice(index, 1)
  }
}

function applySharedPromptQueueCount(
  queue: SharedPromptQueueState,
  data: TurnQueueEvent
) {
  const explicitCount = data.queueLength
  if (typeof explicitCount === "number" && Number.isFinite(explicitCount)) {
    queue.count = Math.max(0, Math.trunc(explicitCount))
    if (queue.count === 0) {
      queue.items = []
    }
    return
  }
  queue.count = queue.items.length
}

function sortSharedPromptQueueItems(queue: SharedPromptQueueState) {
  queue.items.sort((left, right) => {
    const leftPosition = left.queuePosition ?? Number.MAX_SAFE_INTEGER
    const rightPosition = right.queuePosition ?? Number.MAX_SAFE_INTEGER
    if (leftPosition !== rightPosition) return leftPosition - rightPosition
    return (left.createdAtMs ?? 0) - (right.createdAtMs ?? 0)
  })
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
      buildLiveMessageTurnId(session.conversationId, liveMessage),
    role: "assistant",
    content: cloneContentParts(liveMessage.content),
    timestamp,
    status: "completed",
  }
}

const COMPLETE_TURN_DUPLICATE_WINDOW_MS = 3000

function buildCompleteTurnKey(session: RuntimeSession, eventData?: any) {
  const explicitTurnId = firstString(
    eventData?.turnId,
    eventData?.turn_id,
    eventData?.id,
    eventData?.messageId,
    eventData?.message_id
  )
  if (explicitTurnId) return `turn:${explicitTurnId}`

  const eventSeq = firstNumber(
    eventData?.__eventSeq,
    eventData?.event_seq,
    eventData?.eventSeq,
    eventData?.seq
  )
  if (eventSeq != null) return `seq:${eventSeq}`

  const eventLiveId = firstString(
    eventData?.liveMessage?.id,
    eventData?.live_message?.id,
    eventData?.finalLiveMessage?.id,
    eventData?.final_live_message?.id
  )
  if (eventLiveId) return `live:live-${session.conversationId}-${eventLiveId}`

  const eventTimestamp = firstNumber(eventData?.timestamp, eventData?.created_at, eventData?.createdAt)
  if (eventTimestamp != null) return `timestamp:${eventTimestamp}`

  if (session.liveMessage && !session.liveMessage.isPlaceholderThinking) {
    return `live:${buildLiveMessageTurnId(session.conversationId, session.liveMessage)}`
  }

  if (session.optimisticTurns.length > 0) {
    return `optimistic:${session.optimisticTurns.map((turn) => turn.id).join(",")}`
  }

  return null
}

function shouldIgnoreDuplicateCompleteTurn(
  session: RuntimeSession,
  completeTurnKey: string | null
) {
  const alreadyDrained =
    session.liveMessage === null &&
    session.optimisticTurns.length === 0 &&
    session.pendingPermission === null &&
    session.pendingQuestion === null
  if (!alreadyDrained) return false

  if (completeTurnKey && completeTurnKey === session.lastCompletedTurnKey) {
    return true
  }

  return (
    completeTurnKey === null &&
    session.lastCompletedTurnKey !== null &&
    Date.now() - session.lastCompletedTurnAt < COMPLETE_TURN_DUPLICATE_WINDOW_MS
  )
}

function markCompleteTurnHandled(
  session: RuntimeSession,
  completeTurnKey: string | null
) {
  session.lastCompletedTurnKey = completeTurnKey || `unknown:${Date.now()}`
  session.lastCompletedTurnAt = Date.now()
}

function resolveCompletionLiveMessage(
  session: RuntimeSession,
  eventData?: any
): LiveMessage | null {
  return mapCompletionLiveMessage(session, eventData) ?? session.liveMessage
}

function mapCompletionLiveMessage(
  session: RuntimeSession,
  eventData?: any
): LiveMessage | null {
  const rawLiveMessage = firstObject(
    eventData?.liveMessage,
    eventData?.live_message,
    eventData?.finalLiveMessage,
    eventData?.final_live_message
  )
  if (!rawLiveMessage) return null

  const mapped = mapSnapshotLiveMessage(
    {
      live_message: rawLiveMessage,
      active_tool_calls: eventData?.active_tool_calls ?? eventData?.activeToolCalls,
    },
    session.liveMessage
  )
  if (!mapped) return null
  return {
    ...mapped,
    isStreaming: false,
  }
}

let liveMessageSequence = 0

function createRuntimeLiveMessageId() {
  liveMessageSequence += 1
  return `lm-${Date.now()}-${liveMessageSequence}`
}

function isSharedInProgressStatus(status: RuntimeSession["status"]) {
  return (
    status === "thinking" ||
    status === "running_tool" ||
    status === "waiting_permission" ||
    status === "waiting_question"
  )
}

function deriveSessionStatsFromConversationDetail(
  detail: ConversationDetail | any,
  fallbackTurnCount = 0
): SessionStats | null {
  if (!detail || typeof detail !== "object") return null

  const rawSessionStats = firstObject(detail.sessionStats, detail.session_stats)
  const totalUsage = normalizeTurnUsage(
    firstObject(rawSessionStats?.total_usage, rawSessionStats?.totalUsage)
  )
  const usage = totalUsage || sumTurnUsage(Array.isArray(detail.turns) ? detail.turns : [])
  if (!usage) return null

  const totalTokens =
    firstNumber(rawSessionStats?.total_tokens, rawSessionStats?.totalTokens) ??
    usage.input_tokens +
      usage.output_tokens +
      usage.cache_creation_input_tokens +
      usage.cache_read_input_tokens

  return {
    inputTokens: usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens,
    turnCount: Array.isArray(detail.turns) ? detail.turns.length : fallbackTurnCount,
  }
}

function applyConversationDetailStatsToSession(
  session: RuntimeSession,
  detail: ConversationDetail | any
) {
  const metadataApplied = applyConversationDetailMetadataToSession(session, detail)
  const nextStats = deriveSessionStatsFromConversationDetail(detail, session.stats.turnCount)
  if (nextStats) {
    session.stats = nextStats
  }
  return metadataApplied || Boolean(nextStats)
}

function applyConversationDetailMetadataToSession(
  session: RuntimeSession,
  detail: ConversationDetail | any
) {
  if (!detail || typeof detail !== "object") return false
  if (!hasInFlightUserTurnField(detail)) return false

  const inFlightUserTurnId = firstString(
    detail.in_flight_user_turn_id,
    detail.inFlightUserTurnId
  )
  session.inFlightUserTurnId = inFlightUserTurnId || null
  return true
}

function hasInFlightUserTurnField(detail: Record<string, any>) {
  return (
    Object.prototype.hasOwnProperty.call(detail, "in_flight_user_turn_id") ||
    Object.prototype.hasOwnProperty.call(detail, "inFlightUserTurnId")
  )
}

function sumTurnUsage(turns: any[]): TurnUsageAccumulator | null {
  let total: TurnUsageAccumulator | null = null
  for (const turn of turns) {
    const usage = normalizeTurnUsage(firstObject(turn?.usage))
    if (!usage) continue
    if (!total) {
      total = { ...usage }
      continue
    }
    total.input_tokens += usage.input_tokens
    total.output_tokens += usage.output_tokens
    total.cache_creation_input_tokens += usage.cache_creation_input_tokens
    total.cache_read_input_tokens += usage.cache_read_input_tokens
  }
  return total
}

interface TurnUsageAccumulator {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

function normalizeTurnUsage(raw: Record<string, any> | null | undefined): TurnUsageAccumulator | null {
  if (!raw) return null
  const inputTokens = firstNumber(raw.input_tokens, raw.inputTokens, raw.input, raw.prompt) ?? 0
  const outputTokens = firstNumber(raw.output_tokens, raw.outputTokens, raw.output, raw.completion) ?? 0
  const cacheCreationInputTokens =
    firstNumber(
      raw.cache_creation_input_tokens,
      raw.cacheCreationInputTokens,
      raw.cache_write,
      raw.cacheWrite
    ) ?? 0
  const cacheReadInputTokens =
    firstNumber(
      raw.cache_read_input_tokens,
      raw.cacheReadInputTokens,
      raw.cache_read,
      raw.cacheRead,
      raw.cached
    ) ?? 0
  const total = inputTokens + outputTokens + cacheCreationInputTokens + cacheReadInputTokens
  if (total <= 0) return null
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_creation_input_tokens: cacheCreationInputTokens,
    cache_read_input_tokens: cacheReadInputTokens,
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
      const replayDetail = await calibrateAfterReplayGap(session.conversationId)
      applyConversationDetailStatsToSession(session, replayDetail)
      session.localTurns = await reloadLocalTurns(session)
    } catch (error) {
      console.warn(`external-user backfill skipped (${reason})`, error)
    } finally {
      session.externalTurnBackfillInFlight = false
    }
  })()
}

function applySnapshotInFlightUserTurnId(session: RuntimeSession, snapshot: any) {
  if (!snapshot || typeof snapshot !== "object") return false

  const pendingUserMessage = firstObject(
    snapshot.pending_user_message,
    snapshot.pendingUserMessage
  )
  const inFlightUserTurnId = firstString(
    pendingUserMessage?.message_id,
    pendingUserMessage?.messageId,
    pendingUserMessage?.id,
    snapshot.in_flight_user_turn_id,
    snapshot.inFlightUserTurnId
  )
  if (inFlightUserTurnId) {
    session.inFlightUserTurnId = inFlightUserTurnId
    return true
  }

  const explicitlyCleared =
    Object.prototype.hasOwnProperty.call(snapshot, "pending_user_message") ||
    Object.prototype.hasOwnProperty.call(snapshot, "pendingUserMessage") ||
    Object.prototype.hasOwnProperty.call(snapshot, "in_flight_user_turn_id") ||
    Object.prototype.hasOwnProperty.call(snapshot, "inFlightUserTurnId")
  if (explicitlyCleared) {
    session.inFlightUserTurnId = null
    return true
  }

  return false
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

function mapSnapshotLiveMessage(
  snapshot: any,
  currentLiveMessage?: LiveMessage | null
): LiveMessage | null {
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
    id: resolveLiveMessageId(
      firstString(rawLiveMessage?.id, rawLiveMessage?.message_id) || undefined,
      currentLiveMessage?.id
    ),
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

function isStaleSnapshotLiveReplay(
  session: RuntimeSession,
  liveMessage: LiveMessage
) {
  if (session.liveMessage !== null) return false
  if (session.optimisticTurns.length > 0) return false
  if (session.pendingPermission !== null || session.pendingQuestion !== null) return false
  if (isSharedInProgressStatus(session.status)) return false

  const latestAssistant = getLatestLocalAssistantTurn(session.localTurns)
  if (!latestAssistant) return false

  const liveTurnId = buildLiveMessageTurnId(session.conversationId, liveMessage)
  if (latestAssistant.id === liveTurnId) return true

  return (
    typeof liveMessage.timestamp === "number" &&
    Number.isFinite(liveMessage.timestamp) &&
    typeof latestAssistant.timestamp === "number" &&
    Number.isFinite(latestAssistant.timestamp) &&
    liveMessage.timestamp <= latestAssistant.timestamp
  )
}

function getLatestLocalAssistantTurn(turns: MessageTurn[]) {
  let latest: MessageTurn | null = null
  for (const turn of turns) {
    if (turn.role !== "assistant") continue
    if (!latest || turn.timestamp > latest.timestamp) {
      latest = turn
    }
  }
  return latest
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

function resolveLiveMessageId(...candidates: Array<string | null | undefined>) {
  const normalized = firstString(...candidates)
  return normalized || createRuntimeLiveMessageId()
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

function firstObject(...values: unknown[]) {
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, any>
    }
  }
  return null
}
