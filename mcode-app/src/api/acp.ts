import type {
  PromptInputBlock,
  ConnectionInfo,
  EventEnvelope,
  UploadAttachmentResult,
  ConversationDetail,
} from "@/types/acp"

/**
 * ACP API 客户端
 * 封装所有与 ACP 服务的通信
 */
class AcpApiClient {
  private baseUrl: string
  private eventListeners: Map<string, Set<(event: EventEnvelope) => void>>
  private eventSource: any = null

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
    return response
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
    return await this.request("/acp_get_session_snapshot", { connectionId })
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
  subscribeEvents(connectionId: string, callback: (event: EventEnvelope) => void) {
    if (!this.eventListeners.has(connectionId)) {
      this.eventListeners.set(connectionId, new Set())
    }
    this.eventListeners.get(connectionId)!.add(callback)

    // 如果还没有建立 EventSource 连接，则建立
    if (!this.eventSource) {
      this.connectEventSource()
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
  private connectEventSource() {
    // 在 uni-app 中，我们需要使用 WebSocket 或轮询来模拟 EventSource
    // 这里使用轮询方式
    this.startPolling()
  }

  /**
   * 开始轮询事件
   */
  private startPolling() {
    const poll = async () => {
      try {
        const events = await this.request("/acp_poll_events", {})
        if (Array.isArray(events)) {
          events.forEach((event: EventEnvelope) => {
            this.dispatchEvent(event)
          })
        }
      } catch (error) {
        console.error("轮询事件失败:", error)
      }

      // 继续轮询
      setTimeout(poll, 1000)
    }

    poll()
  }

  /**
   * 分发事件到监听器
   */
  private dispatchEvent(event: EventEnvelope) {
    const listeners = this.eventListeners.get(event.connectionId)
    if (listeners) {
      listeners.forEach((callback) => callback(event))
    }
  }

  /**
   * 通用请求方法
   */
  private async request(endpoint: string, data: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`请求失败: ${error}`)
    }

    return await response.json()
  }
}

// 导出单例
export const acpApi = new AcpApiClient()
