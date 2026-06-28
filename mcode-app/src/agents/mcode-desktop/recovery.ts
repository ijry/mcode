type StatusLike = { status?: unknown } | null | undefined

export function isDesktopInterruptedSession(session: StatusLike) {
  return normalizeStatus(session) === "interrupted"
}

export function isDesktopStaleInteraction(interaction: StatusLike) {
  return normalizeStatus(interaction) === "stale"
}

export function describeDesktopRecoverySession(session: StatusLike) {
  if (!isDesktopInterruptedSession(session)) return ""
  return "Desktop 重启后，官方 CLI 进程不能原地恢复。请重新发送下一条提示。"
}

export function describeDesktopRecoveryInteraction(interaction: StatusLike) {
  if (!isDesktopStaleInteraction(interaction)) return ""
  return "这个授权或问题来自已中断的 Desktop 进程，已失效。请重新发起任务。"
}

function normalizeStatus(value: StatusLike) {
  return typeof value?.status === "string" ? value.status.trim().toLowerCase() : ""
}
