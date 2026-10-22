import type { ConversationSummaryRecord } from "@/services/db/repositories/conversationRepository"
import { normalizeConversationSummaryStatus } from "@/services/conversation/conversationSummaryStatus"
import { normalizeAgentType } from "@/services/conversation/agentType"

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
  /**
   * 置顶时间。
   *
   * 服务端（`codeg` 的 `conversation` 表与 `DbConversationSummary`）用的是
   * **`pinned_at`：一个时间戳，不是布尔** —— 未置顶时为 `null`。走 HTTP 网关时按
   * camelCase 出来，是 `pinnedAt`。本地 DB 行与「打开的标签」用的是布尔
   * `is_pinned`（两套各自独立：标签置顶和会话置顶本来就是两个字段）。
   *
   * 三种形态都得认，统一走 `resolveConversationPinned`。
   */
  pinned_at?: string | null
  pinnedAt?: string | null
  is_pinned?: boolean
}

/**
 * 置顶态的**唯一**读法。
 *
 * 只写 `Boolean(conversation.is_pinned)` 的话，远程返回的 `pinnedAt` 从头到尾没被看
 * 过一眼 —— 置顶在手机上做了，下次刷新（远程摘要落本地）又被抹成未置顶。
 */
export function resolveConversationPinned(
  conversation?: Pick<
    ConversationOverviewConversation,
    "pinned_at" | "pinnedAt" | "is_pinned"
  > | null
): boolean {
  if (!conversation) return false
  // 时间戳优先：服务端权威字段。空串也当未置顶（`null` 过一遍 JSON 可能变成 ""）。
  if (conversation.pinned_at) return true
  if (conversation.pinnedAt) return true
  return Boolean(conversation.is_pinned)
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
  /** 会话是否置顶。置顶只影响分组内的排位，不参与 `activityAt` 的时间排序。 */
  isPinned: boolean
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
  /**
   * 非标签会话的**全量**卡（按活跃时间降序，未打开标签去重）。
   *
   * 命名里带着历史：它曾是「最近活跃」那一段、被截取过，现在是完整的。
   * 窗口/保底那些「初始看到几行」的可见性规则由展示层（`ConversationFolderSection`）
   * 施加 —— 快照裁掉数据，展示层就再也没有可展开的内容了。
   */
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
        isPinned: resolveConversationPinned(conversation),
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

  // **快照携带全量会话**：窗口/保底裁剪是页面「初始看到几行」的规则，不是数据的边界。
  // 这里曾经 `slice(0, minimumRecentCards)`，结果「查看更多」在你的电脑上就没内容可展开
  // —— 分组里只有 3 条，入口根本不会渲染，用户以为历史丢了。
  //
  // 排序仍然先行：渲染层按这个顺序展示，裁剪也就是从前往后数，不会捞到最早的几条。
  const recentActiveCandidates = sortOverviewCardsByActivity(
    conversations
      .filter((conversation) => !openedConversationIds.has(conversation.id))
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
          isPinned: resolveConversationPinned(conversation),
          isOpenTab: false,
        } satisfies ConversationOverviewCard
      })
  )

  const recentActiveCards = recentActiveCandidates

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
    // 本地行用 isPinned。不带上它，离线首屏（先读本地再刷远程）会把置顶抹成未置顶，
    // 列表会先跳一下再跳回来。
    is_pinned: Boolean(record.isPinned),
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
    // 曾经写死 false：远程落库时会把已经置顶的会话抹平，再刷新又跳回置顶态。
    // 现在读服务端权威字段 `pinned_at`/`pinnedAt`（布尔 `is_pinned` 只作本地兜底）。
    isPinned: resolveConversationPinned(conversation),
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
