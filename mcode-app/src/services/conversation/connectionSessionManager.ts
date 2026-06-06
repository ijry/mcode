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
  role: "owner" | "viewer"
  sharedLive: boolean
  detachOnly: boolean
  allowSend: boolean
  lastTouchedAt: number
}

const byConversationId = new Map<number, ManagedConversationConnection>()
const byConnectionId = new Map<string, ManagedConversationConnection>()

function getCurrentInstanceKey() {
  const auth = useAuthStore()
  return auth.currentRemoteInstance().instanceKey
}

export const connectionSessionManager = {
  adoptConversation(input: {
    conversationId: number
    instanceKey?: string
    connectionId: string
    agentType: string
    sessionId?: string | null
    status?: ConnectionInfo["status"]
    role?: "owner" | "viewer"
    sharedLive?: boolean
    detachOnly?: boolean
    allowSend?: boolean
  }) {
    const instanceKey = input.instanceKey || getCurrentInstanceKey()
    const managed: ManagedConversationConnection = {
      conversationId: input.conversationId,
      instanceKey,
      connectionId: input.connectionId,
      connection: {
        id: input.connectionId,
        agentType: input.agentType,
        sessionId: input.sessionId || "",
        status: input.status || "connected",
      },
      externalId: input.sessionId || null,
      status: "connected",
      role: input.role || "owner",
      sharedLive: input.sharedLive ?? false,
      detachOnly: input.detachOnly ?? false,
      allowSend: input.allowSend ?? true,
      lastTouchedAt: Date.now(),
    }
    byConversationId.set(input.conversationId, managed)
    byConnectionId.set(input.connectionId, managed)
    return managed
  },

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
      role: "owner",
      sharedLive: true,
      detachOnly: true,
      allowSend: true,
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

  setConversationSendAllowed(conversationId: number, allowSend: boolean) {
    const managed = byConversationId.get(conversationId)
    if (!managed) return
    managed.allowSend = allowSend
    managed.lastTouchedAt = Date.now()
  },

  setConversationRole(
    conversationId: number,
    role: "owner" | "viewer",
    sharedLive = role === "viewer"
  ) {
    const managed = byConversationId.get(conversationId)
    if (!managed) return
    managed.role = role
    managed.sharedLive = sharedLive
    managed.detachOnly = true
    managed.lastTouchedAt = Date.now()
  },

  async disconnectConversation(conversationId: number) {
    const managed = byConversationId.get(conversationId)
    if (!managed) return
    if (!managed.detachOnly) {
      await acpApi.acpDisconnect(managed.connectionId)
    }
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
