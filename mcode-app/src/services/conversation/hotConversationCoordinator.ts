const HOT_RETENTION_MS = 2 * 60 * 1000

interface HotConversationEntry {
  conversationId: number
  touchedAt: number
}

const hotEntries = new Map<number, HotConversationEntry>()

export function touchHotConversation(conversationId: number) {
  const id = Number(conversationId || 0)
  if (!id) return
  hotEntries.set(id, {
    conversationId: id,
    touchedAt: Date.now(),
  })
}

export function isHotConversation(conversationId: number, now = Date.now()) {
  const entry = hotEntries.get(Number(conversationId || 0))
  if (!entry) return false
  if (now - entry.touchedAt > HOT_RETENTION_MS) {
    hotEntries.delete(entry.conversationId)
    return false
  }
  return true
}

export function releaseHotConversation(conversationId: number) {
  hotEntries.delete(Number(conversationId || 0))
}

export function sweepHotConversations(now = Date.now()) {
  for (const [conversationId, entry] of hotEntries.entries()) {
    if (now - entry.touchedAt > HOT_RETENTION_MS) {
      hotEntries.delete(conversationId)
    }
  }
}

export function resetHotConversationCoordinator() {
  hotEntries.clear()
}
