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
  return (Array.isArray(input.openedTabs) ? input.openedTabs : [])
    .filter((item) => Number(item?.conversation_id || 0) > 0)
    .slice()
    .sort((left, right) => Number(left.position || 0) - Number(right.position || 0))
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

export function resolveDetailTabWindow(activeIndex: number, total: number): number[] {
  const safeTotal = Math.max(0, Number(total || 0))
  const safeActive = Math.min(Math.max(0, Number(activeIndex || 0)), Math.max(0, safeTotal - 1))
  const indexes = new Set<number>()
  if (safeTotal <= 0) return []
  indexes.add(safeActive)
  if (safeActive > 0) indexes.add(safeActive - 1)
  if (safeActive + 1 < safeTotal) indexes.add(safeActive + 1)
  return Array.from(indexes).sort((left, right) => left - right)
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
