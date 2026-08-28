import { defineStore } from "pinia"
import { reactive, ref } from "vue"
import type {
  MessageTurn,
  LiveMessage,
  ConnectionInfo,
  ConversationConnectionInfo,
  ConversationDetail,
  ConversationHistoryWindow,
  EventEnvelope,
  SessionStats,
  ContentPart,
  PermissionRequest,
  PermissionOption,
  PendingQuestionState,
  ApiRetryEvent,
  FeedbackNote,
  RuntimeErrorEvent,
  SessionFailureRecord,
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
  getNewestTurns,
  insertCompletedTurn,
  pruneConversationTurnsToNewest,
  type PersistedTurnPartRow,
  type PersistedTurnWithParts,
} from "@/services/db/repositories/conversationRepository"
import { buildPersistedTurnRecord } from "@/services/conversation/conversationDetailPersistence"
import {
  dropEmptyThinkingParts,
  mergeTailIntoTurns,
  normalizeTurnRole,
  parseTurnTimestamp,
} from "@/services/conversation/conversationTurnIdentity"
import {
  mergeSessionFailure,
  mergeSessionFailureSnapshot,
  normalizeSessionFailureRecord,
  settleRecoveredSessionFailures,
} from "@/services/conversation/sessionFailureRecords"
import {
  DEFAULT_CONVERSATION_HISTORY_PAGE_SIZE,
  isWindowedConversationDetail,
} from "@/services/conversation/conversationHistoryWindowContract"
import { readLocalTurnCacheEnabled } from "@/services/conversation/localTurnCachePreference"
import {
  appendFeedbackNote,
  markFeedbackNotesDelivered,
  mergeFeedbackSnapshot,
  normalizeFeedbackNote,
  parseFeedbackInstant,
} from "@/services/conversation/feedbackNotes"
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
  const inFlightConnects = new Map<number, Promise<ConnectionInfo>>()

  /**
   * 获取或创建会话运行时
   */
  function getOrCreateSession(conversationId: number): RuntimeSession {
    if (!sessions.value.has(conversationId)) {
      sessions.value.set(conversationId, reactive({
        conversationId,
        localTurns: [],
        historyWindow: null,
        liveMessage: null,
        connectionId: null,
        instanceKey: "",
        status: "idle",
        inputErrorMessage: null,
        inputErrorDetails: null,
        sessionFailures: [],
        inputErrorTurnKey: null,
        apiRetry: null,
        pendingPermission: null,
        pendingQuestion: null,
        sharedPromptQueue: createSharedPromptQueueState(),
        inFlightUserTurnId: null,
        nativeSteeringAvailable: false,
        feedbackNotes: [],
        consumedFeedbackIds: new Map<string, number>(),
        lastAppliedSeq: null,
        lastCompletedTurnKey: null,
        lastCompletedTurnAt: 0,
        historyBackfillInFlight: false,
        historyBackfillGeneration: 0,
        subagentTranscripts: new Map<string, string>(),
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

  function setConversationHistoryWindow(
    conversationId: number,
    historyWindow: ConversationHistoryWindow | null,
  ) {
    const session = getOrCreateSession(conversationId)
    session.historyWindow = historyWindow ? { ...historyWindow } : null
  }

  /**
   * 丢弃整条内存时间线并清空窗口坐标，等待重新拉取最新一页。
   *
   * 只给一个场景用：`canApplyOlderHistoryPage` 断言失败 —— 服务端回的
   * `prefix_hash_before_index` 与我们记的 `prefix_hash` 不符，也就是**已经证明**
   * 内存里的前缀是陈旧的（历史被压缩重写了）。
   *
   * 这里必须整条清掉，不能只清窗口。别处刷新时间线一律走
   * `mergeTailIntoTurnsWithSeam` 保住前缀，那是因为「连续性无从证明」时宁可重复也
   * 不丢消息；而这条路是**连续性已被否证**，保住前缀只会把陈旧轮次和新轮次一起
   * 显示出来。两种情况必须区别对待。
   *
   * 清空后 `hasRenderableRuntimeState` 变 false，`loadConversation` 会走缓存/远端
   * 路径重新水合最新一页 —— 正是这条恢复路径想要的重新锚定。
   */
  function resetConversationHistoryToLatest(conversationId: number) {
    const session = sessions.value.get(conversationId)
    if (!session) return
    session.localTurns = []
    session.historyWindow = null
  }

  /**
   * 获取会话的所有消息（包括已确认本地和流式消息）
   */
  function getMessages(conversationId: number): MessageTurn[] {
    return getTimelineTurns(conversationId).map((entry) => entry.turn)
  }

  function getTimelineTurns(conversationId: number): ConversationTimelineTurn[] {
    const session = getOrCreateSession(conversationId)
    return buildConversationTimeline({
      conversationId,
      localTurns: session.localTurns,
      liveMessage: session.liveMessage,
      inFlightUserTurnId: session.inFlightUserTurnId,
    })
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
    resetTurnScopedBackfillState(session)
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
   * 子智能体实时正文上限。十分钟的子智能体运行不能让内存无界增长；胶囊展开时只看
   * 尾部，早期内容由 turn_complete 后的 `agent_stats` 承载。
   */
  const SUBAGENT_TRANSCRIPT_MAX_CHARS = 4000

  function appendSubagentTranscript(
    session: RuntimeSession,
    parentToolUseId: string,
    delta: string
  ) {
    if (!delta) return
    const previous = session.subagentTranscripts.get(parentToolUseId) || ""
    const next = previous + delta
    session.subagentTranscripts.set(
      parentToolUseId,
      next.length > SUBAGENT_TRANSCRIPT_MAX_CHARS
        ? next.slice(-SUBAGENT_TRANSCRIPT_MAX_CHARS)
        : next
    )
  }

  /**
   * 追加流式内容
   */
  function appendLiveContent(
    conversationId: number,
    delta: string,
    contentType: string,
    parentToolUseId?: string | null
  ) {
    const session = getOrCreateSession(conversationId)

    // 带归属的 chunk 属于某个子智能体胶囊，不是主线程内容。必须在动 liveMessage
    // 之前分流，且**不要**做下面那两件事：
    // - 不设 `session.status = "thinking"`：父 tool_call 已把状态设成 running_tool，
    //   子智能体每来一个 chunk 就翻成「思考中」会让底部状态条全程是错的。
    // - 不清占位 thinking：子智能体的内容不是主线程回复，不该消掉主线程的占位。
    if (parentToolUseId) {
      appendSubagentTranscript(session, parentToolUseId, delta)
      return
    }

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
      return
    }

    applySnapshotInFlightUserTurnId(session, snapshot)
    // 冷启动 mid-turn attach：快照里的 pending_user_message 带着外部 prompt 的
    // 正文，合成为用户轮次，这样打开进行中的会话不必全量拉取即可看到 prompt。
    const pendingUserMessage = firstObject(
      snapshot.pending_user_message,
      snapshot.pendingUserMessage
    )
    if (pendingUserMessage) {
      applyRealtimeUserMessage(session, {
        messageId: firstString(
          pendingUserMessage.message_id,
          pendingUserMessage.messageId,
          pendingUserMessage.id
        ),
        blocks: pendingUserMessage.blocks,
        timestamp: pendingUserMessage.timestamp ??
          pendingUserMessage.createdAt ??
          pendingUserMessage.created_at,
      })
    }
    const normalizedLiveMessage = mapSnapshotLiveMessage(snapshot, session.liveMessage)
    const shouldIgnoreSnapshotLiveMessage =
      normalizedLiveMessage != null &&
      isStaleSnapshotLiveReplay(session, normalizedLiveMessage)
    if (normalizedLiveMessage && !shouldIgnoreSnapshotLiveMessage) {
      session.liveMessage = normalizedLiveMessage
    }
    session.pendingPermission = normalizePendingPermission(snapshot?.pending_permission)
    session.pendingQuestion = normalizePendingQuestion(snapshot?.pending_question)
    // 「插入当前回合」的能力位。**只升不降**：`connectionId` 在连接还在 connecting 时
    // 就已经存在，那一刻服务端尚未在 initialize 里写 `native_steering_available`，第一次
    // 读回来必然是 false —— 无条件赋值会把入口永久关掉。false 与字段缺失（旧后端）在这里
    // 是同一件事：都不构成「这条会话不支持」的证据。真正的清零在 disconnect / 换连接。
    if (readSnapshotNativeSteering(snapshot)) {
      session.nativeSteeringAvailable = true
    }
    // 本轮便签也在快照里（`session_state.rs:1653`，注释写明是为「mid-turn attach 的
    // 客户端渲染那些一次性 feedback_submitted 不会重放的便签」准备的）。冷启动 /
    // 重连进一个进行中的会话时，这是唯一来源。
    //
    // 合并方向与上面的能力位**相反**：这里实时优先。快照可能停在 `pending`，而
    // `feedback_consumed` 事件已经到了。空数组（服务端不上线该字段时的常态）在
    // mergeFeedbackSnapshot 里原样返回本地表，不会误清。
    const snapshotNotes = (
      Array.isArray(snapshot?.feedback) ? snapshot.feedback : []
    )
      .map((raw: unknown) => normalizeFeedbackNote(raw))
      .filter(Boolean) as FeedbackNote[]
    session.feedbackNotes = mergeFeedbackSnapshot(session.feedbackNotes, snapshotNotes)
    session.status = deriveRuntimeStatus(
      snapshot,
      shouldIgnoreSnapshotLiveMessage
        ? session.liveMessage
        : normalizedLiveMessage ?? session.liveMessage
    )
    // 快照里的 `last_error` 是「最近一次 agent 报错」，与 status 无关 —— 冷启动进入一个
    // 已经失败的会话时，它是唯一能拿到原因的地方（实时 error 事件早发完了）。
    //
    // 快照对这个字段是**权威值**，不是只增的补丁：服务端在 `StatusChanged(Prompting)`
    // 时把 `last_error` 清成 None（`session_state.rs:679`），所以「更新的快照里没有错误」
    // 明确意味着「已经没有错误了」。桌面端就是这么读的（`acp-connections-context.tsx`
    // 新鲜路径上一句 `error: patch.lastError`，null 即清空）。
    //
    // 这里此前只有「有就写」那半边，于是本地那条错误没有任何退场机会 —— 表现为
    // 「PC 端恢复正常了，mcode 还挂着一条过期的 502」。窗口比看起来窄，因为有三条
    // 自愈路径（在线收到 `status_changed → thinking`、走 `runtime.connect()`、进程重启），
    // 但 `ensureMountedDetailTabRuntime` 判定连接仍活时**只补快照、不 connect**
    // （`index.vue:1710`），后台标签走的正是这条，于是那条错误可以一直挂着。
    const snapshotError = deriveSnapshotLastError(snapshot)
    if (snapshotError) {
      recordSessionError(session, snapshotError.message, snapshotError.details)
    } else if (isProvablyFresherSnapshot(snapshotSeq, currentSeq)) {
      // 只在**可证明更新**时才清。两个前提都是必需的：
      // - `event_seq` 缺失时不清：那种快照的新旧无法判断，而 `shouldIgnoreOlderSnapshot`
      //   同样挡不住它，拿它擦掉刚报出来的原因等于故障又变回静默。
      // - 严格大于，不用 `>=`：同 seq 说明快照并不比游标新，而本地那条错误可能来自
      //   完全不推进游标的来源（`setSessionError` 写的发送失败根本没有 seq）。
      //
      // 代价：`inputErrorMessage` 也承载两类瞬态通知（`turn_queued` 的「任务已加入
      // 队列。」、`turn_cancel_requested` 的「正在取消当前任务...」），它们绕过
      // `recordSessionError` 直接赋值，因此也会被这里清掉。已确认接受 —— 那些通知本身
      // 就是瞬态的。真正的解法是给错误加来源标记，但那要动 13 处清除点。
      session.inputErrorMessage = null
      session.inputErrorDetails = null
      session.inputErrorTurnKey = null
    }
    // AIR 失败表在快照里（`session_state.rs:1671`，注释明说是为 mid-session attach 设计
    // 的），所以**冷启动就能拿到** —— 这是它比 Claude 的 `api_retry` 强的地方，后者必须
    // 等下一次事件。合并保留本地推断出的 `resolved`：线上没这个字段，快照里每条都是
    // false，整表替换会让已经恢复的警告在每次 attach 后复活。
    const snapshotFailures = (
      Array.isArray(snapshot?.session_failures)
        ? snapshot.session_failures
        : Array.isArray(snapshot?.sessionFailures)
          ? snapshot.sessionFailures
          : []
    )
      .map((raw: unknown) => normalizeSessionFailureRecord(raw))
      .filter(Boolean) as SessionFailureRecord[]
    if (snapshotFailures.length > 0) {
      session.sessionFailures = mergeSessionFailureSnapshot(
        session.sessionFailures,
        snapshotFailures
      )
    }
    // **不清 `apiRetry`。** 重试横幅（Claude 的 `api_retry` / codex 的 `TurnRetrying`）
    // 是瞬态提示，服务端**刻意不放进快照**（`session_state.rs` 的注释：「与 Claude 的
    // api_retry 一样是前端瞬态提示（重试横幅），不进快照 —— 回合边界会清除它」）。
    //
    // 所以「快照里没有」不等于「重试已经结束」。这里主动清空会让冷启动进入一个正在
    // 504 重试的会话时横幅先消失，等下一次 `api_retry` 事件推过来才重新出现 ——
    // 用户报的正是这个：「一开始不显示，过了一会却又显示了」。而重试是指数退避的，
    // 那个空窗可能有好几秒。
    //
    // 冷启动时它本来就是 null，无需清；已经有值时那个值来自比快照更可信的实时事件。
    session.lastAppliedSeq = snapshotSeq ?? session.lastAppliedSeq

    const usage = snapshot.usage
    if (usage && typeof usage === "object") {
      session.stats.totalTokens = firstNumber(usage.used) || session.stats.totalTokens
    }
    maybeBackfillMissingHistory(session, "snapshot")
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
    resetTurnScopedBackfillState(session)
    const authoritativeUserTurn = getAuthoritativeInFlightUserTurn(session)
    const completedTurns: MessageTurn[] = authoritativeUserTurn
      ? [cloneMessageTurn(authoritativeUserTurn)]
      : []
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
        session.liveMessage = null
        session.inFlightUserTurnId = null
        if (!authoritativeUserTurn && assistantTurn) {
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
    // 一次成功的回合结束 = AIR 的 warning 记录（重试警告）自愈了。
    //
    // **只结算 warning，`error` 保持活跃** —— 服务端刻意让终止性失败留着
    // （`types.rs:67-69`：codex 靠它防止迟到的重复通知追加出重复行），它们要等用户实际
    // 处理（重连 / 重新登录 / 开新会话）。一起清掉等于把没解决的问题从界面上抹掉。
    //
    // 线上永远没有 resolve 帧，「恢复」只能这样推断出来（`types.rs:70-74`）。
    session.sessionFailures = settleRecoveredSessionFailures(session.sessionFailures)
  }

  /**
   * 处理事件
   */
  function handleEvent(event: EventEnvelope) {
    handleEventForConversation(null, event)
  }

  function handleEventForConversation(conversationId: number | null, event: EventEnvelope) {
    connectionSessionManager.touchConnection(event.connectionId)
    const targetConversationId = Number(conversationId || 0)
    const session = targetConversationId > 0
      ? sessions.value.get(targetConversationId)
      : Array.from(sessions.value.values()).find(
          (s) => s.connectionId === event.connectionId
        )
    if (!session) return
    if (
      targetConversationId > 0 &&
      event.connectionId &&
      session.connectionId &&
      session.connectionId !== event.connectionId
    ) {
      return
    }
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
        clearStaleTurnError(session)
        session.apiRetry = null
        session.pendingPermission = null
        session.pendingQuestion = null
        appendLiveContent(
          session.conversationId,
          event.data.delta,
          event.data.contentType,
          event.data.parentToolUseId
        )
        maybeBackfillMissingHistory(session, "stream_batch")
        break

      case "user_message":
        // 后端广播的 user_message 是所有客户端当前用户轮次的唯一来源；无论消息
        // 是否由本机发送，都先按 messageId 合成已确认轮次，再等待流式事件。
        applyRealtimeUserMessage(session, event.data)
        // 便签是**轮次级**的，服务端就在这个事件里清表（`session_state.rs:4084` 那条
        // 测试锁着这个契约），跟着它走。
        //
        // **不能用 turn_complete 清**：回合刚结束、下一轮还没开始时，你插进去的那句
        // 仍然属于刚才那轮的上下文，提前抹掉会让你以为没插进去。
        session.feedbackNotes = []
        session.consumedFeedbackIds = new Map()
        break

      case "feedback_submitted": {
        // 一条便签落地。按 id 幂等 —— 本地乐观 append 之后紧跟着到达的同 id 广播
        // 必须是 no-op，事件重放和双 attach 同理。
        const note = normalizeFeedbackNote(event.data?.item)
        if (!note) break
        session.feedbackNotes = appendFeedbackNote(
          session.feedbackNotes,
          note,
          session.consumedFeedbackIds
        )
        break
      }

      case "feedback_consumed": {
        // agent 通过 `check_user_feedback` 读走了若干条便签。
        //
        // **这个事件几乎不会是为 mcode 自己的便签发的**：mcode 走 native 通道，便签
        // 出生即 delivered（见 `FeedbackNote` 类型说明）。它承载的是**别人的便签**
        // —— 桌面端在同一会话里走 pull 通道发的那些。
        const ids: string[] = Array.isArray(event.data?.ids) ? event.data.ids : []
        if (ids.length === 0) break
        // 服务端一定会带 delivered_at；解析不出来时退回「现在」，因为这个事件的语义
        // 本身就是「刚刚读走」——「已读取但没有时刻」会让 UI 显示不出读取时间。
        const deliveredAt = parseFeedbackInstant(event.data?.deliveredAt) ?? Date.now()
        // 墓碑先记：对应的 submitted 可能还在路上（广播乱序 / 快照未水合），
        // 不记的话那条便签落地时会以 pending 复活在 agent 已经读过之后。
        for (const id of ids) {
          if (!session.consumedFeedbackIds.has(id)) {
            session.consumedFeedbackIds.set(id, deliveredAt)
          }
        }
        session.feedbackNotes = markFeedbackNotesDelivered(
          session.feedbackNotes,
          ids,
          deliveredAt
        )
        break
      }

      case "tool_call": {
        session.status = "running_tool"
        clearStaleTurnError(session)
        session.apiRetry = null
        session.pendingPermission = null
        session.pendingQuestion = null
        const output = firstString(event.data.output, event.data.rawOutput) || undefined
        const rawOutput = firstString(event.data.rawOutput) || undefined
        const error = firstString(event.data.error) || undefined
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
                status: event.data.status || "running",
                output,
                rawOutput,
                error,
                meta: event.data.meta ?? null,
              },
            },
          ],
        }
        maybeBackfillMissingHistory(session, "tool_call")
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
              // 用 `??` 而不是直接赋值：update 常常不带 meta，直接覆盖会擦掉首帧的
              // 子智能体权威标记，胶囊会在流式中途退化成普通工具组。
              meta: event.data.meta ?? currentToolCall.meta ?? null,
            },
          }
        })
        session.liveMessage = {
          ...session.liveMessage,
          content: nextContent,
        }
        maybeBackfillMissingHistory(session, "tool_call_update")
        break
      }

      case "status_changed":
        if (event.data.scope === "conversation") {
          if (event.data.status === "error") {
            session.status = "error"
            recordSessionError(
              session,
              firstString(event.data.message) || session.inputErrorMessage || "会话运行失败",
              firstString(event.data.details) || session.inputErrorDetails
            )
          } else if (event.data.status === "idle" && !session.liveMessage && !session.pendingPermission && !session.pendingQuestion) {
            session.status = session.connectionId ? "connected" : "idle"
            session.inputErrorMessage = null
            session.inputErrorDetails = null
            session.inputErrorTurnKey = null
            session.apiRetry = null
          }
          syncManagedSendPermission(session.conversationId)
          break
        }
        const previousStatus = session.status
        session.status = event.data.status
        if (event.data.status === "error") {
          recordSessionError(
            session,
            firstString(event.data.message) || session.inputErrorMessage || "连接异常",
            firstString(event.data.details) || session.inputErrorDetails
          )
        } else if (event.data.status === "disconnected") {
          // agent 进程已死 / 连接被拆掉。此前它在 `api/acp.ts` 的 `mapConnectionStatus`
          // 里就被压成了 `idle`，所以这个分支曾经是**死代码** —— agent 死了界面上什么
          // 都不显示。
          //
          // 保留已有的错误文案：`Disconnected` 往往紧跟在一条 `Error` 之后（服务端
          // `run_connection` 先发 Error 再发 Disconnected），那条 Error 才带着真正的
          // 原因。拿不到时才退回通用文案。
          recordSessionError(
            session,
            firstString(event.data.message)
              || session.inputErrorMessage
              || "智能体连接已断开",
            session.inputErrorDetails
          )
        } else {
          const preserveTerminalError =
            event.data.status === "idle"
            && (previousStatus === "error" || previousStatus === "disconnected")
            && Boolean(firstString(session.inputErrorMessage))
          if (!preserveTerminalError) {
            session.inputErrorMessage = null
            session.inputErrorDetails = null
            session.inputErrorTurnKey = null
          }
          session.apiRetry = null
        }
        if (
          event.data.status === "idle" &&
          !session.liveMessage &&
          !session.inFlightUserTurnId
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
        maybeBackfillMissingHistory(session, "status_changed")
        syncManagedSendPermission(session.conversationId)
        break

      case "permission_request":
        touchHotConversation(session.conversationId)
        session.status = "waiting_permission"
        session.inputErrorMessage = null
        session.inputErrorDetails = null
        session.inputErrorTurnKey = null
        session.pendingPermission = normalizePermissionRequest(event.data)
        session.pendingQuestion = null
        maybeBackfillMissingHistory(session, "permission_request")
        syncManagedSendPermission(session.conversationId)
        break

      case "question_request":
        touchHotConversation(session.conversationId)
        session.status = "waiting_question"
        session.inputErrorMessage = null
        session.inputErrorDetails = null
        session.inputErrorTurnKey = null
        session.pendingPermission = null
        session.pendingQuestion = normalizeQuestionRequest(event.data)
        maybeBackfillMissingHistory(session, "question_request")
        syncManagedSendPermission(session.conversationId)
        break

      case "api_retry":
        touchHotConversation(session.conversationId)
        session.apiRetry = normalizeApiRetryEvent(event.data)
        // `api_retry` 与错误是**同一件事的两面**：502 之后 agent 自动重试，两个事件
        // 一前一后到达。清掉错误只会让重试横幅取代原因，用户看到「正在重试」却永远
        // 不知道在重试什么。让 `clearStaleTurnError` 按轮次判断。
        clearStaleTurnError(session)
        break

      case "session_failure": {
        // AIR 结构化失败记录。合并规则（id + revision 严格递增）与快照那条路**共用同一份
        // 实现** —— 服务端要求两侧行为一致，写两份必然漂移，而漂移的症状是重复行或幽灵
        // 记录，都不报错。
        //
        // **不动 status、不动 inputErrorMessage。** 这张表回答的是「有哪些失败、建议怎么
        // 处理」，与「当前会话是什么状态」是两件事：severity=warning 的重试记录期间会话
        // 仍在正常跑（codex 靠它接管重试横幅），把它当 error 会让界面在自愈过程中反复红。
        // 终止性失败自己会通过 `error` / `status_changed` 改 status。
        const incoming = normalizeSessionFailureRecord(event.data)
        if (!incoming) break
        touchHotConversation(session.conversationId)
        const merged = mergeSessionFailure(session.sessionFailures, incoming)
        if (merged.changed) {
          session.sessionFailures = merged.records
        }
        break
      }

      case "error": {
        touchHotConversation(session.conversationId)
        const runtimeError = normalizeRuntimeErrorEvent(event.data)
        session.status = "error"
        session.apiRetry = null
        recordSessionError(
          session,
          runtimeError?.message || "请求失败",
          runtimeError?.details
        )
        break
      }

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
        session.inFlightUserTurnId = null
        // 被取消的回合不会有下一条 `user_message` 来清便签（那条清空挂在**新一轮开始**
        // 上）。不在这里清，上一轮的便签会一直挂在输入框上方，直到用户真的发下一条。
        session.feedbackNotes = []
        session.consumedFeedbackIds = new Map()
        session.status = session.connectionId ? "connected" : "idle"
        session.inputErrorMessage = null
        session.inputErrorDetails = null
        session.inputErrorTurnKey = null
        session.apiRetry = null
        resetTurnScopedBackfillState(session)
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
      case "turn_queue_reordered":
      case "turn_queue_priority_changed":
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
    const existingManaged = connectionSessionManager.getByConversationId(conversationId)
    if (existingManaged?.connectionId) {
      return bindManagedConnection(conversationId, existingManaged, sinceSeq)
    }

    const existingInFlight = inFlightConnects.get(conversationId)
    if (existingInFlight) {
      return existingInFlight
    }

    const promise = connectFreshConversation(
      conversationId,
      agentType,
      workingDir,
      sessionId,
      sinceSeq,
      instanceKey
    )
    inFlightConnects.set(conversationId, promise)
    try {
      return await promise
    } finally {
      if (inFlightConnects.get(conversationId) === promise) {
        inFlightConnects.delete(conversationId)
      }
    }
  }

  async function bindManagedConnection(
    conversationId: number,
    managed: NonNullable<ReturnType<typeof connectionSessionManager.getByConversationId>>,
    sinceSeq?: number
  ) {
    const session = getOrCreateSession(conversationId)
    session.connectionId = managed.connectionId
    session.instanceKey = managed.instanceKey
    connections.value.set(managed.connectionId, managed.connection)
    if (
      session.status === "idle" ||
      session.status === "connecting" ||
      session.status === "error"
    ) {
      session.status = "connected"
    }
    session.inputErrorMessage = null
    session.inputErrorDetails = null
    session.inputErrorTurnKey = null
    session.apiRetry = null
    syncManagedSendPermission(conversationId)

    bindConversationEventHandler(conversationId, (event) => {
      handleEventForConversation(conversationId, event)
    })
    await attachConversationRealtime({
      conversationId,
      instanceKey: managed.instanceKey,
      connectionId: managed.connectionId,
      sinceSeq,
    })

    return managed.connection
  }

  async function connectFreshConversation(
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
      const requestOptions = targetInstanceKey
        ? { instanceKey: targetInstanceKey }
        : undefined
      let discovered: ConversationConnectionInfo | null = null
      try {
        discovered = await acpApi.acpFindConnectionForConversation(
          conversationId,
          agentType,
          sessionId,
          requestOptions
        )
      } catch (error) {
        console.warn("acp_find_connection_for_conversation failed", error)
      }

      const discoveredRecord = (discovered || {}) as Record<string, unknown>
      const discoveredConnectionId = firstString(
        discoveredRecord.connection_id,
        discoveredRecord.connectionId
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
            firstString(discoveredRecord.agent_type, discoveredRecord.agentType) ||
            managed.connection.agentType ||
            agentType,
          sessionId:
            firstString(discoveredRecord.session_id, discoveredRecord.sessionId) ||
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
        // 会话被别的连接接管了：能力位属于旧那条，必须清掉等新快照重新声明。
        session.nativeSteeringAvailable = false
        session.feedbackNotes = []
        session.consumedFeedbackIds = new Map()
        resetTurnScopedBackfillState(session)
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
          snapshot = await acpApi.acpGetSessionSnapshotByConversation(
            conversationId,
            requestOptions
          )
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
            capabilities: Array.isArray(snapshot?.capabilities) ? snapshot.capabilities : [],
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

      return await bindManagedConnection(conversationId, managed, sinceSeq)
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
      session.inputErrorDetails = null
      session.inputErrorTurnKey = null
      session.apiRetry = null
      session.pendingPermission = null
      session.pendingQuestion = null
      session.sharedPromptQueue = createSharedPromptQueueState()
      session.inFlightUserTurnId = null
      // 能力位随连接消亡：它描述的是「这条连接的 adapter 支持什么」，下一条连接可能
      // 是另一个 agent / 另一个版本。留着它会让重连到 codex 后仍然显示插入入口。
      session.nativeSteeringAvailable = false
      // 便签同理：它们属于那条已经断掉的连接的当前回合。
      session.feedbackNotes = []
      session.consumedFeedbackIds = new Map()
      session.lastCompletedTurnKey = null
      session.lastCompletedTurnAt = 0
      resetTurnScopedBackfillState(session)
    }
  }

  function invalidateConnection(conversationId: number, expectedConnectionId?: string) {
    const session = sessions.value.get(conversationId)
    if (!session?.connectionId) return false
    if (expectedConnectionId && session.connectionId !== expectedConnectionId) return false

    const connectionId = session.connectionId
    detachConversationRealtime(conversationId)
    unbindConversationEventHandler(conversationId)
    connections.value.delete(connectionId)
    connectionSessionManager.clearConversation(conversationId)
    session.connectionId = null
    session.inputErrorMessage = null
    session.inputErrorDetails = null
    session.inputErrorTurnKey = null
    session.apiRetry = null
    // 同 disconnect：能力位属于那条已经作废的连接，不能带到下一条上。
    session.nativeSteeringAvailable = false
    session.feedbackNotes = []
    session.consumedFeedbackIds = new Map()
    if (!isSharedInProgressStatus(session.status)) {
      session.status = "idle"
    }
    return true
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

  function releasePreviewSession(conversationId: number) {
    const session = sessions.value.get(conversationId)
    if (!session) return false

    releaseHotConversation(conversationId)
    detachConversationRealtime(conversationId)
    unbindConversationEventHandler(conversationId)
    if (session.connectionId) {
      connections.value.delete(session.connectionId)
    }
    connectionSessionManager.clearConversation(conversationId)
    sessions.value.delete(conversationId)
    return true
  }

  function clearCachedSessionState() {
    for (const session of sessions.value.values()) {
      if (
        isSharedInProgressStatus(session.status) ||
        session.liveMessage ||
        session.inFlightUserTurnId ||
        isHotConversation(session.conversationId)
      ) {
        continue
      }
      session.localTurns = []
      session.historyWindow = null
      session.liveMessage = null
      session.inputErrorMessage = null
      session.inputErrorDetails = null
      session.inputErrorTurnKey = null
      session.apiRetry = null
      session.pendingPermission = null
      session.pendingQuestion = null
      session.sharedPromptQueue = createSharedPromptQueueState()
      session.inFlightUserTurnId = null
      session.lastAppliedSeq = null
      session.lastCompletedTurnKey = null
      session.lastCompletedTurnAt = 0
      resetTurnScopedBackfillState(session)
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
    session.inputErrorDetails = null
    session.inputErrorTurnKey = null
    session.apiRetry = null
    session.pendingPermission = null
    session.pendingQuestion = null
    session.sharedPromptQueue = createSharedPromptQueueState()
    session.inFlightUserTurnId = null
    resetTurnScopedBackfillState(session)
    session.lastAppliedSeq = 0
    session.lastCompletedTurnKey = null
    session.lastCompletedTurnAt = 0
    connections.value.set(managed.connectionId, managed.connection)
    syncManagedSendPermission(input.conversationId)
  }

  /**
   * 记录一条刚提交成功的补充意见便签（乐观回显）。
   *
   * `submit_session_feedback` 的响应体就是那条便签，与随后广播的
   * `feedback_submitted` 是同一个 `id`，所以走同一条幂等 append —— 先记不会变成两条。
   * 不先记的话，在广播回来之前（relay 链路上是几百毫秒）界面上没有任何插入成功的痕迹。
   */
  function recordFeedbackNote(conversationId: number, raw: unknown) {
    const session = sessions.value.get(conversationId)
    if (!session) return
    const note = normalizeFeedbackNote(raw)
    if (!note) return
    session.feedbackNotes = appendFeedbackNote(
      session.feedbackNotes,
      note,
      session.consumedFeedbackIds
    )
  }

  function setSessionError(conversationId: number, message: string | null) {
    const session = getOrCreateSession(conversationId)
    const normalized = firstString(message)
    session.inputErrorMessage = normalized || null
    // 手动设置的错误（发送失败等）同样要记轮次，否则下一个 delta 到来时
    // `clearStaleTurnError` 会当成陈旧错误清掉。清空时把轮次一起清。
    session.inputErrorTurnKey = normalized ? session.liveMessage?.id || null : null
    if (!normalized) {
      session.inputErrorDetails = null
    }
    session.apiRetry = null
    if (normalized) {
      if (session.status === "idle") {
        session.status = session.connectionId ? "connected" : "idle"
      }
    } else if (session.status === "error") {
      session.status = session.connectionId ? "connected" : "idle"
    }
  }

  /**
   * 用户手动关掉「发送失败」横幅。
   *
   * 这个入口是必需的，不是便利功能：那条横幅此前**既不会自动消失、也无法关闭**。
   * - `setSessionError(id, null)` 只在发送成功后被调用；
   * - `clearStaleTurnError` 有一道 `if (!inputErrorTurnKey) return` 守卫，而 catch 里
   *   写入错误时若 `liveMessage` 为 null（冷启动、或刚被 clearLiveMessage 清掉），
   *   轮次键就记不上，于是这条错误被判成「不属于任何轮次」，永远不清。
   *
   * 结果是一条历史错误（比如一次额度不足）可以无限期挂在输入框上方，让用户以为当前
   * 就是这个状态。
   *
   * 与 `setSessionError(id, null)` 的区别：那个是发送成功后的内部清理；这个表达的是
   * 「用户看过了、要它消失」，语义上属于 UI 动作，因此单独成一个 action 而不是复用。
   *
   * **不碰会话本身的运行状态**（只在 status 卡在 `error` 时恢复成可发送的值）——
   * 正在跑的会话被关闭横幅打回 `connected` 会看起来像停了。
   */
  function dismissSessionError(conversationId: number) {
    const session = sessions.value.get(conversationId)
    if (!session) return
    session.inputErrorMessage = null
    session.inputErrorDetails = null
    // 轮次键必须一起清：留着它会让下一条错误被 `clearStaleTurnError` 误判成陈旧的。
    session.inputErrorTurnKey = null
    session.apiRetry = null
    if (session.status === "error") {
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

  /**
   * 子智能体实时正文快照。转成普通对象是为了让 Vue 的 computed 能追踪 ——
   * `Map` 在模板里不便直接消费，且组件侧只需要只读视图。
   */
  function getSubagentTranscripts(conversationId: number): Record<string, string> {
    const session = sessions.value.get(conversationId)
    if (!session || session.subagentTranscripts.size === 0) return {}
    const snapshot: Record<string, string> = {}
    session.subagentTranscripts.forEach((value, key) => {
      snapshot[key] = value
    })
    return snapshot
  }

  return {
    sessions,
    connections,
    getOrCreateSession,
    setConversationHistoryWindow,
    resetConversationHistoryToLatest,
    getMessages,
    getTimelineTurns,
    getSubagentTranscripts,
    beginPlaceholderThinking,
    clearLiveMessage,
    setLiveMessage,
    appendLiveContent,
    completeTurn,
    handleEvent,
    handleEventForConversation,
    hydrateLiveSnapshot,
    connect,
    disconnect,
    invalidateConnection,
    clearSession,
    releasePreviewSession,
    clearCachedSessionState,
    clearPendingPermission,
    clearPendingQuestion,
    recordFeedbackNote,
    bindCreatedConversationRuntime,
    setSessionError,
    dismissSessionError,
    applyConversationDetailStats,
    canSend,
    getManagedConversation,
  }
})

interface RuntimeSession {
  conversationId: number
  localTurns: MessageTurn[]
  historyWindow: ConversationHistoryWindow | null
  liveMessage: LiveMessage | null
  connectionId: string | null
  instanceKey: string
  /**
   * `disconnected` 对应服务端 `ConnectionStatus::Disconnected`（agent 进程已死/连接被
   * 拆掉）。它此前**不在这个联合类型里**，于是 `status_changed` 的 `disconnected` 掉进
   * else 分支被当成正常状态，还会顺手清掉 `inputErrorMessage` —— agent 死了，界面上
   * 什么都不显示。
   */
  status: "idle" | "connecting" | "connected" | "thinking" | "running_tool" | "waiting_permission" | "waiting_question" | "disconnected" | "error"
  inputErrorMessage: string | null
  /**
   * 上一次报错的诊断证据（agent stderr 尾巴）。与 `inputErrorMessage` 同生同灭。
   * 单独存一份而不是拼进文案：它可能有几十行，UI 要默认折叠、按需展开。
   */
  inputErrorDetails: string | null
  /**
   * JetBrains AIR 结构化失败记录表（`services/conversation/sessionFailureRecords.ts`）。
   *
   * 与 `inputErrorMessage` 并存而不是二选一：那个是「最近一条错误的文案」，这张表是
   * **带结构的**失败清单（category / severity / actions / 是否已解决），能回答
   * 「该给重连按钮还是该让用户重新登录」。两条来源也不同 —— 这张表在 attach 快照里，
   * 冷启动就有；`inputErrorMessage` 主要靠实时事件。
   */
  sessionFailures: SessionFailureRecord[]
  /**
   * 当前那条错误属于哪一轮（取 `liveMessage.id`）。
   *
   * 用来区分「上一轮的陈旧错误」与「本轮刚报出来的错误」：502 这类错误 agent 会自动重试
   * 并继续输出，`stream_batch` 一到就无条件清空的老写法会把刚报的原因静默抹掉
   * （见 `clearStaleTurnError`）。`null` 表示轮次未知，此时保守不清。
   */
  inputErrorTurnKey: string | null
  apiRetry: ApiRetryEvent | null
  pendingPermission: PermissionRequest | null
  pendingQuestion: PendingQuestionState | null
  sharedPromptQueue: SharedPromptQueueState
  inFlightUserTurnId: string | null
  /**
   * 这条连接的补充意见是否走原生 `_session/steering` 推送通道（服务端合成的
   * `native_steering_available`，`codeg-plus/src-tauri/src/acp/session_state.rs:1673`）。
   *
   * 它是「运行中能不能插入当前回合」的**唯一**判据。服务端已经把三道闸合成进这一个
   * bool：adapter 声明 `_meta.steering.supported`、registry 认为该 agent 遵守
   * `promptRequired` opt-in、以及**运行中的适配器版本**达标（claude-agent-acp
   * ≥ 0.65.0，`registry.rs:298`）。**不要在前端用 agentType 重新推导** —— codex 也
   * 声明 steering，但它缺少 idle 约定，会把当前回合变成 detached turn，服务端因此
   * 明确不给它开（`connection.rs:9470` 的注释写了「不暴露原始声明位，否则前端会忍不住
   * 自己推导」）。
   *
   * **单调升级**：只有快照报 `true` 才置位，`false` 与字段缺失都**不回落**。理由与
   * codeg-plus 前端对 `feedback_tool_available` 的处理相同 —— `connectionId` 在连接刚
   * 创建（还在 connecting）时就有了，那一刻服务端尚未在 initialize 里写这个字段，第一次
   * 读必然是 false；无条件覆盖会让入口永久消失。清零只发生在 disconnect / 换连接。
   */
  nativeSteeringAvailable: boolean
  /**
   * 本轮的补充意见便签（见 `FeedbackNote`）。轮次级瞬态：下一轮 `user_message` 清空，
   * 不进时间线、不进 SQLite、不参与轮次去重 —— 与服务端「intentionally NOT persisted」
   * 的立场一致。
   */
  feedbackNotes: FeedbackNote[]
  /**
   * 已被 agent 读走、但对应 `feedback_submitted` 还没到的便签 id → 读取时刻。
   *
   * 广播可能乱序，快照也可能比 `feedback_consumed` 晚水合。没有这张墓碑表，那条便签
   * 落地时会以 `pending` 复活在 agent 已经读过之后 —— 界面显示「等待读取」，而它其实
   * 早就送到了。与 `feedbackNotes` 同生同灭。
   */
  consumedFeedbackIds: Map<string, number>
  lastAppliedSeq: number | null
  lastCompletedTurnKey: string | null
  lastCompletedTurnAt: number
  // 观察者进入进行中会话时的一次性历史补齐（见 `maybeBackfillMissingHistory`）。
  // 旧实现有 5 个字段（节流时间戳、尝试计数、已补齐标记…）驱动 1.5s 轮询，
  // 那套是给不广播 `UserMessage` 的旧后端留的兼容层，已删。
  historyBackfillInFlight: boolean
  /** 回合边界 / 会话切换时自增，让在途请求的结果失效。 */
  historyBackfillGeneration: number
  /**
   * 子智能体实时正文缓冲：`parent_tool_use_id` → 该胶囊的文本尾巴。
   *
   * **刻意放在 session 上而不是挂 `ToolCall`**，三个原因：
   * 1. `liveMessage` 是整轮累加器、每个 delta 都整体替换 content 数组；往嵌套
   *    `tool_call` 里追加字符串会让每个 chunk 都重建全部 part 身份。
   * 2. 父 `tool_call` 事件不保证先到，按 id 收的 map 不丢早到的 chunk。
   * 3. `toPersistedPartPayload` 存的是**整个** `tool_call` 对象 —— 任何挂上去的字段
   *    都会自动进 SQLite。放这里让「不持久化」成为结构性保证而非纪律。
   *
   * 不持久化是有意的：这些 chunk 是无结构的纯 delta，而 turn_complete 后历史回填会
   * 带回结构化的 `agent_stats.tool_calls[]`（含耗时），严格优于实时尾巴。存下来只会
   * 得到两份互相矛盾、无法对账的渲染源。
   */
  subagentTranscripts: Map<string, string>
  stats: SessionStats
}

function resetTurnScopedBackfillState(session: RuntimeSession) {
  // 回合边界后，在途的历史补齐结果不得覆盖新状态。
  session.historyBackfillGeneration += 1
  session.historyBackfillInFlight = false
  // 子智能体实时正文只在本回合内有意义：回合结束后权威内容来自历史回填的
  // `agent_stats`。这里是所有回合边界（turn_complete / turn_cancelled / disconnect
  // / 缓存清理）的唯一漏斗，清在这里不会漏。
  session.subagentTranscripts?.clear()
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
  priorityTier: string | null
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
      if (Array.isArray(data.queueSnapshot) && data.queueSnapshot.length > 0) {
        replaceSharedPromptQueueItems(session.sharedPromptQueue, data.queueSnapshot)
      }
      upsertSharedPromptQueueItem(session.sharedPromptQueue, data, false)
      applySharedPromptQueueCount(session.sharedPromptQueue, data)
      break
    case "turn_queue_reordered":
    case "turn_queue_priority_changed":
      if (Array.isArray(data.queueSnapshot) && data.queueSnapshot.length > 0) {
        replaceSharedPromptQueueItems(session.sharedPromptQueue, data.queueSnapshot)
      } else {
        upsertSharedPromptQueueItem(session.sharedPromptQueue, data, false)
      }
      applySharedPromptQueueCount(session.sharedPromptQueue, data)
      session.sharedPromptQueue.lastMessage =
        data.priorityTier
          ? `队列已更新为${sharedPromptPriorityText(data.priorityTier)}。`
          : "队列顺序已更新。"
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
      session.inputErrorDetails = null
      session.inputErrorTurnKey = null
      session.apiRetry = null
      break
    case "turn_queue_cancelled":
      removeSharedPromptQueueItem(session.sharedPromptQueue, data.queueItemId)
      applySharedPromptQueueCount(session.sharedPromptQueue, data)
      session.sharedPromptQueue.lastMessage = "队列任务已取消。"
      session.inputErrorMessage = null
      session.inputErrorDetails = null
      session.inputErrorTurnKey = null
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
    priorityTier:
      firstString(record.priorityTier, record.priority_tier) || null,
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
    queueSnapshot: Array.isArray(record.queueSnapshot)
      ? (record.queueSnapshot as TurnQueueEvent[])
      : null,
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
    priorityTier:
      firstString(data.priorityTier) || null,
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
    const leftPriority = sharedPromptPriorityRank(left.priorityTier)
    const rightPriority = sharedPromptPriorityRank(right.priorityTier)
    if (leftPriority !== rightPriority) return leftPriority - rightPriority
    const leftPosition = left.queuePosition ?? Number.MAX_SAFE_INTEGER
    const rightPosition = right.queuePosition ?? Number.MAX_SAFE_INTEGER
    if (leftPosition !== rightPosition) return leftPosition - rightPosition
    return (left.createdAtMs ?? 0) - (right.createdAtMs ?? 0)
  })
}

function replaceSharedPromptQueueItems(
  queue: SharedPromptQueueState,
  items: TurnQueueEvent[] | null | undefined
) {
  const nextItems = (items || [])
    .map((item) => mapTurnQueueEventToItem(item, firstString(item.queueItemId) || ""))
    .filter((item) => Boolean(item.queueItemId))
  queue.items = nextItems
  sortSharedPromptQueueItems(queue)
}

function sharedPromptPriorityRank(priorityTier?: string | null) {
  const priority = String(priorityTier || "").trim().toLowerCase()
  if (priority === "high") return 0
  if (priority === "normal" || !priority) return 1
  if (priority === "low") return 2
  return 1
}

function sharedPromptPriorityText(priorityTier?: string | null) {
  const priority = String(priorityTier || "").trim().toLowerCase()
  if (priority === "high") return "高优先级"
  if (priority === "low") return "低优先级"
  return "普通优先级"
}

// 后端会把所有客户端发送的用户 prompt 通过 UserMessage 事件广播回来。这里将
// 该事件合成为已确认用户轮次并按 message_id 去重；客户端不再预先插入本地消息。
function applyRealtimeUserMessage(session: RuntimeSession, eventData: any) {
  const messageId = firstString(eventData?.messageId, eventData?.message_id)
  if (!messageId) return

  const content = mapUserMessageBlocksToContent(eventData?.blocks)
  if (content.length === 0) return

  // message_id 是首选去重键。回填 SQLite 后，当前未完成用户轮次的 id 可能被
  // 持久化 id 替换；仅对这一条 in-flight 尾部轮次允许内容签名兜底。不能扫描
  // 全部历史，否则用户连续发送相同文本（例如“继续”）时会把新轮次误去重。
  const contentSignature = buildUserTurnContentSignature(content)
  const existingTurn =
    session.localTurns.find(
      (turn) => turn.role === "user" && turn.id === messageId
    ) || findInFlightUserTurnByContentSignature(session, contentSignature)

  // user_message 是客户端唯一的用户消息权威来源。它一到达，就让更早启动的
  // replay-gap 回填结果失效，避免旧 SQLite 快照把刚确认的用户轮次换走。
  resetTurnScopedBackfillState(session)

  if (existingTurn) {
    session.inFlightUserTurnId = existingTurn.id
    return
  }

  const turn: MessageTurn = {
    id: messageId,
    role: "user",
    content,
    timestamp:
      parseTurnTimestamp(
        eventData?.timestamp,
        eventData?.createdAt,
        eventData?.created_at,
      ) ?? Date.now(),
    status: "completed",
  }
  session.localTurns = dedupeTurnsByRoleAndId([...session.localTurns, turn])
  session.inFlightUserTurnId = messageId
}

function findInFlightUserTurnByContentSignature(
  session: RuntimeSession,
  contentSignature: string
): MessageTurn | null {
  if (!firstString(session.inFlightUserTurnId) || !contentSignature) return null

  // 服务端一个逻辑回复会被拆成多条连续 assistant 轮次（解析器在下一条 assistant
  // 消息处断开），因此进行中的用户轮次通常不在数组末尾，而是被若干条 assistant
  // 轮次盖住。只看最后一条会漏判，于是同一条 prompt 会被追加成第二条用户消息 ——
  // 这正是详情页"用户消息重复 2 次"的来源。跳过尾部 assistant 轮次再比对。
  let index = session.localTurns.length - 1
  while (index >= 0 && session.localTurns[index]?.role === "assistant") {
    index -= 1
  }

  const candidate = index >= 0 ? session.localTurns[index] : null
  if (candidate?.role !== "user") return null

  // 只认「持久化/远端来源」的孪生轮次：它带 dedupeKey，且 id 与当前 in-flight id
  // 不同，说明就是同一条 prompt 落库后换了 id。实时追加的轮次没有 dedupeKey，
  // 因此排队发送的重复文本（例如连续两次"继续"）不会被误合并。
  if (!firstString(candidate.dedupeKey)) return null
  if (candidate.id === firstString(session.inFlightUserTurnId)) return null

  return buildUserTurnContentSignature(candidate.content) === contentSignature
    ? candidate
    : null
}

function getAuthoritativeInFlightUserTurn(session: RuntimeSession): MessageTurn | null {
  const inFlightUserTurnId = firstString(session.inFlightUserTurnId)
  if (!inFlightUserTurnId) return null
  return session.localTurns.find(
    (turn) => turn.role === "user" && turn.id === inFlightUserTurnId,
  ) ?? null
}

function buildUserTurnContentSignature(content: ContentPart[] | undefined): string {
  if (!Array.isArray(content)) return ""
  return content
    .map((part) => {
      if (part.type === "text") return `text:${part.text || ""}`
      if (part.type === "image") return `image:${part.image?.url || ""}`
      return part.type || ""
    })
    .join("\n")
}

function mapUserMessageBlocksToContent(blocks: unknown): ContentPart[] {
  if (!Array.isArray(blocks)) return []
  const parts: ContentPart[] = []
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue
    const record = block as Record<string, unknown>
    const type = firstString(record.type, record.kind)
    if (type === "text") {
      const text = firstString(record.text)
      if (text) parts.push({ type: "text", text })
    } else if (type === "image") {
      const data = firstString(record.data)
      const mimeType = firstString(record.mime_type, record.mimeType) || "image/png"
      if (data) {
        const url = data.startsWith("data:") ? data : `data:${mimeType};base64,${data}`
        parts.push({ type: "image", image: { url } })
      }
    }
  }
  return parts
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

// 单个回合内 external-user backfill（全量拉取）的最大尝试次数。正常路径首次即
// capture 成功并 latch 守卫，这个上限只在 captured 长期判不出来（旧后端）时兜底，
// 防止流式期间无限全量拉取拖垮客户端。回合边界会重置计数。

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

  return null
}

function shouldIgnoreDuplicateCompleteTurn(
  session: RuntimeSession,
  completeTurnKey: string | null
) {
  const alreadyDrained =
    session.liveMessage === null &&
    session.inFlightUserTurnId === null &&
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

/**
 * 从会话详情推导顶部统计（token / 轮次数）。
 *
 * **窗口化响应必须区别对待。** 服务端的 `apply_turn_window` 只切 `turns`，其余字段
 * （含 `session_stats`）仍描述**完整**会话。所以拿尾窗的 `turns` 去累加 usage 或数长度，
 * 会把「最近 30 轮」当成「整个会话」上报，顶部数字凭空缩水。
 *
 * - `usage`：窗口化且 `session_stats.total_usage` 缺失 → 返回 `null`，让调用方保留
 *   已有的 `session.stats`，而不是用尾窗累加冒充全量。
 * - `turnCount`：窗口化时用服务端回报的 `turns_total`（`turns.length` 只是窗口长度，
 *   而且因为向前对齐可能是 30~230 的任意值）。
 */
function deriveSessionStatsFromConversationDetail(
  detail: ConversationDetail | any,
  fallbackTurnCount = 0
): SessionStats | null {
  if (!detail || typeof detail !== "object") return null

  const windowed = isWindowedConversationDetail(detail)
  const rawSessionStats = firstObject(detail.sessionStats, detail.session_stats)
  const totalUsage = normalizeTurnUsage(
    firstObject(rawSessionStats?.total_usage, rawSessionStats?.totalUsage)
  )
  const usage =
    totalUsage ||
    (windowed ? null : sumTurnUsage(Array.isArray(detail.turns) ? detail.turns : []))
  if (!usage) return null

  const totalTokens =
    firstNumber(rawSessionStats?.total_tokens, rawSessionStats?.totalTokens) ??
    usage.input_tokens +
      usage.output_tokens +
      usage.cache_creation_input_tokens +
      usage.cache_read_input_tokens

  const turnCount = windowed
    ? (firstNumber(detail.turns_total, detail.turnsTotal) ?? fallbackTurnCount)
    : Array.isArray(detail.turns)
      ? detail.turns.length
      : fallbackTurnCount

  return {
    inputTokens: usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens,
    turnCount,
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
  // 实验性开关关闭（默认）时不落库。返回 false 而不是 true —— 调用方据此走
  // 「把刚完成的轮次直接并进内存时间线」那条分支（`dedupeTurnsByRoleAndId`）。
  // 返回 true 会让它去 `reloadLocalTurns` 读一个空表，刚说完的话当场消失。
  if (!readLocalTurnCacheEnabled()) return false
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
    // `insertCompletedTurn` 只 upsert、从不删，所以这条追加路径必须自己裁剪回一页，
    // 否则一直聊下去缓存会单调增长（读取侧的 LIMIT 让它读不到，但行还躺在库里
    // 占存储、并被「清除缓存」页面算进条数）。裁剪的排序键与 `getNewestTurns`
    // 一致，所以刚插进去的这几条一定在保留集里。
    await pruneConversationTurnsToNewest(
      session.conversationId,
      DEFAULT_CONVERSATION_HISTORY_PAGE_SIZE
    )
    return true
  } catch (error) {
    console.warn("persist completed runtime turns skipped", error)
    return false
  }
}

/**
 * 用本地缓存刷新时间线尾部。
 *
 * **不能整体替换。** 本地 SQLite 只缓存最新一页（30 条），而用户可能已经往上翻到
 * 200 条 —— 这里过去按 `session.localTurns.length` 定读取量再整体赋值，缓存被裁到
 * 30 条后就把内存时间线也砍回 30。四个调用点全都无条件赋值，`:1856` 那处的
 * `areLocalTurnsEquivalent` 守卫也挡不住：它在长度不等时直接返回 false，坍缩会被
 * 当成「有变化」照样写进去。
 *
 * 所以固定按一页读取，再用 `mergeTailIntoTurns` 把内存里更早的前缀接回去。
 *
 * 实验性开关关闭（默认）时**原样返回内存时间线**，一行都不读。必须两侧一起关：
 * 只关写入的话，之前开启期间留下的旧行仍会被读回来，而它们可能已经很旧 ——
 * `mergeTailIntoTurns` 找不到接缝就把它们**接在当前轮次之后**，用户看到一段错位的
 * 历史复活。
 */
async function reloadLocalTurns(session: RuntimeSession) {
  if (!readLocalTurnCacheEnabled()) return session.localTurns
  const turns = await getNewestTurns(
    session.conversationId,
    DEFAULT_CONVERSATION_HISTORY_PAGE_SIZE
  )
  const cachedTail = turns.slice().reverse().map(mapPersistedTurnToMessage)
  return mergeTailIntoTurns(session.localTurns, cachedTail)
}

/**
 * 观察者进入一个**已在进行中**的会话时，补齐缺失的历史轮次。
 *
 * ## 它补的到底是什么
 *
 * 用户轮次本身**不需要**这个函数。后端把所有客户端发出的 prompt 都通过
 * `AcpEvent::UserMessage` 广播回来（codeg-plus `acp/types.rs` 的 `UserMessage`），
 * `applyRealtimeUserMessage` 收到后自己把它插进 `localTurns` —— 一行网络请求都不用发。
 *
 * 真正的缺口只有一个：**mid-turn attach**。attach 快照
 * （`LiveSessionSnapshot`，codeg-plus `acp/session_state.rs`）带 `pending_user_message`
 * 与 `live_message`，但**不含任何历史轮次**。所以手机打开一个 PC 上已经跑起来的会话时，
 * `inFlightUserTurnId` 有值、`localTurns` 却是空的，界面上 agent 在自言自语，
 * 看不到问题是什么。这一份历史只能靠 `get_folder_conversation` 拉。
 *
 * ## 为什么不再轮询
 *
 * 旧实现挂在 7 个实时事件上（snapshot / status_changed / stream_batch / tool_call /
 * tool_call_update / permission_request / question_request），带 1.5s 节流和 4 次配额，
 * 也就是「流式期间每 1.5s 全量拉一次会话，最多 4 次」。它是给**旧后端**留的兼容层 ——
 * 当年后端既不回报 in-flight 用户轮次 id、也不广播 `UserMessage`，客户端只能反复拉。
 *
 * 对着现在的 codeg-plus 那是纯浪费，而且有害：每次拉回的是 30 条尾窗，
 * 沿途的 `reloadLocalTurns` / `applyRemoteHistoryWindowDetail` 会把用户已经往上翻到的
 * 200 条砍回一页。用户报过「历史加载不出来」，放大器就是这条轮询。
 *
 * 所以现在只在**真的一条本地轮次都没有**时拉一次。判据是 `localTurns.length === 0`，
 * 不是「有没有拿到 in-flight id」—— 后者由快照提供、必然有值，用它当判据这个函数就永不执行。
 * 拉到内容后 `localTurns` 非空，下一个事件进来时这里直接返回，天然一次性。
 *
 * 空会话（真的没有历史）会在每个事件上重试。这是刻意的：代价是几次拉空窗口的请求，
 * 而漏掉会让观察者永远看着空白。`inFlight` 守卫保证不会并发。
 */
function maybeBackfillMissingHistory(
  session: RuntimeSession,
  reason: "snapshot" | "status_changed" | "stream_batch" | "tool_call" | "tool_call_update" | "permission_request" | "question_request"
) {
  // 有任何本地轮次就说明历史已经到位（实时事件填的、或上一次补齐拉到的）。
  if (session.localTurns.length > 0) return
  if (session.historyBackfillInFlight) return

  const hasInFlightRemoteTurn =
    session.liveMessage != null ||
    session.pendingPermission != null ||
    session.pendingQuestion != null ||
    session.status === "thinking" ||
    session.status === "running_tool" ||
    session.status === "waiting_permission" ||
    session.status === "waiting_question"
  if (!hasInFlightRemoteTurn) return

  const backfillGeneration = session.historyBackfillGeneration
  session.historyBackfillInFlight = true
  void (async () => {
    try {
      const replayDetail = await calibrateAfterReplayGap(session.conversationId)
      // 回合边界 / 会话切换期间发出的请求，结果不得覆盖新状态。
      if (session.historyBackfillGeneration !== backfillGeneration) return

      applyConversationDetailStatsToSession(session, replayDetail)
      const reloaded = await reloadLocalTurns(session)
      if (session.historyBackfillGeneration !== backfillGeneration) return

      // 仅在确有变化时赋值，避免流式期间整表 re-render 引起列表闪烁与滚动跳动。
      if (!areLocalTurnsEquivalent(session.localTurns, reloaded)) {
        session.localTurns = reloaded
      }
    } catch (error) {
      console.warn(`history backfill skipped (${reason})`, error)
    } finally {
      if (session.historyBackfillGeneration === backfillGeneration) {
        session.historyBackfillInFlight = false
      }
    }
  })()
}

function areLocalTurnsEquivalent(a: MessageTurn[], b: MessageTurn[]) {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false
    if (a[i].status !== b[i].status) return false
    if (a[i].timestamp !== b[i].timestamp) return false
  }
  return true
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
    // 必须透传 dedupe_key：reloadLocalTurns 走的是这份实现，缺了它，turn_complete /
    // backfill 之后从 SQLite 重载出来的轮次就失去跨来源身份，会和远端载荷里的同一条
    // 轮次在时间线上各占一行（详情页消息重复 2 次）。
    dedupeKey: String(turn.dedupeKey || "").trim() || undefined,
    // 与展示侧、落库侧共用同一份角色判定。这里过去是裸 `as` 断言，SQLite 里存的任何
    // 字符串都会原样透出：一旦落库的 role 不是这三种之一，渲染分支就会全部落空。
    role: normalizeTurnRole(turn.role),
    timestamp: turn.createdAt,
    status: (turn.status as MessageTurn["status"] | undefined) || "completed",
    // 与展示侧一致：读回时滤掉空 thinking。过滤上线前落库的行里已经有存量空胶囊，
    // reloadLocalTurns 走的正是这份实现。
    content: dropEmptyThinkingParts(
      turn.parts
        .slice()
        .sort((a, b) => a.partIndex - b.partIndex)
        .map(mapPersistedPartToContent)
        .filter(Boolean) as ContentPart[]
    ),
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
    timestamp: parseTurnTimestamp(rawLiveMessage?.started_at) ?? Date.now(),
    isPlaceholderThinking: false,
  }
}

function mapSnapshotContentBlock(
  block: any,
  toolCallMap: Map<string, ContentPart>
): ContentPart | null {
  const kind = firstString(block?.kind)
  if (kind === "text") {
    return { type: "text", text: firstString(block?.text) || "" }
  }
  if (kind === "thinking") {
    // 这条路径复原的是**实时** liveMessage（`isStreaming: true`），所以空 thinking
    // **故意不过滤** —— 它是驱动「正在思考」的合法实时状态，对 reasoning-redacting
    // 模型更是永久状态。只补 `|| ""`：漏了它会得到 `thinking: undefined`，
    // 与 `ContentPart` 的类型不符，且渲染出字面量 "undefined"。
    return { type: "thinking", thinking: firstString(block?.text) || "" }
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
  if (session.inFlightUserTurnId !== null) return false
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
      // 快照恢复（mid-turn attach）也要带上 meta，否则冷启动时子智能体胶囊会退化
      // 成普通工具组。
      meta: recordFromUnknown(entry?.meta),
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

/**
 * 这份快照能否**证明**自己比已应用的事件游标更新。
 *
 * 只服务一件事：决定「快照里没有 `last_error`」是否足以清掉本地那条错误。写入不看这个
 * 判据 —— 报错宁可多显示，清除才需要证据。
 *
 * 两条都不成立时返回 false（保守不清）：
 * - `snapshotSeq` 不是有限数（旧后端 / 字段缺失）：新旧无从判断。
 * - 本地游标已存在且 `snapshotSeq <= currentSeq`：快照并不比游标新。**同 seq 也算不新**
 *   —— 本地那条错误可能来自完全不推进游标的来源（发送失败走 `setSessionError`，根本
 *   没有 seq），此时同 seq 快照证明不了它已经过期。
 *
 * `currentSeq` 为 null（冷启动，一条事件都没应用过）时任何带 seq 的快照都算更新：那份
 * 快照就是此刻唯一的真相来源。
 */
function isProvablyFresherSnapshot(
  snapshotSeq: number | null,
  currentSeq: number | null
) {
  if (typeof snapshotSeq !== "number" || !Number.isFinite(snapshotSeq)) return false
  if (typeof currentSeq !== "number" || !Number.isFinite(currentSeq)) return true
  return snapshotSeq > currentSeq
}

/**
 * 从 attach 快照里取出最近一次 agent 报错。
 *
 * 服务端把它放在 `SessionState.last_error`（`acp/session_state.rs` 的
 * `SessionLastError { message, code, details? }`），并在 `to_snapshot()` 上暴露，注释
 * 写明了用意：
 *
 * > Exposed on `to_snapshot()` so clients that reconnect after missing the live
 * > `AcpEvent::Error` can still surface the latest agent failure.
 *
 * 也就是说**冷启动 / 重连进入一个已经失败的会话**时，这是唯一能拿到失败原因的地方 ——
 * 实时 `error` 事件早就发完了。
 *
 * 改动前这个函数读的三个字段（`snapshot.error` / `.message` / `.detail`）在
 * `LiveSessionSnapshot` 上**都不存在**，于是它要么返回 null，要么在 `status === "error"`
 * 时返回兜底文案「会话运行失败」—— 真正的原因一次都没显示过。
 *
 * 另外**不能再用 `status === "error"` 当前置条件**：`last_error` 与 status 是独立的两件事。
 * agent 报错后连接可能还活着（非终止性错误：单轮失败、SetMode 失败、空 prompt 被拒），
 * status 已经回到 `connected`，但那条错误仍然值得显示。服务端自己的清除时机是
 * 「新 prompt 开始（`Prompting`）时」，不是「状态变好时」。
 */
function deriveSnapshotLastError(snapshot: any): RuntimeErrorEvent | null {
  const lastError = firstObject(snapshot?.last_error, snapshot?.lastError)
  if (lastError) {
    const message = firstString(lastError.message)
    if (message) {
      return {
        message,
        code: firstString(lastError.code) || undefined,
        details: firstString(lastError.details) || undefined,
      }
    }
  }

  // 没有 last_error 但状态是 error：给一句兜底，总比静默好。旧后端（不带
  // `last_error` 的版本）也走这条路。
  if (firstString(snapshot?.status) === "error") {
    return { message: "会话运行失败" }
  }
  return null
}

/**
 * 快照是否声明这条连接支持原生 steering。
 *
 * **只认显式的 `true`**（含 camelCase 别名）。`false`、字段缺失、非布尔值一律返回 false，
 * 由调用方的单调升级逻辑决定「不置位」而非「置回 false」—— 见
 * `RuntimeSession.nativeSteeringAvailable` 的说明。
 */
function readSnapshotNativeSteering(snapshot: any): boolean {
  if (!snapshot || typeof snapshot !== "object") return false
  return (
    snapshot.native_steering_available === true ||
    snapshot.nativeSteeringAvailable === true
  )
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

/**
 * 清掉**上一轮**留下的错误 —— 不清本轮刚报出来的那条。
 *
 * 用户报的原话是「Mcode 看不到右侧 PC 端的错误」，截图里 PC 上一条红色的
 * `unexpected status 502 Bad Gateway ...` 横幅明明挂着，手机端却什么都没有，而且状态还是
 * 「已连接」。
 *
 * 成因：`stream_batch` / `tool_call` 的第一行就是无条件 `inputErrorMessage = null`。
 * 502 这类错误 agent 会自动重试并继续输出，**只要下一个 delta 到来，错误就被静默抹掉**。
 * 手机端要么根本来不及渲染，要么闪一下就没了 —— 而 PC 端的横幅是要手动关掉的，所以两边
 * 看起来完全不同。
 *
 * 那三处清空的**本意**是「新一轮开始了，上一轮的错误该退场」，写成无条件清空却变成了
 * 「任何新内容都能抹掉任何错误」。所以按轮次记账：错误发生时记下它属于哪一轮
 * （`inputErrorTurnKey`），只有轮次真的换了才清。
 *
 * 轮次身份用 `liveMessage.id`：它在 `turn_complete` 时被清空、下一轮重新生成，正好是
 * 「同一轮」的天然标识。拿不到时（错误发生在 live message 之前）记 `null`，此时不清 ——
 * 宁可多留一条陈旧错误，也不要把刚报出来的原因弄丢。
 */
function clearStaleTurnError(session: RuntimeSession) {
  if (!session.inputErrorMessage) return
  const currentTurnKey = session.liveMessage?.id || null
  // 错误没记轮次（旧状态/快照恢复），或仍在同一轮 —— 都不清。
  if (!session.inputErrorTurnKey) return
  if (session.inputErrorTurnKey === currentTurnKey) return
  session.inputErrorMessage = null
  session.inputErrorDetails = null
  session.inputErrorTurnKey = null
}

/**
 * 记下一条错误，连带它所属的轮次。所有从**事件/快照**写错误的地方都该走这里。
 *
 * 与 store 上那个 `setSessionError(conversationId, message)` 不同：那个是给 UI 层手动
 * 设置输入框错误用的（发送失败等），入参是 conversationId；这个接的是已经拿到 session
 * 的内部路径，且必须记 `inputErrorTurnKey`。
 */
function recordSessionError(
  session: RuntimeSession,
  message: string,
  details?: string | null
) {
  session.inputErrorMessage = message
  session.inputErrorDetails = details || null
  session.inputErrorTurnKey = session.liveMessage?.id || null
}

function normalizeRuntimeErrorEvent(raw: any): RuntimeErrorEvent | null {
  if (!raw || typeof raw !== "object") return null
  const message = firstString(raw.message, raw.detail, raw.error)
  if (!message) return null
  return {
    message,
    code: firstString(raw.code) || undefined,
    agentType: firstString(raw.agentType, raw.agent_type) || undefined,
    // agent 的 stderr 尾巴。只有 codeg 推断出来的错误才带（agent 报告成功但线上没有
    // 任何错误信息的那一族），恰恰是最难排查的那种 —— 不收就等于「有报错但看不到原因」。
    details: firstString(raw.details) || undefined,
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

function recordFromUnknown(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, any>
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
