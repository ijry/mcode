import { acpApi } from "@/api/acp"

/**
 * 桥接失败后的兜底轮询：句柄、退避、停止。
 *
 * 这三条以前一条都没有 —— 自续期的 `setTimeout(poll, 1000)` 不保存句柄、没有任何
 * clear 入口、不管超时/断网/502 都固定 1 秒重打，也不会因为 WebSocket 恢复而停。
 * 冷启动时 `App.vue` 就会订阅全局事件，主机不可达一次即永久落入 1 Hz 真网络请求。
 */
describe("acpApi fallback polling lifecycle", () => {
  beforeEach(() => {
    jest.useFakeTimers()
    acpApi.stopPolling()
  })

  afterEach(() => {
    acpApi.stopPolling()
    acpApi.__setRequestHookForTest(null)
    jest.useRealTimers()
  })

  /** poll 一轮要穿过好几层 await，microtask 队列得多放几次。 */
  async function flush() {
    for (let index = 0; index < 8; index += 1) {
      await Promise.resolve()
    }
  }

  async function tick(ms: number) {
    jest.advanceTimersByTime(ms)
    await flush()
  }

  function trackPollRequests() {
    const calls: string[] = []
    acpApi.__setRequestHookForTest((endpoint: string) => {
      calls.push(endpoint)
      return []
    })
    return calls
  }

  function trackFailingPollRequests(message: string) {
    const calls: string[] = []
    acpApi.__setRequestHookForTest((endpoint: string) => {
      calls.push(endpoint)
      throw new Error(message)
    })
    return calls
  }

  it("is idle by default and stopPolling is idempotent", () => {
    expect(acpApi.isPolling()).toBe(false)
    acpApi.stopPolling()
    acpApi.stopPolling()
    expect(acpApi.isPolling()).toBe(false)
  })

  it("polls on the base interval while healthy", async () => {
    const calls = trackPollRequests()
    acpApi.__startPollingForTest("test-instance")
    expect(acpApi.isPolling()).toBe(true)

    await flush()
    expect(calls).toEqual(["/acp_poll_events"])

    await tick(1000)
    expect(calls).toHaveLength(2)

    await tick(1000)
    expect(calls).toHaveLength(3)
  })

  it("stops issuing requests after stopPolling", async () => {
    const calls = trackPollRequests()
    acpApi.__startPollingForTest("test-instance")
    await flush()
    const before = calls.length

    acpApi.stopPolling()
    expect(acpApi.isPolling()).toBe(false)

    // 停掉之后再怎么推进时间都不该有新请求 —— 这是「一旦启动就停不下来」的回归闸。
    await tick(60_000)
    expect(calls).toHaveLength(before)
  })

  it("does not start a second chain while one is running", async () => {
    const calls = trackPollRequests()
    acpApi.__startPollingForTest("test-instance")
    acpApi.__startPollingForTest("test-instance")
    await flush()
    expect(calls).toHaveLength(1)
  })

  it("backs off exponentially on failure instead of hammering at 1 Hz", async () => {
    const calls = trackFailingPollRequests("network unreachable")

    acpApi.__startPollingForTest("test-instance")
    await flush()
    expect(calls).toHaveLength(1)

    // 第一次失败之后间隔已经是 2s：1s 时不该发新的。
    await tick(1000)
    expect(calls).toHaveLength(1)
    await tick(1000)
    expect(calls).toHaveLength(2)

    // 第二次失败 → 4s。
    await tick(2000)
    expect(calls).toHaveLength(2)
    await tick(2000)
    expect(calls).toHaveLength(3)
  })

  it("returns to the base interval after a success", async () => {
    let shouldFail = true
    const calls: string[] = []
    acpApi.__setRequestHookForTest((endpoint: string) => {
      calls.push(endpoint)
      if (shouldFail) throw new Error("network unreachable")
      return []
    })

    acpApi.__startPollingForTest("test-instance")
    await flush()
    expect(calls).toHaveLength(1)

    shouldFail = false
    await tick(2000)
    expect(calls).toHaveLength(2)

    // 成功一次就该回到 1s，而不是继续按退避后的间隔。
    await tick(1000)
    expect(calls).toHaveLength(3)
  })

  it("stops for good when the host reports web mode", async () => {
    const calls = trackFailingPollRequests(
      "acp_poll_events is not available in web mode"
    )

    acpApi.__startPollingForTest("test-instance")
    await flush()

    expect(acpApi.isPolling()).toBe(false)
    await tick(60_000)
    expect(calls).toHaveLength(1)
  })
})
