import { AGENT_LABELS } from "@/services/remoteSettings"
import { normalizeAgentType } from "@/pages/conversation-detail/detailDataNormalization"
import {
  resolveConversationLivePreviewText,
  type ConversationLivePreviewSession,
} from "./conversationLivePreview"

export function resolveOverviewCardDisplayStatus(
  summaryStatus: string,
  runtimeStatus?: string | null
) {
  const normalizedSummaryStatus = normalizeOverviewStatus(summaryStatus)
  const normalizedRuntimeStatus = normalizeOverviewStatus(runtimeStatus)
  if (!normalizedRuntimeStatus) return normalizedSummaryStatus
  if (normalizedRuntimeStatus === "error") {
    return "failed"
  }
  if (isRuntimeExecutionStatus(normalizedRuntimeStatus)) {
    return "in_progress"
  }
  return normalizedSummaryStatus
}

/**
 * 这张卡是否该因为「隐藏已完成会话」而被藏起来。
 *
 * **入参必须是 `displayStatus`，不是 summary 原值。** 一个状态是 `completed`、但此刻
 * runtime 正在跑的会话，`resolveOverviewCardDisplayStatus` 会把它提升成 `in_progress`
 * —— 那种会话绝不能藏。传原值就会把它藏掉。
 *
 * **只挡 `completed`。** `pending_review`（列表上的「待处理」）是轮次跑完的常态状态，
 * 藏它等于让「刚跑完等我看结果」的会话消失；`failed` / `cancelled` 可能还需要用户重试。
 * 理由详见 `hideCompletedConversationsPreference` 的模块注释。
 *
 * 归一化与 `resolveOverviewCardDisplayStatus` 共用同一个 helper —— 状态串来自服务端且
 * 不是封闭枚举（`normalizeConversationSummaryStatus` 会原样透传未知值），两边不同源的话
 * `" Completed "` 这类漂移写法会绕过过滤。
 */
export function shouldHideCompletedOverviewCard(
  displayStatus: string,
  hideCompleted: boolean
): boolean {
  if (!hideCompleted) return false
  return normalizeOverviewStatus(displayStatus) === "completed"
}

function isRuntimeExecutionStatus(status: string) {
  return (
    status === "thinking" ||
    status === "running_tool" ||
    status === "waiting_permission" ||
    status === "waiting_question"
  )
}

function normalizeOverviewStatus(value?: string | null) {
  return String(value || "").trim().toLowerCase()
}

/** 会话列表卡片（快照产出的形状，见 `conversationOverviewSnapshot.ts`）。 */
export interface OverviewCardLike {
  tabId: number
  conversationId?: number
  folderId: number
  projectName: string
  agentType: string
  title: string
  updatedAt?: string
  activityAt: number
  status: string
  isActive: boolean
  isOpenTab: boolean
}

export interface OverviewGroupLike {
  key: string
  name: string
  baseUrl: string
  cards: OverviewCardLike[]
}

/** 渲染用：叠加了 runtime 状态与实时预览文案的卡片。 */
export type OverviewDisplayCard<C extends OverviewCardLike = OverviewCardLike> = C & {
  displayStatus: string
  livePreviewText: string
}

/** 订阅 / 批量选择用：展平后额外带上归属信息。 */
export type OverviewCandidateCard<C extends OverviewCardLike = OverviewCardLike> = C & {
  displayStatus: string
  groupKey: string
  instanceKey: string
}

export interface OverviewDisplayModel<G extends OverviewGroupLike = OverviewGroupLike> {
  groups: (G & { cards: OverviewDisplayCard<G["cards"][number]>[] })[]
  candidates: OverviewCandidateCard<G["cards"][number]>[]
}

/** agent 类型 → 界面标签。`AGENT_LABELS` 复用 `remoteSettings.ts` 那一份唯一实现。 */
export function formatOverviewAgentLabel(agentType?: string): string {
  if (!agentType) return "未知"
  return (AGENT_LABELS as Record<string, string>)[agentType] ?? agentType
}

/**
 * 关键词是否命中这张卡。
 *
 * 匹配 agent 的**界面标签**而不是原始类型 —— 用户搜的是他看到的那串字（「Claude Code」），
 * 而卡上存的是 `claude_code`。历史面板那份匹配至今没做这层映射，所以同一个关键词在概览
 * 能搜到、在历史面板搜不到（本次未修，见笔记）。
 */
export function overviewCardMatchesKeyword(
  card: Pick<OverviewCardLike, "title" | "projectName" | "agentType">,
  keyword: string
): boolean {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return true
  return [card.title || "", card.projectName || "", formatOverviewAgentLabel(card.agentType)]
    .join(" ")
    .toLowerCase()
    .includes(kw)
}

/** 状态 → 中文标签。与 `overviewStatusClass` 是同一状态串的两张平行表，改一处要改两处。 */
export function overviewStatusLabel(status: string): string {
  const value = normalizeOverviewStatus(status)
  if (value === "in_progress") return "远程运行中"
  if (value === "completed") return "已完成"
  if (value === "cancelled" || value === "canceled") return "已停止"
  if (value === "pending_review") return "待处理"
  if (value === "error" || value === "failed") return "异常"
  return "空闲"
}

/**
 * 状态 → CSS 修饰符。
 *
 * 注意分支集合与 `overviewStatusLabel` **不等**：`pending_review` 有专属标签（「待处理」）
 * 但没有专属样式，落到 `idle`。这是既有行为，本次照搬不改。
 */
export function overviewStatusClass(status: string): string {
  const value = normalizeOverviewStatus(status)
  if (value === "in_progress") return "running"
  if (value === "completed") return "completed"
  if (value === "cancelled" || value === "canceled") return "stopped"
  if (value === "error" || value === "failed") return "error"
  return "idle"
}

/** 这张卡是不是「正在跑」—— 排序与实时预览筛选都用它，不要再绕道 CSS 类名判断。 */
export function isRunningOverviewCard(displayStatus: string): boolean {
  return normalizeOverviewStatus(displayStatus) === "in_progress"
}

/**
 * 运行中的卡提到最前，其余**保持传入顺序**。
 *
 * tiebreak 用数组下标而不是任何时间字段：传进来的顺序已经是
 * `buildConnectionConversationSnapshot` 按活跃时间排好的，这里只做「置顶正在跑的」这一件
 * 事。用时间重排会与那层的排序规则打架（见
 * `2026-08-20-09-05-conversation-list-time-only-ordering`）。
 */
export function sortRunningOverviewCardsFirst<T extends { displayStatus: string }>(
  cards: T[]
): T[] {
  return cards
    .map((card, index) => ({ card, index }))
    .sort((left, right) => {
      const leftRunning = isRunningOverviewCard(left.card.displayStatus) ? 0 : 1
      const rightRunning = isRunningOverviewCard(right.card.displayStatus) ? 0 : 1
      if (leftRunning !== rightRunning) return leftRunning - rightRunning
      return left.index - right.index
    })
    .map((entry) => entry.card)
}

export function overviewAgentLogoText(agentType: string): string {
  const key = normalizeAgentType(agentType)
  if (key === "claude_code") return "CC"
  if (key === "codex") return "CX"
  if (key === "open_code") return "OC"
  if (key === "gemini") return "GM"
  if (key === "open_claw") return "CL"
  if (key === "cline") return "CN"
  return "AI"
}

export function overviewAgentLogoClass(agentType: string): string {
  return `agent-logo--${normalizeAgentType(agentType).replace(/[^a-z0-9_]/g, "")}`
}

export function overviewAgentLogoPath(agentType: string): string {
  const key = normalizeAgentType(agentType)
  if (key === "claude_code") return "/static/agent-logos/claude-code.svg"
  if (key === "codex") return "/static/agent-logos/codex.svg"
  if (key === "gemini") return "/static/agent-logos/gemini.svg"
  if (key === "cline") return "/static/agent-logos/cline.svg"
  if (key === "open_code") return "/static/agent-logos/open-code.svg"
  if (key === "open_claw") return "/static/agent-logos/open-claw.svg"
  return ""
}

export function resolveGroupEmptyText(hideCompleted: boolean): string {
  return hideCompleted
    ? "没有进行中的会话；已完成的已隐藏，可点上方「已完成」查看"
    : "暂无打开中或 24 小时内活跃的会话"
}

export function resolveOverviewEmptyText(keyword: string, hideCompleted: boolean): string {
  if (keyword.trim()) return "没有匹配的会话"
  return hideCompleted
    ? "已完成的会话已隐藏，可点上方「已完成」查看"
    : "暂无分组会话"
}

/**
 * 一次算出会话列表的**全部**可见派生：渲染用的分组结构，和喂订阅/批量选择的展平候选集。
 *
 * ## 为什么必须是一个函数
 *
 * 这两份数据此前是页面里的**两条独立派生**（`filteredConnectionGroups` computed 与
 * `getDisplayCandidateCards()` 函数），各自读一遍 runtime、各自算一遍 `displayStatus`、
 * 各自做一遍隐藏过滤与关键词匹配。
 *
 * 后果是两类的：
 *
 * 1. **正确性**：任何一处判据改动都必须同时改两处。漏改渲染那条只是看不见；漏改候选那条
 *    则会让**看不见的卡仍被订阅实时流、仍能被「全选」勾中** —— 用户于是对着一个界面上
 *    不存在的会话发消息。上一版靠一条源码扫描测试（数 `shouldHideCompletedOverviewCard`
 *    出现几次）来防这件事，那条测试的存在本身就是「没收口」的自证。
 * 2. **性能**：单个 runtime tick 会把同一批卡遍历 8 次（两个 watcher 各一次、预览签名
 *    一次、订阅对账一次、`Promise.all` 里按候选逐个复查若干次）。
 *
 * ## 两份输出的差异（都是刻意的）
 *
 * | | 分组结构 `groups` | 展平候选 `candidates` |
 * | --- | --- | --- |
 * | 结构 | 保留分组，供模板 `v-for` | 展平，供订阅/选择集 |
 * | 排序 | 运行中置顶 | **不排序**（顺序只需稳定） |
 * | 额外字段 | `livePreviewText` | `groupKey` / `instanceKey` |
 * | 组级关键词兜底 | **有**（搜连接名/地址时该看到那个组） | **无**（那些卡不可见） |
 *
 * 「组级兜底」那条差异最容易写错：搜索命中连接名时，那个组要留在列表上（否则用户以为这台
 * 机器不存在），但它下面**一张卡都不可见** —— 所以候选集里不能有它们。
 *
 * ## 为什么用回调拿 runtime
 *
 * `resolveRuntimeSession` 而不是直接收一个 Map：Vue 的响应式对象不进纯模块，模块因此
 * 可以在 jest 里裸测。页面侧传 `(id) => runtime.sessions.get(id)`。
 */
export function buildOverviewDisplayModel<G extends OverviewGroupLike>(input: {
  groups: G[]
  resolveRuntimeSession: (
    conversationId: number
  ) => ConversationLivePreviewSession | undefined | null
  instanceKeyByGroupKey: Record<string, string>
  keyword: string
  hideCompleted: boolean
  livePreviewEnabled: boolean
}): OverviewDisplayModel<G> {
  const keyword = input.keyword.trim().toLowerCase()
  const groups: OverviewDisplayModel<G>["groups"] = []
  const candidates: OverviewCandidateCard<G["cards"][number]>[] = []

  for (const group of input.groups) {
    const instanceKey = input.instanceKeyByGroupKey[group.key] || ""
    const visible: OverviewDisplayCard<G["cards"][number]>[] = []

    for (const card of group.cards) {
      // 每张卡**只查一次** runtime —— 这是把 8 次遍历压成 1 次的关键那一步。
      const session = input.resolveRuntimeSession(Number(card.conversationId || 0))
      const displayStatus = resolveOverviewCardDisplayStatus(card.status, session?.status)

      // 过滤必须在 displayStatus 算完之后：正在跑的 completed 会话此时已被提升成
      // in_progress，不会被藏。
      if (shouldHideCompletedOverviewCard(displayStatus, input.hideCompleted)) continue
      if (!overviewCardMatchesKeyword(card, keyword)) continue

      visible.push({
        ...card,
        displayStatus,
        livePreviewText: input.livePreviewEnabled
          ? resolveConversationLivePreviewText(session)
          : "",
      } as OverviewDisplayCard<G["cards"][number]>)

      candidates.push({
        ...card,
        displayStatus,
        groupKey: group.key,
        instanceKey,
      } as OverviewCandidateCard<G["cards"][number]>)
    }

    // 组级关键词兜底：卡片全被滤掉、但组名/地址命中时仍然显示这个组（空态由模板处理）。
    const groupMatches =
      !keyword ||
      group.name.toLowerCase().includes(keyword) ||
      group.baseUrl.toLowerCase().includes(keyword)
    if (visible.length === 0 && !groupMatches) continue

    groups.push({
      ...group,
      cards: sortRunningOverviewCardsFirst(visible),
    })
  }

  return { groups, candidates }
}

/** 批量选择项（选中会话的最小载荷，批量发送时逐条发出）。 */
export interface BulkSelectionItem {
  key: string
  connectionKey: string
  conversationId: number
  folderId: number
  agentType: string
  title: string
  projectName: string
}

/** 选中项的唯一键：会话号在不同连接上会重复，所以必须带连接键。 */
export function buildBulkSelectionKey(connectionKey: string, conversationId: number): string {
  return `${connectionKey}:${conversationId}`
}

/**
 * 这张卡能不能被选中 / 打开。
 *
 * **唯一判据**：必须有一个真实的会话号。此前这个判断在页面里有五处各自的实现
 * （`isSelectableLiveCard`、`buildBulkSelectionItem` 里再判一次、`isConversationSelected`
 * 里再判一次、`openLiveSession` 里判 `!card.conversationId`、以及
 * `selectConversationLivePreviewIds` 里判 `!Number.isFinite || <= 0`）。
 *
 * 负数也不行：标签卡还没关联会话时 `tabId` 取的是 `-conversation.id`，那种卡不可选。
 */
export function isSelectableOverviewCard(
  card: Pick<OverviewCardLike, "conversationId">
): boolean {
  const conversationId = Number(card.conversationId || 0)
  return Number.isFinite(conversationId) && conversationId > 0
}

/**
 * 把一张卡变成批量选择项；不可选时返回 null。
 *
 * `agentType` 在这里**归一化**：服务端可能给 `codex_cli` 这类别名，而批量发送时
 * `ensureBulkSendConnection` 要用它去匹配连接 —— 不归一化会匹配不上。
 *
 * 标题/项目名兜底成占位文案而不是空串：批量发送弹层要列出已选会话，空串会渲染成一行空白，
 * 看起来像少了一条。
 */
export function buildBulkSelectionItem(
  card: Pick<OverviewCardLike, "conversationId" | "folderId" | "agentType" | "title" | "projectName">,
  connectionKey: string
): BulkSelectionItem | null {
  if (!connectionKey || !isSelectableOverviewCard(card)) return null
  const conversationId = Number(card.conversationId || 0)
  return {
    key: buildBulkSelectionKey(connectionKey, conversationId),
    connectionKey,
    conversationId,
    folderId: Number(card.folderId || 0),
    agentType: normalizeAgentType(card.agentType),
    title: card.title || "未命名会话",
    projectName: card.projectName || "未命名项目",
  }
}

/**
 * 卡片时间戳的粗粒度相对文案（「5分钟前」/「昨天」/ 日期）。
 *
 * 解析不出来时返回空串让模板自然不渲染 —— 卡片的 `updatedAt` 是可选字段（标签还没关联
 * 会话时没有活跃时间），返回 "Invalid Date" 比不显示更糟。
 *
 * 注意仓库里还有几份各自的相对时间实现（`services/circle.ts` 的 `formatRelativeTime`
 * 用的是「X 分钟前」带空格、粒度也不同）。本次只收口会话列表这一处，没有强行统一 ——
 * 那几处的文案风格是各自页面定的，合并需要先对齐设计。
 */
export function formatOverviewRelativeTime(time?: string): string {
  if (!time) return ""
  const at = new Date(time).getTime()
  if (!Number.isFinite(at)) return ""
  const minutes = Math.floor((Date.now() - at) / 60000)
  if (minutes < 1) return "刚刚"
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days === 1) return "昨天"
  if (days < 7) return `${days}天前`
  return new Date(at).toLocaleDateString("zh-CN")
}
