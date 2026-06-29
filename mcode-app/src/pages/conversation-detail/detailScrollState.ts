import type { PersistedTurnWithParts } from "@/services/db/repositories/conversationRepository"

export interface HistoryPageCursor {
  sortKey: number
  id: string
}

export type ScrollRestoreAction =
  | { type: "bottom" }
  | { type: "scrollTop"; scrollTop: number }
  | { type: "anchor"; anchorMessageId: string }

export type ViewportSyncAction =
  | { type: "none" }
  | { type: "bottom" }
  | { type: "scrollTop"; scrollTop: number }

export function resolveInitialTurnLimit(input: {
  cachedLoadedTurnCount?: number | null
  currentLoadedCount?: number | null
  minimumBatch: number
}) {
  const cachedCount = Number(input.cachedLoadedTurnCount || 0)
  const liveCount = Number(input.currentLoadedCount || 0)
  return Math.max(
    input.minimumBatch,
    Number.isFinite(cachedCount) ? cachedCount : 0,
    Number.isFinite(liveCount) ? liveCount : 0
  )
}

export function getOldestCursorFromPersistedTurns(
  turns: PersistedTurnWithParts[]
): HistoryPageCursor | null {
  if (turns.length === 0) return null
  const tail = turns[turns.length - 1]
  const sortKey = Number(tail.sortKey ?? tail.seq ?? tail.createdAt ?? 0)
  if (!sortKey || !tail.id) return null
  return { sortKey, id: tail.id }
}

export function restoreHistoryCursorFromCache(input: {
  oldestLoadedSeq?: number | null
  firstMessageId?: string | null
}): HistoryPageCursor | null {
  const sortKey = Number(input.oldestLoadedSeq ?? 0)
  const firstMessageId = String(input.firstMessageId || "")
  if (!sortKey || !firstMessageId) return null
  return { sortKey, id: firstMessageId }
}

export function messageAnchorId(messageId: string) {
  return `msg-${String(messageId).replace(/[^a-zA-Z0-9_-]/g, "_")}`
}

export function resolveRenderAnchorId(input: {
  messageId: string
  items: Array<{ anchorId: string; sourceIds: string[] }>
}) {
  const normalized = String(input.messageId || "").trim()
  if (!normalized) return ""
  const matched = input.items.find((item) => item.sourceIds.includes(normalized))
  return matched?.anchorId || normalized
}

export function bottomAnchorId() {
  return "message-list-bottom"
}

export function resolveScrollRestoreAction(input: {
  hasCachedViewState: boolean
  cachedNearBottom?: boolean | null
  cachedScrollTop?: number | null
  cachedAnchorMessageId?: string | null
  persistedAnchor?: string | null
}): ScrollRestoreAction {
  const persistedAnchor = String(input.persistedAnchor || "")
  if (!input.hasCachedViewState && !persistedAnchor) return { type: "bottom" }
  if (input.cachedNearBottom) return { type: "bottom" }

  const scrollTop = Number(input.cachedScrollTop ?? 0)
  if (Number.isFinite(scrollTop) && scrollTop > 0) {
    return { type: "scrollTop", scrollTop }
  }

  const cachedAnchor = String(input.cachedAnchorMessageId || "")
  if (cachedAnchor) return { type: "anchor", anchorMessageId: cachedAnchor }
  if (persistedAnchor) return { type: "anchor", anchorMessageId: persistedAnchor }
  return { type: "bottom" }
}

export function resolveViewportSyncAction(input: {
  forceBottom?: boolean
  shouldAutoFollowBottom?: boolean
  isRestoringScroll?: boolean
  lastMeasuredScrollTop?: number | null
  allowScrollTopRestore?: boolean
}): ViewportSyncAction {
  if (input.isRestoringScroll) return { type: "none" }
  if (input.forceBottom || input.shouldAutoFollowBottom) return { type: "bottom" }
  if (!input.allowScrollTopRestore) return { type: "none" }

  const scrollTop = Number(input.lastMeasuredScrollTop ?? 0)
  if (Number.isFinite(scrollTop) && scrollTop > 0) {
    return { type: "scrollTop", scrollTop }
  }
  return { type: "none" }
}
