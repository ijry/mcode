import type { CodegGateway } from "@/services/gateway"

export const CONVERSATIONS_TABBAR_INDEX = 1

export interface ActiveSessionCounts {
  runningCount: number
  waitingCount: number
  errorCount: number
}

export interface ActiveSessionBadgeRefreshResult {
  count: number
  failed: number
}

export function normalizeActiveSessionCounts(payload: unknown): ActiveSessionCounts {
  const record = payload && typeof payload === "object"
    ? payload as Record<string, unknown>
    : {}
  const sessions = Array.isArray(record.sessions) ? record.sessions : []
  const derived = sessions.reduce(
    (counts, item) => {
      const status = firstString((item as Record<string, unknown>)?.status).toLowerCase()
      if (status === "prompting" || status === "running" || status === "thinking") {
        counts.runningCount += 1
      } else if (
        status === "waiting_permission" ||
        status === "waiting_question" ||
        status === "waiting"
      ) {
        counts.waitingCount += 1
      } else if (status === "error" || status === "failed") {
        counts.errorCount += 1
      }
      return counts
    },
    { runningCount: 0, waitingCount: 0, errorCount: 0 }
  )

  return {
    runningCount: firstNumber(record.runningCount, record.running_count) ?? derived.runningCount,
    waitingCount: firstNumber(record.waitingCount, record.waiting_count) ?? derived.waitingCount,
    errorCount: firstNumber(record.errorCount, record.error_count) ?? derived.errorCount,
  }
}

export function getOngoingActiveSessionCount(payload: unknown): number {
  const counts = normalizeActiveSessionCounts(payload)
  return Math.max(0, counts.runningCount) + Math.max(0, counts.waitingCount)
}

export function formatConversationTabBadgeText(count: number): string {
  const normalized = Math.floor(Number(count) || 0)
  if (normalized <= 0) return ""
  if (normalized > 99) return "99+"
  return String(normalized)
}

export async function fetchOngoingActiveSessionCount(gateway: CodegGateway): Promise<number> {
  const payload = await gateway.call<unknown>("pet_list_active_sessions")
  return getOngoingActiveSessionCount(payload)
}

export async function refreshConversationTabBarActiveSessionBadge(
  gateways: CodegGateway[],
  uniApi: Pick<UniApp.Uni, "setTabBarBadge" | "removeTabBarBadge"> = uni
): Promise<ActiveSessionBadgeRefreshResult> {
  const results = await Promise.allSettled(
    gateways.map((gateway) => fetchOngoingActiveSessionCount(gateway))
  )
  const count = results.reduce((sum, result) => {
    if (result.status !== "fulfilled") return sum
    return sum + result.value
  }, 0)
  const failed = results.filter((result) => result.status === "rejected").length
  await applyConversationTabBarBadge(count, uniApi)
  return { count, failed }
}

export async function applyConversationTabBarBadge(
  count: number,
  uniApi: Pick<UniApp.Uni, "setTabBarBadge" | "removeTabBarBadge"> = uni
) {
  const text = formatConversationTabBadgeText(count)
  if (!text) {
    await callUniTabBarBadgeApi(uniApi.removeTabBarBadge, {
      index: CONVERSATIONS_TABBAR_INDEX,
    })
    return
  }
  await callUniTabBarBadgeApi(uniApi.setTabBarBadge, {
    index: CONVERSATIONS_TABBAR_INDEX,
    text,
  })
}

function callUniTabBarBadgeApi<T extends Record<string, unknown>>(
  fn: ((options: T & { success?: () => void; fail?: () => void; complete?: () => void }) => void) | undefined,
  options: T
) {
  if (typeof fn !== "function") return Promise.resolve()
  return new Promise<void>((resolve) => {
    fn({
      ...options,
      success: resolve,
      fail: resolve,
      complete: resolve,
    })
  })
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, Math.floor(value))
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) {
        return Math.max(0, Math.floor(parsed))
      }
    }
  }
  return null
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}
