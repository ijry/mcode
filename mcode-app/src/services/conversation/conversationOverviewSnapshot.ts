import type { ConversationSummaryRecord } from "@/services/db/repositories/conversationRepository"
import { normalizeConversationSummaryStatus } from "@/services/conversation/conversationSummaryStatus"
import { normalizeAgentType } from "@/services/conversation/agentType"

const RECENT_ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000

export interface ConversationOverviewConversation {
  id: number
  title?: string
  agent_type?: string
  updated_at?: string
  last_message_at?: string
  lastMessageAt?: string
  folder_id?: number
  status?: string
  external_id?: string
  externalId?: string
}

export interface ConversationOverviewProject {
  id: number
  name: string
  path: string
  conversations?: ConversationOverviewConversation[]
}

export interface ConversationOverviewOpenedTab {
  id: number
  folder_id: number
  conversation_id?: number | null
  agent_type?: string
  position?: number
  is_active?: boolean
  is_pinned?: boolean
}

export interface ConversationOverviewCard {
  tabId: number
  conversationId?: number
  folderId: number
  projectName: string
  agentType: string
  title: string
  updatedAt?: string
  /**
   * `updatedAt` 的数值形态，也是列表的**唯一**排序键。
   *
   * 两者必须来自 `resolveConversationActivity` 的同一次解析：排序看数字、用户看字符串，
   * 一旦分别取字段就会出现「显示 5 分钟前却排在 4 天前后面」—— 列表看着像没排序。
   */
  activityAt: number
  status: string
  isActive: boolean
  /**
   * 这张卡是否来自「打开中的标签」。
   *
   * 顺序已经不再表达这件事，所以必须有一个显式字段供 UI 打角标 —— 否则「哪些会话在 PC 上
   * 开着」这个信息在合并排序后就彻底消失了。**不要用 `tabId > 0` 反推**：最近活跃卡片用的是
   * `-conversation.id`，靠符号区分是个没写下来的隐式契约，改一次 id 生成方式就静默失效。
   */
  isOpenTab: boolean
}

export interface ConnectionConversationSnapshot {
  key: string
  name: string
  targetAgent: string
  routeMode: "direct" | "gateway"
  baseUrl: string
  projects: ConversationOverviewProject[]
  openTabCards: ConversationOverviewCard[]
  recentActiveCards: ConversationOverviewCard[]
  /**
   * 实际渲染的那一份：`openTabCards` + `recentActiveCards` 合并后**纯按活跃时间降序**。
   *
   * 上面两个字段只表达「这张卡是哪来的」，不表达顺序 —— 打开中的标签不再因为身份而占据
   * 前排（用户要求「不管打开中的标签，只按时间来」）。渲染请一律用这个字段。
   */
  cards: ConversationOverviewCard[]
  loadError: string | null
}

interface BuildSnapshotInput {
  connectionKey: string
  connectionName: string
  targetAgent: string
  routeMode: "direct" | "gateway"
  baseUrl: string
  folders: ConversationOverviewProject[]
  tabs: ConversationOverviewOpenedTab[]
  conversations: ConversationOverviewConversation[]
  now?: number
}

export function buildConnectionConversationSnapshot(
  input: BuildSnapshotInput
): ConnectionConversationSnapshot {
  const folderMap = new Map<number, ConversationOverviewProject>()
  input.folders.forEach((folder) => {
    folderMap.set(folder.id, folder)
  })

  const conversations = input.conversations.filter((conversation) => Number(conversation.id) > 0)
  const convMap = new Map<number, ConversationOverviewConversation>()
  conversations.forEach((conversation) => {
    convMap.set(conversation.id, conversation)
  })

  const openTabCards = input.tabs
    .map((tab) => {
      const conversation = tab.conversation_id ? convMap.get(tab.conversation_id) : undefined
      const project = folderMap.get(tab.folder_id)
      const activity = resolveConversationActivity(conversation)
      return {
        tabId: tab.id,
        conversationId: tab.conversation_id || undefined,
        folderId: tab.folder_id,
        projectName: project?.name || project?.path || "未命名项目",
        agentType: normalizeAgentType(tab.agent_type || conversation?.agent_type),
        title: conversation?.title || `标签会话 #${tab.id}`,
        updatedAt: activity.label,
        activityAt: activity.at,
        status: normalizeConversationStatus(conversation?.status),
        isActive: Boolean(tab.is_active),
        isOpenTab: true,
      } satisfies ConversationOverviewCard
    })
    .sort((a, b) => {
      const activeDiff = Number(b.isActive) - Number(a.isActive)
      if (activeDiff !== 0) return activeDiff
      return Number(a.tabId) - Number(b.tabId)
    })

  const openedConversationIds = new Set(
    openTabCards
      .map((card) => Number(card.conversationId || 0))
      .filter((conversationId) => conversationId > 0)
  )
  const recentActiveThreshold = getRecentActiveThreshold(input.now ?? Date.now())

  const recentActiveCards = conversations
    .filter((conversation) => {
      if (openedConversationIds.has(conversation.id)) return false
      return getConversationActivityTimestamp(conversation) >= recentActiveThreshold
    })
    .map((conversation) => {
      const project = folderMap.get(Number(conversation.folder_id || 0))
      const activity = resolveConversationActivity(conversation)
      return {
        tabId: -conversation.id,
        conversationId: conversation.id,
        folderId: Number(conversation.folder_id || 0),
        projectName: project?.name || project?.path || "未命名项目",
        agentType: normalizeAgentType(conversation.agent_type),
        title: conversation.title || `会话 #${conversation.id}`,
        updatedAt: activity.label,
        activityAt: activity.at,
        status: normalizeConversationStatus(conversation.status),
        isActive: false,
        isOpenTab: false,
      } satisfies ConversationOverviewCard
    })

  const projects = input.folders.map((folder) => ({
    ...folder,
    conversations: conversations.filter((conversation) => conversation.folder_id === folder.id),
  }))

  return {
    key: input.connectionKey,
    name: input.connectionName,
    targetAgent: input.targetAgent,
    routeMode: input.routeMode,
    baseUrl: input.baseUrl,
    projects,
    openTabCards,
    recentActiveCards,
    cards: sortOverviewCardsByActivity([...openTabCards, ...recentActiveCards]),
    loadError: null,
  }
}

/**
 * 全列表统一排序：**只看活跃时间**，最新在前。
 *
 * 打开中的标签不再因为「是标签」而排前面 —— 用户看到的是一条按时间连续的列表。
 * 之所以要在这里集中排序（而不是让调用方各排一次），是因为原先「标签组在前 + 各组
 * 内部各自排序」的写法会让一个几天前的标签压在 5 分钟前的会话上面，看起来就是没排序。
 */
export function sortOverviewCardsByActivity(
  cards: ConversationOverviewCard[]
): ConversationOverviewCard[] {
  // 拿不到时间戳（标签还没关联会话）的卡片没有可比的位置，统一沉到末尾。
  //
  // tiebreak 用**数组下标**而不是 `tabId`：最近活跃卡片的 tabId 是 `-conversation.id`，
  // 直接比数值会把它们整体排到标签前面 —— 又一次用符号表达语义。下标同时保证排序稳定
  // （标签本来就按 isActive → tabId 排好了，进来的相对顺序原样保留）。
  return cards
    .map((card, index) => ({ card, index }))
    .sort((left, right) => {
      const leftAt = Number.isFinite(left.card.activityAt) ? left.card.activityAt : 0
      const rightAt = Number.isFinite(right.card.activityAt) ? right.card.activityAt : 0
      if (leftAt !== rightAt) return rightAt - leftAt
      return left.index - right.index
    })
    .map((entry) => entry.card)
}

export function mapConversationSummaryRecordToConversation(
  record: ConversationSummaryRecord
): ConversationOverviewConversation {
  return {
    id: record.id,
    title: record.title,
    agent_type: normalizeAgentType(record.agentType),
    updated_at: formatTimestamp(record.updatedAt),
    last_message_at: formatTimestamp(record.lastMessageAt),
    folder_id: record.folderId,
    status: normalizeConversationStatus(record.status),
  }
}

export function mapConversationToSummaryRecord(
  instanceKey: string,
  conversation: ConversationOverviewConversation,
  now = Date.now()
): ConversationSummaryRecord {
  const lastMessageAt =
    parseTimestamp(conversation.last_message_at, conversation.lastMessageAt, conversation.updated_at) ||
    now
  const updatedAt =
    parseTimestamp(conversation.updated_at, conversation.last_message_at, conversation.lastMessageAt) ||
    lastMessageAt

  return {
    id: conversation.id,
    instanceKey,
    folderId: Number(conversation.folder_id || 0),
    title: conversation.title || "未命名会话",
    agentType: normalizeAgentType(conversation.agent_type),
    externalId: firstString(conversation.external_id, conversation.externalId) || null,
    connectionId: null,
    status: normalizeConversationStatus(conversation.status),
    lastTurnId: null,
    lastMessageAt,
    unreadCount: 0,
    isPinned: false,
    deletedAt: null,
    updatedAt,
  }
}

/**
 * 排序键与显示文案的**唯一**来源。
 *
 * 历史上这两件事各写一份、字段优先级还是**反的**：排序取
 * `last_message_at → lastMessageAt → updated_at`，显示取 `updated_at → last_message_at`。
 * 于是一个只改了标题/状态（`updated_at` 新、`last_message_at` 旧）的会话会显示成
 * 「刚刚」却排在几天前那批后面 —— 不报错，只是列表看着像坏了。
 *
 * 统一按 `last_message_at → lastMessageAt → updated_at`：会话列表表达的是「最近聊过什么」，
 * 消息时间才是用户心里的那个时间；`updated_at` 只作兜底（会话建好还没发言时它是唯一的时间）。
 */
export function resolveConversationActivity(
  conversation?: Pick<
    ConversationOverviewConversation,
    "updated_at" | "last_message_at" | "lastMessageAt"
  >
): { at: number; label?: string } {
  if (!conversation) return { at: 0, label: undefined }
  // 一次遍历同时定出「排序用的数值」和「显示用的字符串」，**取的必须是同一个字段**。
  // 分成两次遍历就会在「字段存在但解析不出时间」时再次分叉：`firstString` 会把那串垃圾
  // 当标签显示，而 `parseTimestamp` 已经跳过它去用下一个字段排序。
  for (const value of [
    conversation.last_message_at,
    conversation.lastMessageAt,
    conversation.updated_at,
  ]) {
    // 类型上这三个字段都是 string，但数据来自远端网关，历史上出现过数值 epoch。
    // 直接跳过数值会让那种会话的时间戳变成空白（旧代码是原样塞给 `formatTime` 的），
    // 所以这里归一成 ISO 串再显示。
    if (typeof value === "number" && Number.isFinite(value)) {
      return { at: value, label: formatTimestamp(value) }
    }
    if (typeof value !== "string" || !value.trim()) continue
    const parsed = new Date(value.trim()).getTime()
    if (!Number.isFinite(parsed)) continue
    return { at: parsed, label: value.trim() }
  }
  return { at: 0, label: undefined }
}

export function getConversationActivityTimestamp(
  conversation: Pick<
    ConversationOverviewConversation,
    "updated_at" | "last_message_at" | "lastMessageAt"
  >
) {
  return (
    parseTimestamp(
      conversation.last_message_at,
      conversation.lastMessageAt,
      conversation.updated_at
    ) || 0
  )
}

function getRecentActiveThreshold(now: number) {
  if (!Number.isFinite(now)) return 0
  // Keep late-night activity visible after midnight instead of resetting at 00:00.
  return Math.max(0, now - RECENT_ACTIVE_WINDOW_MS)
}

function normalizeConversationStatus(value?: string): string {
  return normalizeConversationSummaryStatus(value)
}

function parseTimestamp(...values: Array<string | number | undefined>) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = new Date(value).getTime()
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }
  return 0
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

function formatTimestamp(value: number) {
  return new Date(value).toISOString()
}
