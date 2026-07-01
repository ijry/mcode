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
        title: input.titleByConversationId?.[conversationId] || `会话 ${conversationId}`,
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
  const directValue = record.index ?? record.current ?? record.name
  if (typeof directValue === "number" && Number.isFinite(directValue)) return directValue
  if (typeof directValue === "string" && directValue.trim()) {
    const parsed = Number(directValue)
    if (Number.isFinite(parsed)) return parsed
  }

  const conversationValue = record.conversationId ?? record.conversation_id
  const conversationId = Number(conversationValue || 0)
  if (conversationId > 0) {
    return tabs.findIndex((tab) => Number(tab.conversationId || 0) === conversationId)
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
