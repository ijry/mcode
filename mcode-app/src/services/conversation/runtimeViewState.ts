export interface RenderableRuntimeStateLike {
  localTurns?: unknown[] | null
  optimisticTurns?: unknown[] | null
  liveMessage?: unknown | null
  pendingPermission?: unknown | null
}

export function hasRenderableRuntimeState(
  session: RenderableRuntimeStateLike | null | undefined
) {
  if (!session) return false
  if (Array.isArray(session.localTurns) && session.localTurns.length > 0) return true
  if (Array.isArray(session.optimisticTurns) && session.optimisticTurns.length > 0) return true
  if (session.liveMessage) return true
  if (session.pendingPermission) return true
  return false
}
