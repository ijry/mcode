import type {
  PromptInputBlock,
  ConnectionInfo,
  ConversationConnectionInfo,
  EventEnvelope,
  RealtimeBridgeHealth,
  UploadAttachmentResult,
  ConversationDetail,
  AgentOptionsSnapshot,
  AcpAgentInfo,
  QuestionAnswer,
} from "@/types/acp"
import { useAuthStore } from "@/stores/auth"
import { createGateway } from "@/services/gateway"
import { destroyRealtimeTransport, getOrCreateRealtimeTransport, getRealtimeTransport } from "@/services/realtime/transport-registry"
import { getRegisteredRemoteInstanceDescriptor } from "@/services/realtime/remoteInstanceRegistry"
import type { RealtimeTransport, RealtimeTransportHost, RemoteInstanceDescriptor } from "@/services/realtime/types"
import type { EventChannelConnection, RelaySessionInfo } from "@/services/gateway/types"
import { classifyRelayRealtimeFrame } from "@/services/gateway/relayRecovery"
import {
  clearRelayCheckpoint,
  clearRelayCheckpoints,
  readRelayCheckpoint,
  upsertRelayCheckpoint,
} from "@/services/gateway/relayCheckpointStore"

type BridgeState = {
  descriptor: RemoteInstanceDescriptor
  connection: EventChannelConnection | null
  transport: RealtimeTransport
  reconnectTimer: ReturnType<typeof setTimeout> | null
  reconnectAttempt: number
  closedManually: boolean
  attachCapable: boolean
  detachReady: (() => void) | null
  detachClose: (() => void) | null
  detachError: (() => void) | null
}

type RelayRecoveryState = {
  lastRelayEventId: number | null
  replayWindowStart: number | null
  requestedLastEventId: number | null
  recoveryIssue: "replay_miss" | null
  recoveryMessage: string | null
}

/**
 * ACP API 客户端
 * 封装所有与 ACP 服务的通信
 */
class AcpApiClient {
  private baseUrl: string
  private eventListeners: Map<string, Set<(event: EventEnvelope) => void>>
  private globalListeners: Map<string, Map<string, Set<(payload: unknown) => void>>>
  private bridgeHealthListeners: Map<string, Set<(health: RealtimeBridgeHealth) => void>>
  private pollingStarted = false
  private pollingInstanceKey: string | null = null
  private ensureBridgePromises = new Map<string, Promise<BridgeState>>()
  private bridgeStates = new Map<string, BridgeState>()
  private relayRecoveryStates = new Map<string, RelayRecoveryState>()
  private replayMissCalibrationHook: ((instanceKey: string) => Promise<void> | void) | null = null

  constructor(baseUrl: string = "") {
    this.baseUrl = baseUrl
    this.eventListeners = new Map()
    this.globalListeners = new Map()
    this.bridgeHealthListeners = new Map()
  }

  /**
   * 连接到 ACP 代理
   */
  async acpConnect(
    agentType: string,
    workingDir?: string,
    sessionId?: string,
    preferredModeId?: string,
    preferredConfigValues?: Record<string, string>
  ): Promise<ConnectionInfo> {
    const response = await this.request("/acp_connect", {
      agentType,
      workingDir,
      sessionId,
      preferredModeId,
      preferredConfigValues,
    })

    if (typeof response === "string" && response.trim()) {
      return {
        id: response.trim(),
        agentType,
        sessionId: sessionId || "",
        status: "connected",
        workingDir,
      }
    }

    if (response && typeof response === "object" && typeof response.id === "string") {
      return response as ConnectionInfo
    }

    throw new Error("acp_connect: invalid response")
  }

  /**
   * 断开 ACP 连接
   */
  async acpDisconnect(connectionId: string): Promise<void> {
    await this.request("/acp_disconnect", { connectionId })
  }

  /**
   * 发送消息到 ACP
   */
  async acpPrompt(
    connectionId: string,
    blocks: PromptInputBlock[],
    folderId?: number,
    conversationId?: number
  ): Promise<any> {
    return await this.request("/acp_prompt", {
      connectionId,
      blocks,
      folderId,
      conversationId,
    })
  }

  /**
   * 设置模式
   */
  async acpSetMode(connectionId: string, modeId: string): Promise<void> {
    await this.request("/acp_set_mode", { connectionId, modeId })
  }

  /**
   * 设置配置选项
   */
  async acpSetConfigOption(
    connectionId: string,
    configId: string,
    valueId: string
  ): Promise<void> {
    await this.request("/acp_set_config_option", {
      connectionId,
      configId,
      valueId,
    })
  }

  /**
   * 读取智能体会话可选配置
   */
  async acpDescribeAgentOptions(
    agentType: string,
    workingDir?: string | null
  ): Promise<AgentOptionsSnapshot> {
    return await this.request("/acp_describe_agent_options", {
      agentType,
      workingDir: workingDir ?? null,
    })
  }

  /**
   * 读取远端智能体列表
   */
  async acpListAgents(): Promise<AcpAgentInfo[]> {
    return await this.request("/acp_list_agents", {})
  }

  /**
   * 取消当前操作
   */
  async acpCancel(connectionId: string): Promise<void> {
    await this.request("/acp_cancel", { connectionId })
  }

  /**
   * 响应权限请求
   */
  async acpRespondPermission(
    connectionId: string,
    requestId: string,
    optionId: string
  ): Promise<void> {
    await this.request("/acp_respond_permission", {
      connectionId,
      requestId,
      optionId,
    })
  }

  /**
   * 响应智能体的多选/单选问题
   */
  async acpAnswerQuestion(
    connectionId: string,
    questionId: string,
    answer: QuestionAnswer
  ): Promise<void> {
    await this.request("/acp_answer_question", {
      connectionId,
      questionId,
      answer,
    })
  }

  /**
   * Fork 会话
   */
  async acpFork(connectionId: string): Promise<{
    forkedSessionId: string
    siblingConversationId: number
  }> {
    return await this.request("/acp_fork", { connectionId })
  }

  /**
   * 获取会话快照
   */
  async acpGetSessionSnapshot(connectionId: string): Promise<any> {
    return await this.request("/acp_get_session_snapshot", {
      connectionId,
      connection_id: connectionId,
    })
  }

  /**
   * 按会话获取会话快照
   */
  async acpGetSessionSnapshotByConversation(conversationId: number): Promise<any> {
    return await this.request("/acp_get_session_snapshot_by_conversation", {
      conversationId,
      conversation_id: conversationId,
    })
  }

  async acpFindConnectionForConversation(
    conversationId: number
  ): Promise<ConversationConnectionInfo | null> {
    return await this.request("/acp_find_connection_for_conversation", {
      conversationId,
      conversation_id: conversationId,
    })
  }

  /**
   * 列出所有连接
   */
  async acpListConnections(): Promise<ConnectionInfo[]> {
    return await this.request("/acp_list_connections", {})
  }

  /**
   * 上传附件
   */
  async uploadAttachment(
    file: File,
    sessionId?: string
  ): Promise<UploadAttachmentResult> {
    const formData = new FormData()
    formData.append("file", file)
    if (sessionId) {
      formData.append("sessionId", sessionId)
    }

    const response = await fetch(`${this.baseUrl}/upload_attachment`, {
      method: "POST",
      body: formData,
    })

    if (!response.ok) {
      throw new Error(`上传失败: ${response.statusText}`)
    }

    return await response.json()
  }

  /**
   * 创建会话
   */
  async createConversation(
    folderId: number,
    agentType: string,
    title?: string
  ): Promise<ConversationDetail> {
    return await this.request("/create_conversation", {
      folderId,
      agentType,
      title,
    })
  }

  /**
   * 获取会话详情
   */
  async getFolderConversation(conversationId: number): Promise<ConversationDetail> {
    return await this.request("/get_folder_conversation", { conversationId })
  }

  /**
   * 删除会话
   */
  async deleteConversation(conversationId: number): Promise<void> {
    await this.request("/delete_conversation", { conversationId })
  }

  /**
   * 订阅事件流
   */
  subscribeEvents(
    connectionId: string,
    callback: (event: EventEnvelope) => void,
    instanceKey?: string
  ) {
    const targetKey = this.resolveDescriptor(instanceKey).instanceKey
    const listenerKey = this.getEventListenerKey(targetKey, connectionId)
    if (!this.eventListeners.has(listenerKey)) {
      this.eventListeners.set(listenerKey, new Set())
    }
    this.eventListeners.get(listenerKey)!.add(callback)

    void this.connectEventSource(targetKey)

    return () => {
      const listeners = this.eventListeners.get(listenerKey)
      if (listeners) {
        listeners.delete(callback)
        if (listeners.size === 0) {
          this.eventListeners.delete(listenerKey)
        }
      }
    }
  }

  subscribeGlobalEvent(
    channel: string,
    callback: (payload: unknown) => void,
    instanceKey?: string
  ) {
    const targetKey = this.resolveDescriptor(instanceKey).instanceKey
    if (!this.globalListeners.has(targetKey)) {
      this.globalListeners.set(targetKey, new Map())
    }
    const scopedListeners = this.globalListeners.get(targetKey)!
    if (!scopedListeners.has(channel)) {
      scopedListeners.set(channel, new Set())
    }
    scopedListeners.get(channel)!.add(callback)

    void this.connectEventSource(targetKey)

    return () => {
      const listeners = scopedListeners.get(channel)
      if (listeners) {
        listeners.delete(callback)
        if (listeners.size === 0) {
          scopedListeners.delete(channel)
        }
      }
      if (scopedListeners.size === 0) {
        this.globalListeners.delete(targetKey)
      }
    }
  }

  subscribeOpenedTabsChanged(
    callback: (payload: unknown) => void,
    instanceKey?: string
  ) {
    return this.subscribeGlobalEvent("tabs://changed", callback, instanceKey)
  }

  subscribeRealtimeBridgeHealth(
    callback: (health: RealtimeBridgeHealth) => void,
    instanceKey?: string
  ) {
    const targetKey = this.resolveDescriptor(instanceKey).instanceKey
    if (!this.bridgeHealthListeners.has(targetKey)) {
      this.bridgeHealthListeners.set(targetKey, new Set())
    }
    this.bridgeHealthListeners.get(targetKey)!.add(callback)
    callback(this.getRealtimeBridgeHealth(targetKey))

    void this.connectEventSource(targetKey)

    return () => {
      const listeners = this.bridgeHealthListeners.get(targetKey)
      if (!listeners) return
      listeners.delete(callback)
      if (listeners.size === 0) {
        this.bridgeHealthListeners.delete(targetKey)
      }
    }
  }

  getRealtimeBridgeHealth(instanceKey?: string): RealtimeBridgeHealth {
    if (instanceKey && this.relayRecoveryStates.has(instanceKey)) {
      const bridge = this.bridgeStates.get(instanceKey)
      if (bridge) return this.buildBridgeHealth(instanceKey, bridge)
      return {
        instanceKey,
        state: "idle",
        reconnectAttempt: 0,
        nextRetryDelayMs: null,
        updatedAt: Date.now(),
        ...this.getBridgeRecoveryHealthPatch(instanceKey),
      }
    }
    const descriptor = this.resolveDescriptor(instanceKey)
    const bridge = this.bridgeStates.get(descriptor.instanceKey)
    if (!bridge) {
      return {
        instanceKey: descriptor.instanceKey,
        state: "idle",
        reconnectAttempt: 0,
        nextRetryDelayMs: null,
        updatedAt: Date.now(),
        ...this.getBridgeRecoveryHealthPatch(descriptor.instanceKey),
      }
    }
    return this.buildBridgeHealth(descriptor.instanceKey, bridge)
  }

  reconnectRealtimeBridge(instanceKey?: string) {
    const descriptor = this.resolveDescriptor(instanceKey)
    const bridge = this.bridgeStates.get(descriptor.instanceKey)
    if (!bridge) {
      return this.ensureRealtimeBridge(descriptor.instanceKey)
    }
    if (bridge.reconnectTimer) {
      clearTimeout(bridge.reconnectTimer)
      bridge.reconnectTimer = null
    }
    bridge.connection?.close()
    bridge.connection = null
    return this.ensureRealtimeBridge(descriptor.instanceKey)
  }

  private async connectEventSource(instanceKey?: string) {
    try {
      await this.ensureRealtimeBridge(instanceKey)
    } catch (error) {
      console.warn("建立实时桥接失败，回退到轮询:", error)
      this.emitBridgeHealth(this.resolveDescriptor(instanceKey).instanceKey, {
        instanceKey: this.resolveDescriptor(instanceKey).instanceKey,
        state: "polling",
        reconnectAttempt: 0,
        nextRetryDelayMs: null,
        updatedAt: Date.now(),
      })
      this.startPolling(instanceKey)
    }
  }

  private startPolling(instanceKey?: string) {
    if (this.pollingStarted) return
    this.pollingStarted = true
    this.pollingInstanceKey = instanceKey || this.getCurrentDescriptor().instanceKey
    const poll = async () => {
      let shouldContinue = true
      try {
        const events = await this.request("/acp_poll_events", {})
        if (Array.isArray(events)) {
          const targetKey = this.pollingInstanceKey || this.getCurrentDescriptor().instanceKey
          events.forEach((event: EventEnvelope) => {
            this.dispatchEvent(event, targetKey)
          })
        }
      } catch (error) {
        console.error("轮询事件失败:", error)
        const message = error instanceof Error ? error.message : String(error || "")
        if (
          message.includes("acp_poll_events") &&
          message.includes("not available in web mode")
        ) {
          shouldContinue = false
          this.pollingStarted = false
          this.pollingInstanceKey = null
        }
      }

      if (shouldContinue) {
        setTimeout(poll, 1000)
      }
    }

    poll()
  }

  /**
   * 分发事件到监听器
   */
  private dispatchEvent(event: EventEnvelope, instanceKey?: string) {
    const normalized = this.normalizeEventEnvelope(event)
    if (!normalized) return
    const targetKey = instanceKey || this.getCurrentDescriptor().instanceKey
    const listeners = this.eventListeners.get(
      this.getEventListenerKey(targetKey, normalized.connectionId)
    )
    if (listeners) {
      listeners.forEach((callback) => callback(normalized))
    }
  }

  normalizeRealtimeEvent(raw: unknown) {
    return this.normalizeEventEnvelope(raw as Record<string, unknown> | null | undefined)
  }

  getRelayRecoveryState(instanceKey?: string): RelayRecoveryState {
    const key = instanceKey || this.getCurrentDescriptor().instanceKey
    return this.getOrCreateRelayRecoveryState(key)
  }

  clearRelayRecoveryState(instanceKey?: string) {
    if (instanceKey) {
      this.relayRecoveryStates.delete(instanceKey)
      clearRelayCheckpoint(instanceKey)
      return
    }
    this.relayRecoveryStates.clear()
    clearRelayCheckpoints()
  }

  canUseAttachTransport(instanceKey?: string) {
    const key = this.resolveDescriptor(instanceKey).instanceKey
    return this.bridgeStates.get(key)?.attachCapable === true
  }

  getRealtimeTransport(instanceKey?: string) {
    const key = this.resolveDescriptor(instanceKey).instanceKey
    return this.bridgeStates.get(key)?.transport ?? getRealtimeTransport(key)
  }

  async ensureRealtimeBridge(instanceKey?: string) {
    const descriptor = this.resolveDescriptor(instanceKey)
    const targetKey = descriptor.instanceKey
    const activeBridge = this.bridgeStates.get(targetKey)
    if (activeBridge?.connection?.isOpen()) {
      return activeBridge
    }

    if (activeBridge?.reconnectTimer) {
      clearTimeout(activeBridge.reconnectTimer)
      activeBridge.reconnectTimer = null
    }

    const existing = this.ensureBridgePromises.get(targetKey)
    if (existing) return existing

    const promise = this.createRealtimeBridge(descriptor, activeBridge ?? null)
    this.ensureBridgePromises.set(targetKey, promise)
    try {
      return await promise
    } finally {
      this.ensureBridgePromises.delete(targetKey)
    }
  }

  private async createRealtimeBridge(
    descriptor: RemoteInstanceDescriptor,
    existingState: BridgeState | null
  ) {
    const targetKey = descriptor.instanceKey
    const gateway = this.createGatewayForDescriptor(descriptor)
    let eventConnection: Awaited<ReturnType<typeof gateway.connectEvents>> | null = null
    const readyCallbacks = new Set<() => void>()
    const host: RealtimeTransportHost = {
      isOpen: () => eventConnection?.isOpen() ?? false,
      sendFrame: (frame: object) => eventConnection?.send(frame) ?? false,
      onReady: (callback: () => void) => {
        readyCallbacks.add(callback)
        return () => {
          readyCallbacks.delete(callback)
        }
      },
    }
    const transport = getOrCreateRealtimeTransport(descriptor, host)
    const bridge: BridgeState = existingState ?? {
      descriptor,
      connection: null,
      transport,
      reconnectTimer: null,
      reconnectAttempt: 0,
      closedManually: false,
      attachCapable: true,
      detachReady: null,
      detachClose: null,
      detachError: null,
    }

    bridge.descriptor = descriptor
    bridge.transport = transport
    bridge.closedManually = false
    bridge.attachCapable = true
    bridge.connection = null
    bridge.detachReady?.()
    bridge.detachClose?.()
    bridge.detachError?.()
    bridge.detachReady = null
    bridge.detachClose = null
    bridge.detachError = null
    this.bridgeStates.set(targetKey, bridge)
    this.emitBridgeHealth(targetKey, this.buildBridgeHealth(targetKey, bridge))

    eventConnection = await gateway.connectEvents((raw) => {
      this.handleRelayRealtimeFrame(targetKey, raw, (frame) => {
        if (this.isAttachFrame(frame)) {
          transport.handleServerFrame(frame)
          return
        }
        const globalFrame = this.extractGlobalFrame(frame)
        if (globalFrame) {
          this.dispatchGlobalEvent(targetKey, globalFrame.channel, globalFrame.payload)
          return
        }
        const event = this.extractLegacyEvent(frame)
        if (event) {
          this.dispatchEvent(event, targetKey)
        }
      })
    }, {
      lastEventId: this.getOrCreateRelayRecoveryState(targetKey).lastRelayEventId,
    })
    bridge.connection = eventConnection
    bridge.detachReady = eventConnection.onReady(() => {
      bridge.reconnectAttempt = 0
      this.emitBridgeHealth(targetKey, this.buildBridgeHealth(targetKey, bridge))
      readyCallbacks.forEach((callback) => {
        try {
          callback()
        } catch (error) {
          console.error("实时桥接 ready 回调失败:", error)
        }
      })
    })
    bridge.detachClose = eventConnection.onClose(() => {
      bridge.connection = null
      this.handleBridgeDisconnect(targetKey, "close")
    })
    bridge.detachError = eventConnection.onError(() => {
      this.handleBridgeDisconnect(targetKey, "error")
    })
    if (eventConnection.isOpen()) {
      bridge.reconnectAttempt = 0
      this.emitBridgeHealth(targetKey, this.buildBridgeHealth(targetKey, bridge))
      readyCallbacks.forEach((callback) => {
        try {
          callback()
        } catch (error) {
          console.error("实时桥接 ready 回调失败:", error)
        }
      })
    }

    return bridge
  }

  /**
   * 通用请求方法
   */
  private async request(endpoint: string, data: any): Promise<any> {
    const auth = useAuthStore()
    const gateway = auth.gateway()
    const command = String(endpoint || "").replace(/^\/+/, "")
    return gateway.call(command, data ?? {})
  }

  private getCurrentDescriptor() {
    const auth = useAuthStore()
    return auth.currentRemoteInstance()
  }

  private resolveDescriptor(instanceKey?: string) {
    if (!instanceKey) return this.getCurrentDescriptor()

    const registered = getRegisteredRemoteInstanceDescriptor(instanceKey)
    if (registered) return registered

    const current = this.getCurrentDescriptor()
    if (current.instanceKey === instanceKey) {
      return current
    }

    throw new Error(`No remote descriptor registered for instanceKey: ${instanceKey}`)
  }

  private createGatewayForDescriptor(descriptor: RemoteInstanceDescriptor) {
    if (descriptor.mode === "direct") {
      return createGateway({
        mode: "direct",
        directBaseUrl: descriptor.baseUrl,
      })
    }

    const session: RelaySessionInfo = {
      accessToken: descriptor.authToken || "",
      refreshToken: descriptor.refreshToken,
      targetId: descriptor.principal,
    }
    return createGateway({
      mode: "relay",
      relayUrl: descriptor.baseUrl,
      session,
    })
  }

  private getEventListenerKey(instanceKey: string, connectionId: string) {
    return `${instanceKey}::${connectionId}`
  }

  private handleBridgeDisconnect(instanceKey: string, reason: "close" | "error") {
    const bridge = this.bridgeStates.get(instanceKey)
    if (!bridge || bridge.closedManually) return
    bridge.detachReady?.()
    bridge.detachClose?.()
    bridge.detachError?.()
    bridge.detachReady = null
    bridge.detachClose = null
    bridge.detachError = null
    bridge.connection = null
    this.emitBridgeHealth(instanceKey, this.buildBridgeHealth(instanceKey, bridge, reason))
    this.scheduleReconnect(instanceKey, reason)
  }

  private scheduleReconnect(instanceKey: string, reason: "close" | "error") {
    const bridge = this.bridgeStates.get(instanceKey)
    if (!bridge || bridge.closedManually || bridge.reconnectTimer) return

    const delay = Math.min(30_000, 1000 * 2 ** bridge.reconnectAttempt)
    bridge.reconnectAttempt += 1
    this.emitBridgeHealth(instanceKey, {
      instanceKey,
      state: "reconnecting",
      reason,
      reconnectAttempt: bridge.reconnectAttempt,
      nextRetryDelayMs: delay,
      updatedAt: Date.now(),
    })
    bridge.reconnectTimer = setTimeout(() => {
      const active = this.bridgeStates.get(instanceKey)
      if (!active) return
      active.reconnectTimer = null
      if (active.closedManually) return
      void this.ensureRealtimeBridge(instanceKey).catch((error) => {
        console.warn("实时桥接重连失败:", {
          instanceKey,
          reason,
          error,
        })
        this.emitBridgeHealth(instanceKey, {
          instanceKey,
          state: "error",
          reason,
          reconnectAttempt: active.reconnectAttempt,
          nextRetryDelayMs: null,
          updatedAt: Date.now(),
        })
        this.scheduleReconnect(instanceKey, reason)
      })
    }, delay)
  }

  private emitBridgeHealth(instanceKey: string, health: RealtimeBridgeHealth) {
    const listeners = this.bridgeHealthListeners.get(instanceKey)
    if (!listeners) return
    listeners.forEach((callback) => callback(health))
  }

  private buildBridgeHealth(
    instanceKey: string,
    bridge: BridgeState,
    reason?: "close" | "error"
  ): RealtimeBridgeHealth {
    return {
      instanceKey,
      state: bridge.connection?.isOpen()
        ? "connected"
        : bridge.reconnectTimer
          ? "reconnecting"
          : "error",
      reason,
      reconnectAttempt: bridge.reconnectAttempt,
      nextRetryDelayMs: null,
      updatedAt: Date.now(),
      ...this.getBridgeRecoveryHealthPatch(instanceKey),
    }
  }

  private getOrCreateRelayRecoveryState(instanceKey: string): RelayRecoveryState {
    const existing = this.relayRecoveryStates.get(instanceKey)
    if (existing) return existing
    const stored = readRelayCheckpoint(instanceKey)
    const created: RelayRecoveryState = {
      lastRelayEventId: stored?.lastRelayEventId ?? null,
      replayWindowStart: null,
      requestedLastEventId: null,
      recoveryIssue: null,
      recoveryMessage: null,
    }
    this.relayRecoveryStates.set(instanceKey, created)
    return created
  }

  private getBridgeRecoveryHealthPatch(instanceKey: string) {
    const recovery = this.relayRecoveryStates.get(instanceKey)
    if (!recovery) return {}
    return {
      recoveryIssue: recovery.recoveryIssue,
      lastRelayEventId: recovery.lastRelayEventId,
      replayWindowStart: recovery.replayWindowStart,
      requestedLastEventId: recovery.requestedLastEventId,
      recoveryMessage: recovery.recoveryMessage,
    }
  }

  private handleRelayRealtimeFrame(
    instanceKey: string,
    raw: unknown,
    dispatchPayload: (payload: unknown) => void
  ) {
    const frame = classifyRelayRealtimeFrame(raw)
    const recovery = this.getOrCreateRelayRecoveryState(instanceKey)
    if (frame.kind === "ready") {
      recovery.replayWindowStart = frame.replayWindowStart ?? recovery.replayWindowStart
      recovery.lastRelayEventId = frame.lastEventId ?? recovery.lastRelayEventId
      recovery.recoveryIssue = null
      recovery.recoveryMessage = null
      return
    }
    if (frame.kind === "replay_miss") {
      recovery.recoveryIssue = "replay_miss"
      recovery.requestedLastEventId = frame.requestedLastEventId ?? null
      recovery.replayWindowStart = frame.replayWindowStart ?? null
      recovery.lastRelayEventId = frame.lastEventId ?? recovery.lastRelayEventId
      recovery.recoveryMessage = "实时事件有缺口，正在刷新会话状态。部分中间状态可能已跳过。"
      this.persistRelayCheckpoint(instanceKey, recovery.lastRelayEventId)
      this.emitBridgeHealth(instanceKey, this.buildBridgeHealthForInstance(instanceKey))
      void this.calibrateActiveConversationsAfterReplayMiss(instanceKey)
      return
    }
    if (frame.kind === "event") {
      dispatchPayload({
        eventId: frame.eventId,
        channel: frame.channel,
        payload: frame.payload,
        controllerId: frame.controllerId,
        localEventId: frame.localEventId,
      })
      recovery.lastRelayEventId = frame.eventId
      recovery.recoveryIssue = null
      recovery.recoveryMessage = null
      this.persistRelayCheckpoint(instanceKey, recovery.lastRelayEventId)
      return
    }
    dispatchPayload(frame.payload)
  }

  __handleRelayRealtimeFrameForTest(
    instanceKey: string,
    raw: unknown,
    dispatchPayload: (payload: unknown) => void
  ) {
    return this.handleRelayRealtimeFrame(instanceKey, raw, dispatchPayload)
  }

  __setReplayMissCalibrationHookForTest(
    hook: ((instanceKey: string) => Promise<void> | void) | null
  ) {
    this.replayMissCalibrationHook = hook
  }

  private buildBridgeHealthForInstance(instanceKey: string): RealtimeBridgeHealth {
    const bridge = this.bridgeStates.get(instanceKey)
    if (bridge) return this.buildBridgeHealth(instanceKey, bridge)
    return {
      instanceKey,
      state: "idle",
      reconnectAttempt: 0,
      nextRetryDelayMs: null,
      updatedAt: Date.now(),
      ...this.getBridgeRecoveryHealthPatch(instanceKey),
    }
  }

  private async calibrateActiveConversationsAfterReplayMiss(instanceKey: string) {
    if (this.replayMissCalibrationHook) {
      await this.replayMissCalibrationHook(instanceKey)
      return
    }
    const { calibrateActiveConversationsForInstance } = await import(
      "@/services/conversation/conversationSyncService"
    )
    await calibrateActiveConversationsForInstance(instanceKey)
  }

  private persistRelayCheckpoint(instanceKey: string, lastRelayEventId: number | null) {
    if (
      typeof lastRelayEventId !== "number" ||
      !Number.isFinite(lastRelayEventId) ||
      lastRelayEventId <= 0
    ) {
      return
    }
    upsertRelayCheckpoint(instanceKey, Math.trunc(lastRelayEventId))
  }

  private normalizeEventEnvelope(event: EventEnvelope | Record<string, unknown> | null | undefined) {
    if (!event || typeof event !== "object") return null
    const record = event as Record<string, unknown>
    const connectionId = String(record.connectionId || record.connection_id || "").trim()
    const rawType = String(record.type || "").trim()
    if (!connectionId || !rawType) return null

    const normalized = this.normalizeAcpEventRecord(connectionId, rawType, record)
    if (normalized) {
      normalized.seq = firstNumber(record.seq) ?? undefined
      return normalized
    }

    if ("data" in record) {
      return {
        connectionId,
        seq: firstNumber(record.seq) ?? undefined,
        data: record.data as EventEnvelope["data"],
        type: rawType as EventEnvelope["type"],
      } as EventEnvelope
    }

    return null
  }

  private extractLegacyEvent(raw: unknown) {
    if (!raw || typeof raw !== "object") return null
    const record = raw as Record<string, unknown>
    if (record.channel === "acp://event") {
      return this.normalizeEventEnvelope(record.payload as Record<string, unknown>)
    }
    return this.normalizeEventEnvelope(record)
  }

  private extractGlobalFrame(raw: unknown) {
    if (!raw || typeof raw !== "object") return null
    const record = raw as Record<string, unknown>
    const channel = typeof record.channel === "string" ? record.channel.trim() : ""
    if (!channel || channel === "acp://event") return null
    return {
      channel,
      payload: "payload" in record ? record.payload : raw,
    }
  }

  private dispatchGlobalEvent(instanceKey: string, channel: string, payload: unknown) {
    const listeners = this.globalListeners.get(instanceKey)?.get(channel)
    if (!listeners) return
    listeners.forEach((callback) => {
      try {
        callback(payload)
      } catch (error) {
        console.error("全局事件处理失败:", error)
      }
    })
  }

  private isAttachFrame(raw: unknown) {
    if (!raw || typeof raw !== "object") return false
    const type = String((raw as Record<string, unknown>).type || "").trim()
    return (
      type === "snapshot" ||
      type === "replay" ||
      type === "event" ||
      type === "detached" ||
      type === "pong"
    )
  }

  private normalizeAcpEventRecord(
    connectionId: string,
    rawType: string,
    record: Record<string, unknown>
  ): EventEnvelope | null {
    switch (rawType) {
      case "content_delta":
        return {
          connectionId,
          type: "stream_batch",
          data: {
            delta: firstString(record.text),
            contentType: "text",
          },
        }
      case "thinking":
        return {
          connectionId,
          type: "stream_batch",
          data: {
            delta: firstString(record.text),
            contentType: "thinking",
          },
        }
      case "plan_update":
        return {
          connectionId,
          type: "stream_batch",
          data: {
            delta: JSON.stringify(record.entries ?? []),
            contentType: "plan",
            entries: Array.isArray(record.entries) ? record.entries : [],
          },
        }
      case "tool_call":
        return {
          connectionId,
          type: "tool_call",
          data: {
            id: firstString(record.tool_call_id, record.toolCallId),
            name: firstString(record.title, record.name),
            input: parseJsonRecord(record.raw_input) ?? {},
            status: mapToolCallStatus(firstString(record.status)),
            kind: firstString(record.kind),
            content: firstString(record.content),
            rawInput: firstString(record.raw_input),
            rawOutput: firstString(record.raw_output),
            locations: record.locations,
            meta: record.meta,
            images: Array.isArray(record.images) ? record.images : [],
          },
        }
      case "tool_call_update":
        return {
          connectionId,
          type: "tool_call_update",
          data: {
            id: firstString(record.tool_call_id, record.toolCallId),
            output:
              firstString(record.content) ||
              firstString(record.raw_output) ||
              undefined,
            error: extractErrorText(record.raw_output),
            status: mapToolCallStatus(firstString(record.status)) || undefined,
            title: firstString(record.title) || undefined,
            rawOutput: firstString(record.raw_output) || undefined,
            rawOutputAppend: record.raw_output_append === true,
            locations: record.locations,
            meta: record.meta,
            images: Array.isArray(record.images) ? record.images : undefined,
          },
        }
      case "status_changed":
        return {
          connectionId,
          type: "status_changed",
          data: {
            status: mapConnectionStatus(firstString(record.status)),
            message: firstString(record.message) || undefined,
            scope: "connection",
          },
        }
      case "conversation_status_changed":
        return {
          connectionId,
          type: "status_changed",
          data: {
            status: mapConversationStatus(firstString(record.status)),
            scope: "conversation",
          },
        }
      case "turn_cancel_requested":
        {
          const source = toRecord(record.data) ?? record
          return {
            connectionId,
            type: "turn_cancel_requested",
            data: {
              sessionId: firstString(source.session_id, source.sessionId),
              activeTurnId: firstString(source.active_turn_id, source.activeTurnId),
              activeTurnOwnerClientId:
                firstString(source.active_turn_owner_client_id, source.activeTurnOwnerClientId) || null,
              cancelRequestedByClientId:
                firstString(source.cancel_requested_by_client_id, source.cancelRequestedByClientId) || null,
              cancelRequestedAtMs:
                firstNumber(source.cancel_requested_at_ms, source.cancelRequestedAtMs) ?? null,
              reason: firstString(source.reason, source.cancel_reason, source.cancelReason) || null,
            },
          }
        }
      case "turn_cancelled":
        {
          const source = toRecord(record.data) ?? record
          return {
            connectionId,
            type: "turn_cancelled",
            data: {
              sessionId: firstString(source.session_id, source.sessionId),
              activeTurnId: firstString(source.active_turn_id, source.activeTurnId),
              cancelRequestedByClientId:
                firstString(source.cancel_requested_by_client_id, source.cancelRequestedByClientId) || null,
              status: firstString(source.status) || "canceled",
            },
          }
        }
      case "turn_cancel_failed":
        {
          const source = toRecord(record.data) ?? record
          return {
            connectionId,
            type: "turn_cancel_failed",
            data: {
              sessionId: firstString(source.session_id, source.sessionId),
              activeTurnId: firstString(source.active_turn_id, source.activeTurnId),
              cancelRequestedByClientId:
                firstString(source.cancel_requested_by_client_id, source.cancelRequestedByClientId) || null,
              message: firstString(source.message) || null,
            },
          }
        }
      case "turn_queued":
      case "turn_queue_updated":
      case "turn_dequeued":
      case "turn_started":
      case "turn_queue_cancelled":
      case "turn_queue_failed":
        {
          const source = toRecord(record.data) ?? record
          return {
            connectionId,
            type: rawType as EventEnvelope["type"],
            data: normalizeTurnQueueEventData(source),
          }
        }
      case "turn_complete":
        return {
          connectionId,
          type: "turn_complete",
          data: {
            sessionId: firstString(record.session_id, record.sessionId),
            stopReason: firstString(record.stop_reason, record.stopReason),
            agentType: firstString(record.agent_type, record.agentType),
            timestamp: firstNumber(record.timestamp, record.created_at, record.createdAt),
            liveMessage:
              record.live_message ||
              record.liveMessage ||
              record.final_live_message ||
              record.finalLiveMessage ||
              null,
          },
        }
      case "usage_update":
        return {
          connectionId,
          type: "usage_update",
          data: {
            inputTokens: firstNumber(record.used) ?? 0,
            outputTokens: 0,
            totalTokens: firstNumber(record.used) ?? 0,
            size: firstNumber(record.size) ?? 0,
          },
        }
      case "permission_request":
        return {
          connectionId,
          type: "permission_request",
          data: {
            id: firstString(record.request_id, record.requestId),
            description: describePermission(record.tool_call),
            details: record.tool_call,
            toolCall: record.tool_call,
            options: Array.isArray(record.options)
              ? record.options.map((option) => ({
                id: firstString((option as Record<string, unknown>)?.option_id, (option as Record<string, unknown>)?.id),
                label:
                  firstString((option as Record<string, unknown>)?.name, (option as Record<string, unknown>)?.label) ||
                  firstString((option as Record<string, unknown>)?.kind),
                description: firstString((option as Record<string, unknown>)?.kind) || undefined,
              }))
              : [],
          },
        }
      case "permission_resolved":
        return {
          connectionId,
          type: "permission_resolved",
          data: {
            requestId: firstString(record.request_id, record.requestId),
            responderClientId:
              firstString(record.responder_client_id, record.responderClientId) || null,
          },
        }
      case "question_request":
        {
          const source = toRecord(record.data) ?? record
          return {
            connectionId,
            type: "question_request",
            data: {
              questionId: firstString(source.question_id, source.questionId),
              questions: Array.isArray(source.questions) ? source.questions : [],
              createdAt:
                firstString(source.created_at, source.createdAt) ||
                new Date().toISOString(),
            },
          }
        }
      case "question_resolved":
        {
          const source = toRecord(record.data) ?? record
          return {
            connectionId,
            type: "question_resolved",
            data: {
              questionId: firstString(source.question_id, source.questionId),
              responderClientId:
                firstString(source.responder_client_id, source.responderClientId) || null,
            },
          }
        }
      case "claude_sdk_message": {
        const message = toRecord(record.message)
        if (
          firstString(message?.type) !== "system" ||
          firstString(message?.subtype) !== "api_retry"
        ) {
          return null
        }
        return {
          connectionId,
          type: "api_retry",
          data: {
            sessionId: firstString(message?.session_id, record.session_id, record.sessionId) || undefined,
            attempt: firstNumber(message?.attempt),
            maxRetries: firstNumber(message?.max_retries),
            error: firstString(message?.error) || undefined,
            errorStatus: firstNumber(message?.error_status),
            retryDelayMs: firstNumber(message?.retry_delay_ms),
          },
        }
      }
      case "error":
        return {
          connectionId,
          type: "error",
          data: {
            message: firstString(record.message) || "请求失败",
            code: firstString(record.code) || undefined,
            agentType: firstString(record.agent_type, record.agentType) || undefined,
          },
        }
      default:
        return null
    }
  }
}

// 导出单例
export const acpApi = new AcpApiClient()

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}

function parseJsonRecord(raw: unknown) {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>
  if (typeof raw !== "string" || !raw.trim()) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function toRecord(raw: unknown) {
  return raw && typeof raw === "object" ? raw as Record<string, unknown> : null
}

function normalizeTurnQueueEventData(source: Record<string, unknown>) {
  return {
    sessionId: firstString(source.session_id, source.sessionId) || null,
    queueItemId: firstString(source.queue_item_id, source.queueItemId) || null,
    queuePosition:
      firstNumber(source.queue_position, source.queuePosition) ?? null,
    queueLength:
      firstNumber(source.queue_length, source.queueLength) ?? null,
    sourceClientId:
      firstString(source.source_client_id, source.sourceClientId) || null,
    sourceDeviceName:
      firstString(source.source_device_name, source.sourceDeviceName) || null,
    promptPreview:
      firstString(source.prompt_preview, source.promptPreview) || null,
    createdAtMs:
      firstNumber(source.created_at_ms, source.createdAtMs) ?? null,
    activeTurnId:
      firstString(source.active_turn_id, source.activeTurnId) || null,
    message: firstString(source.message, source.error) || null,
    runtime: firstString(source.runtime) || null,
    agentType: firstString(source.agent_type, source.agentType) || null,
  }
}

function extractErrorText(rawOutput: unknown) {
  const parsed = parseJsonRecord(rawOutput)
  const message = firstString(parsed?.error, parsed?.message)
  return message || undefined
}

function mapConnectionStatus(status: string) {
  switch (status) {
    case "waiting_question":
      return "waiting_question"
    case "waiting_permission":
      return "waiting_permission"
    case "prompting":
      return "thinking"
    case "error":
      return "error"
    case "disconnected":
      return "idle"
    default:
      return "connected"
  }
}

function mapConversationStatus(status: string) {
  switch (status) {
    case "in_progress":
      return "thinking"
    case "pending_review":
    case "completed":
    case "cancelled":
      return "idle"
    default:
      return "connected"
  }
}

function describePermission(toolCall: unknown) {
  if (!toolCall || typeof toolCall !== "object") return ""
  const record = toolCall as Record<string, unknown>
  return (
    firstString(record.title, record.name, record.kind) ||
    firstString(record.tool_call_id, record.toolCallId)
  )
}

function mapToolCallStatus(status: string) {
  if (status === "completed") return "completed"
  if (status === "failed" || status === "error") return "error"
  return "running"
}
