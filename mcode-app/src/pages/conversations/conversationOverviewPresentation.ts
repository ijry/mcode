export function resolveOverviewCardDisplayStatus(
  summaryStatus: string,
  runtimeStatus?: string | null
) {
  const normalizedSummaryStatus = normalizeOverviewStatus(summaryStatus)
  const normalizedRuntimeStatus = normalizeOverviewStatus(runtimeStatus)
  if (!normalizedRuntimeStatus) return normalizedSummaryStatus
  if (normalizedRuntimeStatus === "error") {
    return "failed"
  }
  if (isRuntimeExecutionStatus(normalizedRuntimeStatus)) {
    return "in_progress"
  }
  return normalizedSummaryStatus
}

function isRuntimeExecutionStatus(status: string) {
  return (
    status === "thinking" ||
    status === "running_tool" ||
    status === "waiting_permission" ||
    status === "waiting_question"
  )
}

function normalizeOverviewStatus(value?: string | null) {
  return String(value || "").trim().toLowerCase()
}
