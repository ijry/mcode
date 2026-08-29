import {
  DEFAULT_REACHABILITY_ATTEMPTS,
  probeWithRetry,
} from "@/services/connection/reachability"

describe("connection reachability retry", () => {
  it("returns immediately when the first probe is online", async () => {
    const probe = jest.fn().mockResolvedValue({ online: true })
    const sleep = jest.fn().mockResolvedValue(undefined)

    const result = await probeWithRetry(probe, { sleep })

    expect(result).toEqual({ online: true })
    expect(probe).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it("absorbs a transient offline window and succeeds on a later attempt", async () => {
    const probe = jest
      .fn()
      .mockResolvedValueOnce({ online: false, error: "电脑端目标未在线" })
      .mockResolvedValueOnce({ online: true })
    const sleep = jest.fn().mockResolvedValue(undefined)
    const onRetry = jest.fn()

    const result = await probeWithRetry(probe, { sleep, onRetry, delayMs: 500 })

    expect(result).toEqual({ online: true })
    expect(probe).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(500)
    expect(onRetry).toHaveBeenCalledWith(1, { online: false, error: "电脑端目标未在线" })
  })

  it("keeps the last failure after exhausting attempts", async () => {
    const probe = jest.fn().mockResolvedValue({ online: false, error: "网关状态返回 HTTP 502" })
    const sleep = jest.fn().mockResolvedValue(undefined)

    const result = await probeWithRetry(probe, { sleep })

    expect(result).toEqual({ online: false, error: "网关状态返回 HTTP 502" })
    expect(probe).toHaveBeenCalledTimes(DEFAULT_REACHABILITY_ATTEMPTS)
    expect(sleep).toHaveBeenCalledTimes(DEFAULT_REACHABILITY_ATTEMPTS - 1)
  })
})
