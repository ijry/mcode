const ACTIVE_SUMMARY_STATUSES = new Set(["in_progress"])
const TERMINAL_SUMMARY_STATUSES = new Set([
  "completed",
  "pending_review",
  "failed",
  "cancelled",
])

export function normalizeConversationSummaryStatus(value?: string | null): string {
  const raw = String(value || "").trim().toLowerCase().replace(/[\s-]/g, "_")
  if (!raw) return "unknown"
  if (raw === "inprogress") return "in_progress"
  if (raw === "pendingreview") return "pending_review"
  if (raw === "canceled") return "cancelled"
  if (
    raw === "thinking" ||
    raw === "running_tool" ||
    raw === "waiting_permission" ||
    raw === "connecting" ||
    raw === "prompting"
  ) {
    return "in_progress"
  }
  if (raw === "error") return "failed"
  if (raw === "idle" || raw === "connected" || raw === "disconnected") {
    return "unknown"
  }
  return raw
}

export function mapRealtimeConversationStatusToSummaryStatus(
  value: unknown,
  currentStatus?: string | null
) {
  const raw = String(value || "").trim().toLowerCase()
  const current = normalizeConversationSummaryStatus(currentStatus)
  if (!raw) return current
  if (raw === "idle" || raw === "connected" || raw === "disconnected") {
    return current && current !== "unknown" ? current : "pending_review"
  }
  return normalizeConversationSummaryStatus(raw)
}

export function mergeConversationSummaryStatus(input: {
  currentStatus?: string | null
  currentUpdatedAt?: number | null
  incomingStatus?: string | null
  incomingUpdatedAt?: number | null
}) {
  const currentStatus = normalizeConversationSummaryStatus(input.currentStatus)
  const incomingStatus = normalizeConversationSummaryStatus(input.incomingStatus)
  const currentUpdatedAt = normalizeTimestamp(input.currentUpdatedAt)
  const incomingUpdatedAt = normalizeTimestamp(input.incomingUpdatedAt)

  if (incomingStatus === "unknown") return currentStatus
  if (currentStatus === "unknown") return incomingStatus

  if (incomingUpdatedAt > currentUpdatedAt) {
    return incomingStatus
  }
  if (incomingUpdatedAt < currentUpdatedAt) {
    if (isActiveConversationSummaryStatus(currentStatus)) {
      return currentStatus
    }
    if (
      isActiveConversationSummaryStatus(incomingStatus) &&
      !isTerminalConversationSummaryStatus(currentStatus)
    ) {
      return incomingStatus
    }
    return currentStatus
  }

  if (
    isActiveConversationSummaryStatus(incomingStatus) &&
    !isTerminalConversationSummaryStatus(currentStatus)
  ) {
    return incomingStatus
  }
  if (isActiveConversationSummaryStatus(currentStatus)) {
    return currentStatus
  }
  return incomingStatus
}

export function isActiveConversationSummaryStatus(value?: string | null) {
  return ACTIVE_SUMMARY_STATUSES.has(normalizeConversationSummaryStatus(value))
}

export function isTerminalConversationSummaryStatus(value?: string | null) {
  return TERMINAL_SUMMARY_STATUSES.has(normalizeConversationSummaryStatus(value))
}

function normalizeTimestamp(value?: number | null) {
  return Number.isFinite(value) ? Number(value) : 0
}
