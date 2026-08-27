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

/**
 * 这张卡是否该因为「隐藏已完成会话」而被藏起来。
 *
 * **入参必须是 `displayStatus`，不是 summary 原值。** 一个状态是 `completed`、但此刻
 * runtime 正在跑的会话，`resolveOverviewCardDisplayStatus` 会把它提升成 `in_progress`
 * —— 那种会话绝不能藏。传原值就会把它藏掉。
 *
 * **只挡 `completed`。** `pending_review`（列表上的「待处理」）是轮次跑完的常态状态，
 * 藏它等于让「刚跑完等我看结果」的会话消失；`failed` / `cancelled` 可能还需要用户重试。
 * 理由详见 `hideCompletedConversationsPreference` 的模块注释。
 *
 * 归一化与 `resolveOverviewCardDisplayStatus` 共用同一个 helper —— 状态串来自服务端且
 * 不是封闭枚举（`normalizeConversationSummaryStatus` 会原样透传未知值），两边不同源的话
 * `" Completed "` 这类漂移写法会绕过过滤。
 */
export function shouldHideCompletedOverviewCard(
  displayStatus: string,
  hideCompleted: boolean
): boolean {
  if (!hideCompleted) return false
  return normalizeOverviewStatus(displayStatus) === "completed"
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
