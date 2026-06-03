import type {
  PromptInputBlock,
  ConnectionInfo,
  EventEnvelope,
  UploadAttachmentResult,
  ConversationDetail,
} from "@/types/acp"
import { useAuthStore } from "@/stores/auth"
import { destroyRealtimeTransport, getOrCreateRealtimeTransport, getRealtimeTransport } from "@/services/realtime/transport-registry"
import type { RealtimeTransport, RealtimeTransportHost, RemoteInstanceDescriptor } from "@/services/realtime/types"

/**
 * ACP API 客户端
 * 封装所有与 ACP 服务的通信
 */
class AcpApiClient {
  private baseUrl: string
  private eventListeners: Map<string, Set<(event: EventEnvelope) => void>>
  private eventSource: any = null
  private pollingStarted = false
  private ensureBridgePromises = new Map<string, Promise<any>>()
  private realtimeBridges = new Map<string, {
    descriptor: RemoteInstanceDescriptor
    transport: RealtimeTransport
    detach: () => void
    attachCapable: boolean
  }>()

  constructor(baseUrl: string = "") {
    this.baseUrl = baseUrl
    this.eventListeners = new Map()
  }

  /**
   * 连接到 ACP 代理
   */
  async acpConnect(
    agentType: string,
    workingDir?: string,
    sessionId?: string,
    preferredModeId?: string
  ): Promise<ConnectionInfo> {
    const response = await this.request("/acp_connect", {
      agentType,
      workingDir,
      sessionId,
      preferredModeId,
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
  ): Promise<void> {
    await this.request("/acp_prompt", {
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
    if (!this.eventListeners.has(connectionId)) {
      this.eventListeners.set(connectionId, new Set())
    }
    this.eventListeners.get(connectionId)!.add(callback)

    // 如果还没有建立 EventSource 连接，则建立
    if (!this.eventSource) {
      void this.connectEventSource(instanceKey)
    }

    // 返回取消订阅函数
    return () => {
      const listeners = this.eventListeners.get(connectionId)
      if (listeners) {
        listeners.delete(callback)
        if (listeners.size === 0) {
          this.eventListeners.delete(connectionId)
        }
      }
    }
  }

  /**
   * 建立 EventSource 连接
   */
  private async connectEventSource(instanceKey?: string) {
    try {
      await this.ensureRealtimeBridge(instanceKey)
      this.eventSource = { type: "bridge" }
    } catch (error) {
      console.warn("建立实时桥接失败，回退到轮询:", error)
      this.startPolling()
      this.eventSource = { type: "polling" }
    }
  }

  /**
   * 开始轮询事件
   */
  private startPolling() {
    if (this.pollingStarted) return
    this.pollingStarted = true
    const poll = async () => {
      let shouldContinue = true
      try {
        const events = await this.request("/acp_poll_events", {})
        if (Array.isArray(events)) {
          events.forEach((event: EventEnvelope) => {
            this.dispatchEvent(event)
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
          this.eventSource = null
        }
      }

      // 继续轮询
      if (shouldContinue) {
        setTimeout(poll, 1000)
      }
    }

    poll()
  }

  /**
   * 分发事件到监听器
   */
  private dispatchEvent(event: EventEnvelope) {
    const normalized = this.normalizeEventEnvelope(event)
    if (!normalized) return
    const listeners = this.eventListeners.get(normalized.connectionId)
    if (listeners) {
      listeners.forEach((callback) => callback(normalized))
    }
  }

  normalizeRealtimeEvent(raw: unknown) {
    return this.normalizeEventEnvelope(raw as Record<string, unknown> | null | undefined)
  }

  canUseAttachTransport(instanceKey?: string) {
    const key = instanceKey || this.getCurrentDescriptor().instanceKey
    return this.realtimeBridges.get(key)?.attachCapable === true
  }

  getRealtimeTransport(instanceKey?: string) {
    const key = instanceKey || this.getCurrentDescriptor().instanceKey
    return this.realtimeBridges.get(key)?.transport ?? getRealtimeTransport(key)
  }

  async ensureRealtimeBridge(instanceKey?: string) {
    const descriptor = this.getCurrentDescriptor()
    const targetKey = instanceKey || descriptor.instanceKey
    if (this.realtimeBridges.has(targetKey)) {
      return this.realtimeBridges.get(targetKey)!
    }

    // 防止并发调用导致 uni.connectSocket 重复创建（Android 会报 "same name already open"）
    const existing = this.ensureBridgePromises.get(targetKey)
    if (existing) return existing

    const promise = this.createRealtimeBridge(targetKey, descriptor)
    this.ensureBridgePromises.set(targetKey, promise)
    try {
      return await promise
    } finally {
      this.ensureBridgePromises.delete(targetKey)
    }
  }

  private async createRealtimeBridge(targetKey: string, descriptor: RemoteInstanceDescriptor) {
    const auth = useAuthStore()
    const gateway = auth.gateway()
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

    eventConnection = await gateway.connectEvents((raw) => {
      if (this.isAttachFrame(raw)) {
        transport.handleServerFrame(raw)
        return
      }
      const event = this.extractLegacyEvent(raw)
      if (event) {
        this.dispatchEvent(event)
      }
    })
    eventConnection.onReady(() => {
      readyCallbacks.forEach((callback) => {
        try {
          callback()
        } catch (error) {
          console.error("实时桥接 ready 回调失败:", error)
        }
      })
    })
    if (eventConnection.isOpen()) {
      readyCallbacks.forEach((callback) => {
        try {
          callback()
        } catch (error) {
          console.error("实时桥接 ready 回调失败:", error)
        }
      })
    }

    const detach = () => {
      eventConnection.close()
      destroyRealtimeTransport(targetKey)
      this.realtimeBridges.delete(targetKey)
    }

    const bridge = {
      descriptor,
      transport,
      detach,
      attachCapable: true,
    }
    this.realtimeBridges.set(targetKey, bridge)
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
          },
        }
      case "conversation_status_changed":
        return {
          connectionId,
          type: "status_changed",
          data: {
            status: mapConversationStatus(firstString(record.status)),
          },
        }
      case "turn_complete":
        return {
          connectionId,
          type: "turn_complete",
          data: {
            sessionId: firstString(record.session_id, record.sessionId),
            stopReason: firstString(record.stop_reason, record.stopReason),
            agentType: firstString(record.agent_type, record.agentType),
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

function extractErrorText(rawOutput: unknown) {
  const parsed = parseJsonRecord(rawOutput)
  const message = firstString(parsed?.error, parsed?.message)
  return message || undefined
}

function mapConnectionStatus(status: string) {
  switch (status) {
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
