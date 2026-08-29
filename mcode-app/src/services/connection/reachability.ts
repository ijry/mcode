/**
 * 连接可达性探测的重试策略。
 *
 * 背景：`/v1/targets` 返回的 `online` 直接等价于「桌面端此刻是否注册在 relay 的
 * WebSocket 表里」（`hub.isDesktopOnline` 就是 `desktops.has(targetId)`，没有心跳宽限）。
 * 桌面端上游断线重连有 1s 起的指数退避，因此配对刚成功那一瞬间探测到 offline 是常态，
 * 而不是真的连不上 —— 这正是「第一次确认失败、第二次确认就成功」的直接原因。
 *
 * 这里把「单次探测」改成「短窗口内多次探测」，把这段抖动吸收在一次用户操作里。
 */

export interface ReachabilityProbeResult {
  online: boolean
  error?: string
}

export interface ProbeWithRetryOptions {
  /** 总尝试次数（含首次）。 */
  attempts?: number
  /** 相邻两次尝试之间的间隔，毫秒。 */
  delayMs?: number
  /** 注入 sleep 便于测试。 */
  sleep?: (ms: number) => Promise<void>
  /** 每次失败后回调，用于把「正在第 N 次重试」反馈到 UI。 */
  onRetry?: (attempt: number, result: ReachabilityProbeResult) => void
}

export const DEFAULT_REACHABILITY_ATTEMPTS = 3
export const DEFAULT_REACHABILITY_RETRY_DELAY_MS = 1200

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function probeWithRetry(
  probe: () => Promise<ReachabilityProbeResult>,
  options: ProbeWithRetryOptions = {}
): Promise<ReachabilityProbeResult> {
  const attempts = Math.max(1, options.attempts ?? DEFAULT_REACHABILITY_ATTEMPTS)
  const delayMs = Math.max(0, options.delayMs ?? DEFAULT_REACHABILITY_RETRY_DELAY_MS)
  const sleep = options.sleep ?? defaultSleep

  let last: ReachabilityProbeResult = { online: false }
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = await probe()
    if (last.online) return last
    options.onRetry?.(attempt, last)
    if (attempt < attempts && delayMs > 0) {
      await sleep(delayMs)
    }
  }
  return last
}
