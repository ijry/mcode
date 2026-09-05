import { acpApi } from "@/api/acp"
import { useAuthStore } from "@/stores/auth"
import { readConversationSessionSelection } from "@/services/conversation/sessionModeMemory"
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
    capabilities?: string[]
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
        capabilities: input.capabilities || [],
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
    /*
     * 把用户在这条会话里显式选过的授权模式 / 配置取值一起交上去。
     *
     * 必须在这里交，因为 ACP 会话的模式活在 agent 进程里，而 codeg-plus 会把空闲连接
     * 收走（`acp/manager.rs::sweep_idle`）；重连时新会话由适配器按 `~/.claude` 的
     * `permissions.defaultMode` 播种，于是用户在手机上切的 bypass 每隔几分钟就退回
     * 「Manual」。见 `services/conversation/sessionModeMemory.ts` 的完整说明。
     *
     * 这**不是** 2026-07-03 那条「不自动重放」所禁止的行为：codeg-plus 的 `spawn_agent`
     * 先做连接去重，命中已有会话时直接复用并跳过 `apply_preferred_session_options`，
     * 所以这两个字段只在「连接由我们新建」时生效 —— 那时没有活着的会话会被打扰。
     */
    const remembered = readConversationSessionSelection(input.conversationId, input.agentType)
    const connection = await acpApi.acpConnect(
      input.agentType,
      input.workingDir,
      input.sessionId,
      remembered?.modeId || undefined,
      remembered && Object.keys(remembered.configValues).length > 0
        ? remembered.configValues
        : undefined,
      { instanceKey }
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
