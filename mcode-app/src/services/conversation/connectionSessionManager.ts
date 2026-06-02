import { acpApi } from "@/api/acp"
import { useAuthStore } from "@/stores/auth"
import type { ConnectionInfo } from "@/types/acp"

export interface ManagedConversationConnection {
  conversationId: number
  instanceKey: string
  connectionId: string
  connection: ConnectionInfo
  externalId?: string | null
  status: "idle" | "connecting" | "connected" | "error"
  lastTouchedAt: number
}

const byConversationId = new Map<number, ManagedConversationConnection>()
const byConnectionId = new Map<string, ManagedConversationConnection>()

function getCurrentInstanceKey() {
  const auth = useAuthStore()
  return auth.currentRemoteInstance().instanceKey
}

export const connectionSessionManager = {
  async connectConversation(input: {
    conversationId: number
    agentType: string
    workingDir?: string
    sessionId?: string
    instanceKey?: string
  }) {
    const existing = byConversationId.get(input.conversationId)
    if (existing?.connectionId) {
      existing.lastTouchedAt = Date.now()
      return existing
    }

    const instanceKey = input.instanceKey || getCurrentInstanceKey()
    const connection = await acpApi.acpConnect(
      input.agentType,
      input.workingDir,
      input.sessionId
    )

    const managed: ManagedConversationConnection = {
      conversationId: input.conversationId,
      instanceKey,
      connectionId: connection.id,
      connection,
      externalId: connection.sessionId || null,
      status: "connected",
      lastTouchedAt: Date.now(),
    }

    byConversationId.set(input.conversationId, managed)
    byConnectionId.set(connection.id, managed)
    return managed
  },

  getByConversationId(conversationId: number) {
    return byConversationId.get(conversationId) ?? null
  },

  getByConnectionId(connectionId: string) {
    return byConnectionId.get(connectionId) ?? null
  },

  touchConversation(conversationId: number) {
    const managed = byConversationId.get(conversationId)
    if (!managed) return
    managed.lastTouchedAt = Date.now()
  },

  touchConnection(connectionId: string) {
    const managed = byConnectionId.get(connectionId)
    if (!managed) return
    managed.lastTouchedAt = Date.now()
  },

  async disconnectConversation(conversationId: number) {
    const managed = byConversationId.get(conversationId)
    if (!managed) return
    await acpApi.acpDisconnect(managed.connectionId)
    byConversationId.delete(conversationId)
    byConnectionId.delete(managed.connectionId)
  },

  clearConversation(conversationId: number) {
    const managed = byConversationId.get(conversationId)
    if (!managed) return
    byConversationId.delete(conversationId)
    byConnectionId.delete(managed.connectionId)
  },

  async sweepInactiveConversations(now = Date.now()) {
    const staleBefore = now - 10 * 60_000
    const staleConversations = Array.from(byConversationId.values())
      .filter((item) => item.lastTouchedAt < staleBefore)
      .map((item) => item.conversationId)

    for (const conversationId of staleConversations) {
      await this.disconnectConversation(conversationId).catch(() => {})
    }
  },
}
