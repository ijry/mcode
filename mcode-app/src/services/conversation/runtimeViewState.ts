export interface RenderableRuntimeStateLike {
  localTurns?: unknown[] | null
  optimisticTurns?: unknown[] | null
  liveMessage?: unknown | null
  pendingPermission?: unknown | null
  pendingQuestion?: unknown | null
}

export function hasRenderableRuntimeState(
  session: RenderableRuntimeStateLike | null | undefined
) {
  if (!session) return false
  if (Array.isArray(session.localTurns) && session.localTurns.length > 0) return true
  if (Array.isArray(session.optimisticTurns) && session.optimisticTurns.length > 0) return true
  if (session.liveMessage) return true
  if (session.pendingPermission) return true
  if (session.pendingQuestion) return true
  return false
}

export function hasVolatileRuntimeState(
  session: RenderableRuntimeStateLike | null | undefined
) {
  if (!session) return false
  if (Array.isArray(session.optimisticTurns) && session.optimisticTurns.length > 0) return true
  if (session.liveMessage) return true
  if (session.pendingPermission) return true
  if (session.pendingQuestion) return true
  return false
}

export function hasInFlightConversationDetail(detail: unknown) {
  if (!detail || typeof detail !== "object") return false
  const record = detail as Record<string, unknown>
  return Boolean(
    firstString(record.in_flight_user_turn_id, record.inFlightUserTurnId)
  )
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}
