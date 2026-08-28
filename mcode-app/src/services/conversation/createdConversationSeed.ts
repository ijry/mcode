import type { CodegGateway } from "@/services/gateway"
import { ensureConversationSchema } from "@/services/db/migrations"
import { upsertConversationSummary } from "@/services/db/repositories/conversationRepository"
import { METADATA_ONLY_CONVERSATION_TAIL_TURNS } from "./conversationHistoryWindowContract"
import { normalizeConversationSummaryStatus } from "./conversationSummaryStatus"
import { normalizeAgentType } from "./agentType"

/**
 * 新建会话后给本地摘要库写种子行。
 *
 * 这是「新建完立刻在列表里看到那一行」的全部依据 —— 列表页读的是本地 `conversations` 表，
 * 而远端摘要要等下一次 `list_all_conversations` 才到。
 *
 * **两段式写入，顺序是有意的：**
 *
 * 1. 先用手里已有的字段写一行乐观记录（不碰网络）；
 * 2. 再拉一次会话详情，用服务端的权威值精修同一行。
 *
 * 反过来（先探测再写）会让弱网下用户先看到一个空列表 —— 而会话其实已经建好了。
 * 第 2 步失败时**不回滚**第 1 步：会话确实存在，列表少一行比多一行略旧的更糟。
 *
 * 从 `pages/conversations/index.vue` 抽出来是因为它属于**持久化职责**而不是弹层职责 ——
 * 拆 CreateConversationSheet 时它不该跟着进子组件（子组件只负责把创建做到「拿到
 * conversationId」为止）。
 */
export async function seedCreatedConversationSummary(input: {
  gateway: CodegGateway
  instanceKey: string
  conversationId: number
  folderId: number
  title: string
  agentType: string
  /** 本次是否带了任务内容（决定初始状态是 in_progress 还是 unknown）。 */
  hasTaskContent: boolean
}) {
  // 新建会话可能是本次安装第一次碰 SQLite —— 列表页的本地水合只在「有缓存」那条路上跑。
  await ensureConversationSchema()

  const now = Date.now()
  const placeholderTitle = `会话 #${input.conversationId}`
  // 没有任务内容就不会发 prompt。写成 in_progress 会让列表显示一个永远不结束的
  // 「远程运行中」。
  const seedStatus = input.hasTaskContent ? "in_progress" : "unknown"

  await upsertConversationSummary({
    id: input.conversationId,
    instanceKey: input.instanceKey,
    folderId: input.folderId,
    title: input.title.trim() || placeholderTitle,
    // 归一化在这里做：列表页比对用的是 canonical 值，存别名会让卡片匹配不上。
    agentType: normalizeAgentType(input.agentType),
    externalId: null,
    connectionId: null,
    status: normalizeConversationSummaryStatus(seedStatus),
    lastTurnId: null,
    lastMessageAt: now,
    unreadCount: 0,
    isPinned: false,
    deletedAt: null,
    updatedAt: now,
  })

  try {
    // 只读 summary / title / folderId / agentType / status，完全不看轮次内容
    // （`lastTurnId` 在新建会话时硬编码为 null），所以取**最小窗口**。取大窗口会在
    // 新建这条路上白拉一整页历史。
    const detail = await input.gateway.call<any>("get_folder_conversation", {
      conversationId: input.conversationId,
      tailTurns: METADATA_ONLY_CONVERSATION_TAIL_TURNS,
    })
    const summary =
      detail?.summary && typeof detail.summary === "object" ? detail.summary : {}
    const title = firstString(detail?.title, summary?.title, input.title)
    await upsertConversationSummary({
      id: input.conversationId,
      instanceKey: input.instanceKey,
      folderId: Number(
        detail?.folder_id || detail?.folderId || summary?.folder_id || input.folderId
      ),
      title: title || placeholderTitle,
      agentType: normalizeAgentType(
        firstString(detail?.agent_type, detail?.agentType, summary?.agent_type, input.agentType)
      ),
      externalId:
        firstString(detail?.session_id, detail?.sessionId, summary?.external_id) || null,
      connectionId: null,
      status: normalizeConversationSummaryStatus(
        firstString(detail?.status, summary?.status, seedStatus)
      ),
      lastTurnId: null,
      lastMessageAt: now,
      unreadCount: 0,
      isPinned: false,
      deletedAt: null,
      updatedAt: now,
    })
  } catch (error) {
    // 不回滚上面那行乐观记录：会话确实已经建好了。
    console.warn("seed created conversation detail skipped:", error)
  }
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}
