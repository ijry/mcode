/**
 * 消息列表首次进入时的滚动落点。
 *
 * - `bottom`：贴底（近底缓存 / 无缓存 / 无锚点时的兜底）
 * - `scrollTop`：按上次记录的像素偏移还原
 * - `anchor`：按消息锚点还原，适用于高度尚未测量完的场景
 */
export type ScrollRestoreAction =
  | { type: "bottom" }
  | { type: "scrollTop"; scrollTop: number }
  | { type: "anchor"; anchorMessageId: string }

/**
 * 视口跟随的下一步动作。比 `ScrollRestoreAction` 多一个 `none` ——
 * 正在还原滚动、或不允许按偏移还原时，就应该什么都不做，
 * 而不是退回贴底（那会在用户向上翻看历史时把他拽回底部）。
 */
export type ViewportSyncAction =
  | { type: "none" }
  | { type: "bottom" }
  | { type: "scrollTop"; scrollTop: number }

function normalizeAnchorPart(value?: string | number | null) {
  const normalized = String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "_")
  return normalized.replace(/^_+|_+$/g, "")
}

export function messageAnchorId(messageId: string, scope?: string | number | null) {
  const normalizedMessageId = normalizeAnchorPart(messageId)
  const normalizedScope = normalizeAnchorPart(scope)
  return normalizedScope ? `msg-${normalizedScope}-${normalizedMessageId}` : `msg-${normalizedMessageId}`
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

export function bottomAnchorId(scope?: string | number | null) {
  const normalizedScope = normalizeAnchorPart(scope)
  return normalizedScope ? `message-list-bottom-${normalizedScope}` : "message-list-bottom"
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

export function resolveNearBottomState(input: {
  scrollTop: number
  scrollHeight: number
  viewportHeight?: number | null
  fallbackViewportHeight?: number | null
  threshold?: number | null
}) {
  const scrollTop = Math.max(0, Number(input.scrollTop || 0))
  const scrollHeight = Math.max(0, Number(input.scrollHeight || 0))
  const viewportHeight = Math.max(
    0,
    Number(input.viewportHeight || 0) || Number(input.fallbackViewportHeight || 0)
  )
  const threshold = Math.max(0, Number(input.threshold ?? 72))

  if (scrollHeight <= 0 || viewportHeight <= 0) {
    return { canMeasure: false, nearBottom: false, distanceToBottom: 0 }
  }

  const distanceToBottom = Math.max(0, scrollHeight - (scrollTop + viewportHeight))
  return {
    canMeasure: true,
    nearBottom: distanceToBottom <= threshold,
    distanceToBottom,
  }
}
