import { formatOverviewRelativeTime } from "./conversationOverviewPresentation"

/**
 * 会话列表的三种「展示形态」。
 *
 * 三者在设计稿里是三块画板（M08 会话 · 轻量版 / 会话列表 · Logo 版 /
 * 会话列表 · 名称前缀 Logo 版），骨架完全相同 —— 同样的顶栏、同样的文件夹分组、
 * 同样两行文字的会话行 —— **唯一差别是智能体 Logo 放哪儿**：
 *
 * | 形态 | Logo 位置 | 行结构 | 分隔线 |
 * |---|---|---|---|
 * | `light`（轻量版） | 不显示 | 标题 + 元信息行 | 通栏 |
 * | `logo`（Logo 版） | 行首 22×22 | 标题 + 元信息行（元信息不含 Logo） | 通栏 |
 * | `logo-prefix`（名称前缀 Logo 版） | 元信息行行首 14×14 | 标题 + `[Logo] 智能体 · 状态   时间` | 左缩进 32 |
 *
 * 默认取 `logo-prefix`：它信息密度最高，且不需要行首多占一列，窄屏上标题能拿到
 * 全部可用宽度。
 */
export type ConversationListStyleId = "light" | "logo" | "logo-prefix"

export const CONVERSATION_LIST_STYLE_STORAGE_KEY = "mcode_conversations_list_style_v1"

/** 分组默认只展开这么多行，其余折进「查看更多（N）」。设计稿正是 3 行 + 一行入口。 */
export const CONVERSATION_GROUP_INITIAL_ROWS = 3

/**
 * 每次点「查看更多」多放出来的行数。
 *
 * **不做一次性全展开**：一个跑了几百轮的文件夹会把页面拉成几万像素，用户既找不到
 * 刚才那一行，也失去「还有多少」的量感。每次 3 行，入口上继续显示剩余数量。
 */
export const CONVERSATION_GROUP_STEP_ROWS = 3

export interface ConversationListStyleOption {
  id: ConversationListStyleId
  name: string
  /** 给切换面板做副标题用，说明三种形态到底差在哪。 */
  description: string
}

export const CONVERSATION_LIST_STYLE_OPTIONS: ConversationListStyleOption[] = [
  {
    id: "logo-prefix",
    name: "名称前缀 Logo",
    description: "智能体 Logo 在会话信息行行首",
  },
  {
    id: "logo",
    name: "Logo 版",
    description: "智能体 Logo 独占行首一列",
  },
  {
    id: "light",
    name: "轻量版",
    description: "不显示智能体 Logo，最紧凑",
  },
]

function isListStyleId(value: unknown): value is ConversationListStyleId {
  return value === "light" || value === "logo" || value === "logo-prefix"
}

/**
 * 落盘值的容错解析。
 *
 * 存过的东西可能是字符串、`{ style }`、`{ value }`，也可能被别的版本写坏 ——
 * 一律回落到默认形态，绝不让列表因为一个坏字段渲染成空白。
 */
export function normalizeConversationListStyle(raw: unknown): ConversationListStyleId {
  if (isListStyleId(raw)) return raw

  if (typeof raw === "string") {
    const trimmed = raw.trim()
    if (isListStyleId(trimmed)) return trimmed
    try {
      const parsed = JSON.parse(trimmed)
      if (isListStyleId(parsed)) return parsed
      if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>
        if (isListStyleId(record.style)) return record.style
        if (isListStyleId(record.value)) return record.value
      }
    } catch {
      return "logo-prefix"
    }
    return "logo-prefix"
  }

  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>
    if (isListStyleId(record.style)) return record.style
    if (isListStyleId(record.value)) return record.value
  }

  return "logo-prefix"
}

/** 切换面板的选项文案：当前形态带「· 当前」后缀，与详情页主题选择器同一种写法。 */
export function buildConversationListStyleActions(active: ConversationListStyleId) {
  return CONVERSATION_LIST_STYLE_OPTIONS.map((item) => ({
    ...item,
    active: item.id === active,
    label: item.id === active ? `${item.name} · 当前` : item.name,
  }))
}

export function resolveConversationListStyleLabel(style: ConversationListStyleId) {
  return (
    CONVERSATION_LIST_STYLE_OPTIONS.find((item) => item.id === style)?.name
    || CONVERSATION_LIST_STYLE_OPTIONS[0].name
  )
}

/** 三种形态里 Logo 出现在哪。行组件只认这个结果，不再自己判断样式 id。 */
export interface ConversationListRowLayout {
  showLeadingLogo: boolean
  showInlineLogo: boolean
  indentSeparator: boolean
}

export function resolveConversationListRowLayout(
  style: ConversationListStyleId
): ConversationListRowLayout {
  if (style === "logo") {
    // 行首 22×22 那一版：元信息行里不再重复一枚 14×14 的小 Logo。
    return { showLeadingLogo: true, showInlineLogo: false, indentSeparator: false }
  }
  if (style === "light") {
    return { showLeadingLogo: false, showInlineLogo: false, indentSeparator: false }
  }
  return { showLeadingLogo: false, showInlineLogo: true, indentSeparator: true }
}

/**
 * 状态 → 色系。
 *
 * 设计稿只画了「· 进行中」这一种绿字；其余状态沿用同一套色系语义（等待回复 = 橙、
 * 异常 = 红、其余 = 次级文字色），保证「扫一眼能看出谁在动、谁在等人」。
 */
export type ConversationRowStatusTone = "running" | "awaiting" | "failed" | "muted"

export function resolveRowStatusTone(displayStatus: string): ConversationRowStatusTone {
  const status = String(displayStatus || "").trim().toLowerCase()
  if (status === "in_progress" || status === "thinking" || status === "running_tool") {
    return "running"
  }
  if (
    status === "waiting_question"
    || status === "waiting_permission"
    || status === "waiting_plan_approval"
    || status === "pending_review"
  ) {
    return "awaiting"
  }
  if (status === "error" || status === "failed") return "failed"
  return "muted"
}

/**
 * 元信息行里的状态文案。
 *
 * 与列表 chip 的 `overviewStatusLabel` **不同源**：那里是独立小胶囊，文案要能单独成句
 * （「远程运行中」）；这里跟在智能体名后面，前面还有一个「·」，过长会把时间挤出屏幕。
 * 所以只保留最短的动词词组，`completed` / `cancelled` 这类已结束状态直接不显示 ——
 * 那正是「隐藏已完成」在管的事，行上再挂一条「已完成」纯属噪音。
 */
export function resolveRowStatusText(displayStatus: string, isOpenTab?: boolean): string {
  const status = String(displayStatus || "").trim().toLowerCase()
  if (status === "in_progress" || status === "thinking" || status === "running_tool") {
    return "进行中"
  }
  if (status === "waiting_question") return "待回复"
  if (status === "waiting_permission") return "待授权"
  if (status === "waiting_plan_approval") return "待审批"
  if (status === "pending_review") return "待处理"
  if (status === "error" || status === "failed") return "异常"
  // 没有状态可显示时，用「已打开」占住这一格：列表是纯按时间排的，
  // 「这个会话在 PC 上开着」只剩这一个表达位置（旧版是一枚「标签」角标）。
  if (isOpenTab) return "已打开"
  return ""
}

/** 行内标题：设计稿是单行 15px/21，这里统一给出兜底文案。 */
export function resolveRowTitle(title?: string) {
  const text = String(title || "").trim()
  return text || "未命名会话"
}

/** 行内时间：与详情页/历史面板共用同一个相对时间格式化器。 */
export function resolveRowTimeText(updatedAt?: string) {
  return formatOverviewRelativeTime(updatedAt)
}

/**
 * 会话卡按**文件夹**重组。
 *
 * 顶层的 `buildOverviewDisplayModel` 是按连接分组的（一条连接一组），但设计稿的分组头
 * 是文件夹名（otools / mcode-ios / xyito）+ 文件夹图标 + 新建会话按钮 —— 分组语义在
 * 设计里是「项目」，不是「连接」。
 *
 * 这里只做**重排**，不重算状态：卡片对象原样透传（`displayStatus` / `livePreviewText`
 * 都是上游算好的），额外挂上 `connectionKey`，因为点开一轮会话仍然要连接上下文
 * （`openConversation` / 选择集都用 `group.key`）。
 *
 * 顺序规整：
 * 1. 连接顺序 = 上游顺序（连接列表本身的顺序是用户排序过的）；
 * 2. 同一连接内，文件夹顺序跟 `group.projects`（服务端给的顺序），
 *    没出现在 `projects` 里的卡（例如刚建会话、项目列表还没刷新）追加到末尾，
 *    绝不丢弃 —— 丢卡比顺序乱严重得多。
 */
export interface ConversationFolderCardLike {
  folderId: number
  projectName: string
  /** 置顶。可选是因为上游的卡片形态不止一种，没有这个字段时按未置顶处理。 */
  isPinned?: boolean
}

export interface ConversationFolderGroupLike<C extends ConversationFolderCardLike> {
  key: string
  name: string
  path?: string
  projects?: { id: number; name: string; path?: string }[]
  cards: C[]
}

export interface ConversationFolderGroup<C extends ConversationFolderCardLike> {
  /** 全局唯一：`连接key::文件夹id`。 */
  key: string
  connectionKey: string
  folderId: number
  name: string
  path: string
  cards: C[]
}

export function buildConversationFolderGroups<C extends ConversationFolderCardLike>(
  groups: ConversationFolderGroupLike<C>[]
): ConversationFolderGroup<C>[] {
  const out: ConversationFolderGroup<C>[] = []

  groups.forEach((group) => {
    const bucket = new Map<number, ConversationFolderGroup<C>>()

    const ensure = (folderId: number, name: string, path = "") => {
      const normalizedId = Number(folderId || 0)
      const existing = bucket.get(normalizedId)
      if (existing) {
        if (!existing.name && name) existing.name = name
        if (!existing.path && path) existing.path = path
        return existing
      }
      const created: ConversationFolderGroup<C> = {
        key: `${group.key}::${normalizedId}`,
        connectionKey: group.key,
        folderId: normalizedId,
        name: name || "未归类",
        path,
        cards: [],
      }
      bucket.set(normalizedId, created)
      return created
    }

    // 先按项目顺序建槽位，保证「空文件夹」也能显示（设计稿里每个分组都带新建入口）。
    ;(group.projects || []).forEach((project) => {
      ensure(project.id, project.name, project.path || "")
    })

    group.cards.forEach((card) => {
      ensure(Number(card.folderId || 0), String(card.projectName || "").trim()).cards.push(card)
    })

    // 只有连接作用域的空槽（`folderId = 0` 且没有任何卡）没有意义，跳过。
    bucket.forEach((folder) => {
      if (folder.folderId === 0 && folder.cards.length === 0) return
      // 置顶在**文件夹内**生效：不这么做，置顶只写了个字段，用户什么都看不到 ——
      // 全局排序键是活跃时间，置顶不参与它就是个空开关。
      folder.cards = sortFolderCardsWithPinnedFirst(folder.cards)
      out.push(folder)
    })
  })

  return out
}

/**
 * 分组内的置顶优先排序。
 *
 * 只把置顶的提到前面，**其余保持原顺序**（下游已经按活跃时间排好了，这里不能重新
 * 洗牌）—— 所以是稳定的：用原下标做 tiebreak，而不是再比一次时间。
 */
export function sortFolderCardsWithPinnedFirst<C extends ConversationFolderCardLike>(
  cards: C[]
): C[] {
  return cards
    .map((card, index) => ({ card, index }))
    .sort((left, right) => {
      const pinnedDiff =
        Number(Boolean(right.card.isPinned)) - Number(Boolean(left.card.isPinned))
      if (pinnedDiff !== 0) return pinnedDiff
      return left.index - right.index
    })
    .map((entry) => entry.card)
}

/**
 * 分组当前展示的行。
 *
 * `visibleCount` 是「已经放出来多少行」的累计值，由组件每次 +3 递增 ——
 * 不用布尔值，是因为布尔只能表达「折叠 / 全展开」两态，中间那几步没有位置放。
 */
export function resolveGroupVisibleCards<C>(cards: C[], visibleCount: number) {
  const limit = Math.max(0, Math.trunc(Number(visibleCount) || 0))
  if (cards.length <= limit) return cards
  return cards.slice(0, limit)
}

export function resolveGroupHiddenCount(total: number, visibleCount: number) {
  const limit = Math.max(0, Math.trunc(Number(visibleCount) || 0))
  return Math.max(0, total - limit)
}

export function buildGroupMoreLabel(hiddenCount: number) {
  return hiddenCount > 0 ? `查看更多（${hiddenCount}）` : ""
}
