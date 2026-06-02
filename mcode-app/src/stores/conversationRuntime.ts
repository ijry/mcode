import { defineStore } from "pinia"
import { ref, computed } from "vue"
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
  detachConversationRealtime,
  unbindConversationEventHandler,
} from "@/services/conversation/conversationSyncService"

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

    // 找到或创建对应类型的内容部分
    let part = session.liveMessage.content.find((p) => p.type === contentType)
    if (!part) {
      part = {
        type: contentType as any,
        [contentType]: "",
      }
      session.liveMessage.content.push(part)
    }

    // 追加内容
    if (contentType === "text") {
      part.text = (part.text || "") + delta
    } else if (contentType === "thinking") {
      part.thinking = (part.thinking || "") + delta
    }
  }

  /**
   * 完成当前轮次
   */
  function completeTurn(conversationId: number) {
    const session = getOrCreateSession(conversationId)

    // 将乐观消息移到本地
    if (session.optimisticTurns.length > 0) {
      session.localTurns.push(...session.optimisticTurns)
      session.optimisticTurns = []
    }

    // 将流式消息移到本地
    if (session.liveMessage) {
      session.localTurns.push({
        id: `turn-${Date.now()}`,
        role: "assistant",
        content: session.liveMessage.content,
        timestamp: session.liveMessage.timestamp,
        status: "completed",
      })
      session.liveMessage = null
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

      case "turn_complete":
        completeTurn(session.conversationId)
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
  status: "idle" | "connecting" | "connected" | "thinking" | "error"
  stats: SessionStats
}
