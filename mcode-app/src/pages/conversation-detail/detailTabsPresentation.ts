import type { OpenedTabItem } from "@/types/acp"

export interface DetailShellTabItem {
  tabId: number
  folderId: number
  conversationId: number
  agentType: string
  title: string
  active: boolean
  position: number
}

export interface DetailTabsDiagnosticSnapshot {
  currentConversationId: number
  shellConversationIds: number[]
  mountedConversationIds: number[]
  activeTabIndex: number
  activeConversationId: number
  currentConversationInShell: boolean
  currentConversationMounted: boolean
}

export function buildDetailFallbackTab(input: {
  conversationId?: number
  folderId?: number
  agentType?: string
}): OpenedTabItem | null {
  const conversationId = Number(input.conversationId || 0)
  if (conversationId <= 0) return null

  return {
    id: conversationId,
    folder_id: Number(input.folderId || 0),
    conversation_id: conversationId,
    agent_type: String(input.agentType || "claude_code"),
    position: 0,
    is_active: true,
    is_pinned: false,
  }
}

export function buildDetailTabsDiagnosticSnapshot(input: {
  currentConversationId?: number
  tabs?: DetailShellTabItem[]
  mountedConversationIds?: Iterable<number>
  activeTabIndex?: number
}): DetailTabsDiagnosticSnapshot {
  const tabs = Array.isArray(input.tabs) ? input.tabs : []
  const currentConversationId = Number(input.currentConversationId || 0)
  const shellConversationIds = tabs
    .map((tab) => Number(tab.conversationId || 0))
    .filter((conversationId) => conversationId > 0)
  const mountedConversationIds = Array.from(input.mountedConversationIds || [])
    .map((conversationId) => Number(conversationId || 0))
    .filter((conversationId) => conversationId > 0)
    .filter((conversationId, index, values) => values.indexOf(conversationId) === index)
    .sort((left, right) => left - right)
  const rawActiveTabIndex = Number(input.activeTabIndex || 0)
  const activeTabIndex = Number.isFinite(rawActiveTabIndex)
    ? Math.trunc(rawActiveTabIndex)
    : 0
  const activeConversationId = Number(tabs[activeTabIndex]?.conversationId || 0)

  return {
    currentConversationId,
    shellConversationIds,
    mountedConversationIds,
    activeTabIndex,
    activeConversationId,
    currentConversationInShell:
      currentConversationId > 0 && shellConversationIds.includes(currentConversationId),
    currentConversationMounted:
      currentConversationId > 0 && mountedConversationIds.includes(currentConversationId),
  }
}

export function normalizeDetailTabTitleText(value?: string): string {
  const normalized = String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
  return normalized || "未命名会话"
}

export function buildDetailShellTabs(input: {
  openedTabs: OpenedTabItem[]
  titleByConversationId?: Record<number, string>
}): DetailShellTabItem[] {
  const seenConversationIds = new Set<number>()
  return (Array.isArray(input.openedTabs) ? input.openedTabs : [])
    .filter((item) => Number(item?.conversation_id || 0) > 0)
    .slice()
    .sort((left, right) => Number(left.position || 0) - Number(right.position || 0))
    .filter((item) => {
      const conversationId = Number(item.conversation_id || 0)
      if (seenConversationIds.has(conversationId)) return false
      seenConversationIds.add(conversationId)
      return true
    })
    .map((item) => {
      const conversationId = Number(item.conversation_id || 0)
      return {
        tabId: Number(item.id || 0),
        folderId: Number(item.folder_id || 0),
        conversationId,
        agentType: String(item.agent_type || "claude_code"),
        title: normalizeDetailTabTitleText(
          input.titleByConversationId?.[conversationId] || `会话 ${conversationId}`
        ),
        active: Boolean(item.is_active),
        position: Number(item.position || 0),
      } satisfies DetailShellTabItem
    })
}

export function resolveDetailTabChangeIndex(
  payload: unknown,
  tabs: DetailShellTabItem[] = [],
): number {
  if (typeof payload === "number") return Number.isFinite(payload) ? payload : -1
  if (!payload || typeof payload !== "object") return -1

  const record = payload as Record<string, unknown>
  const conversationValue = record.conversationId ?? record.conversation_id
  const conversationId = Number(conversationValue || 0)
  if (conversationId > 0) {
    return tabs.findIndex((tab) => Number(tab.conversationId || 0) === conversationId)
  }

  const directValue = record.index ?? record.current ?? record.name
  if (typeof directValue === "number" && Number.isFinite(directValue)) return directValue
  if (typeof directValue === "string" && directValue.trim()) {
    const parsed = Number(directValue)
    if (Number.isFinite(parsed)) return parsed
  }

  const tabValue = record.tabId
  const tabId = Number(tabValue || 0)
  if (tabId > 0) {
    return tabs.findIndex((tab) => Number(tab.tabId || 0) === tabId)
  }

  return -1
}

export function resolveMountedDetailConversationIds(input: {
  mountedConversationIds: Iterable<number>
  tabs: DetailShellTabItem[]
}): Set<number> {
  const activeConversationIds = new Set(
    input.tabs.map((tab) => Number(tab.conversationId || 0)).filter((id) => id > 0)
  )
  const nextMountedIds = new Set<number>()
  for (const conversationId of input.mountedConversationIds) {
    const normalizedId = Number(conversationId || 0)
    if (activeConversationIds.has(normalizedId)) {
      nextMountedIds.add(normalizedId)
    }
  }
  return nextMountedIds
}

export function resolveDetailMountedWindowConversationIds(input: {
  tabs: DetailShellTabItem[]
  currentIndex: number
}): Set<number> {
  const tabs = Array.isArray(input.tabs) ? input.tabs : []
  if (tabs.length === 0) return new Set()
  const currentIndex = Math.min(
    Math.max(0, Number(input.currentIndex || 0)),
    tabs.length - 1
  )
  const nextMountedIds = new Set<number>()
  for (const index of [currentIndex - 1, currentIndex, currentIndex + 1]) {
    const conversationId = Number(tabs[index]?.conversationId || 0)
    if (conversationId > 0) {
      nextMountedIds.add(conversationId)
    }
  }
  return nextMountedIds
}

export function resolveDetailTabCloseTarget(
  activeIndex: number,
  closedIndex: number,
  total: number,
): number {
  const safeTotal = Math.max(0, Number(total || 0))
  if (safeTotal <= 1) return -1
  if (closedIndex !== activeIndex) {
    return closedIndex < activeIndex ? activeIndex - 1 : activeIndex
  }
  if (closedIndex + 1 < safeTotal) return closedIndex
  if (closedIndex - 1 >= 0) return closedIndex - 1
  return -1
}

// Swiper/page identity must follow conversation identity, not remote tab row
// ids. save_opened_tabs rewrites auto-increment id values on every CAS save,
// so keying by tabId remounts the whole detail page and often resets the
// active page to index 0 after send/sync.
export function resolveDetailShellTabKey(
  tab: Pick<DetailShellTabItem, "conversationId" | "folderId" | "tabId"> | null | undefined,
): string {
  const conversationId = Number(tab?.conversationId || 0)
  if (conversationId > 0) return `conversation:${conversationId}`
  const folderId = Number(tab?.folderId || 0)
  const tabId = Number(tab?.tabId || 0)
  return `tab:${folderId}:${tabId}`
}

export function resolveDetailActiveTabIndex(input: {
  tabs: DetailShellTabItem[]
  preferredConversationId?: number
  currentIndex?: number
}): number {
  const tabs = Array.isArray(input.tabs) ? input.tabs : []
  if (tabs.length === 0) return 0

  const preferredConversationId = Number(input.preferredConversationId || 0)
  if (preferredConversationId > 0) {
    const preferredIndex = tabs.findIndex(
      (tab) => Number(tab.conversationId || 0) === preferredConversationId
    )
    if (preferredIndex >= 0) return preferredIndex
  }

  const currentIndex = Number(input.currentIndex || 0)
  if (!Number.isFinite(currentIndex)) return 0
  return Math.min(Math.max(0, currentIndex), tabs.length - 1)
}

export function shouldDeferDetailTabSwitch(input: {
  targetTab?: Pick<DetailShellTabItem, "conversationId"> | null
  currentConversationId?: number
  isSwitching?: boolean
  isLoading?: boolean
}): boolean {
  if (input.isSwitching) return true
  if (!input.isLoading) return false
  const targetConversationId = Number(input.targetTab?.conversationId || 0)
  const currentConversationId = Number(input.currentConversationId || 0)
  return targetConversationId > 0 && targetConversationId !== currentConversationId
}
