import {
  createDebouncedStorageAdapter,
  flushPersistedStores,
  syncStorageAdapter,
} from "@/stores/persistStorage"

/**
 * pinia 持久化的存储适配器。
 *
 * `uni.setStorageSync` 是同步主线程调用，而 persistedstate 是「每个发生变更的 tick 落一次
 * 整个 state」。pet store 被实时事件高频驱动（每次 `running_tool` 翻转都写两次），
 * 立即写等于把阻塞 IO 插进流式热路径 —— 所以那一份走防抖。
 *
 * 防抖必须满足两条，否则会丢数据：读要看得到还压在窗口里的值；关页面/切后台要能冲。
 */
describe("persistStorage adapters", () => {
  const setStorageSync = uni.setStorageSync as jest.MockedFunction<
    typeof uni.setStorageSync
  >

  beforeEach(() => {
    jest.useFakeTimers()
    flushPersistedStores()
    setStorageSync.mockClear()
  })

  afterEach(() => {
    flushPersistedStores()
    jest.useRealTimers()
  })

  describe("syncStorageAdapter", () => {
    it("writes through immediately", () => {
      syncStorageAdapter.setItem("k-sync", "v1")
      expect(setStorageSync).toHaveBeenCalledWith("k-sync", "v1")
      expect(syncStorageAdapter.getItem("k-sync")).toBe("v1")
    })
  })

  describe("createDebouncedStorageAdapter", () => {
    it("collapses a burst of writes into one storage call", () => {
      const adapter = createDebouncedStorageAdapter(500)

      adapter.setItem("k-burst", "v1")
      adapter.setItem("k-burst", "v2")
      adapter.setItem("k-burst", "v3")
      expect(setStorageSync).not.toHaveBeenCalled()

      jest.advanceTimersByTime(500)
      expect(setStorageSync).toHaveBeenCalledTimes(1)
      expect(setStorageSync).toHaveBeenCalledWith("k-burst", "v3")
    })

    it("reads back the pending value before it lands", () => {
      const adapter = createDebouncedStorageAdapter(500)

      adapter.setItem("k-read", "pending")
      // 同一 tick 内「写完立刻读」必须拿到刚写的值，否则 store 恢复会读到旧 state。
      expect(adapter.getItem("k-read")).toBe("pending")
      expect(setStorageSync).not.toHaveBeenCalled()

      jest.advanceTimersByTime(500)
      expect(adapter.getItem("k-read")).toBe("pending")
    })

    it("flushes on demand so nothing is lost when the page goes away", () => {
      const adapter = createDebouncedStorageAdapter(5_000)

      adapter.setItem("k-flush", "v1")
      expect(setStorageSync).not.toHaveBeenCalled()

      flushPersistedStores()
      expect(setStorageSync).toHaveBeenCalledWith("k-flush", "v1")

      // 冲过之后没有残留，再推进时间也不该重复写。
      setStorageSync.mockClear()
      jest.advanceTimersByTime(10_000)
      expect(setStorageSync).not.toHaveBeenCalled()
    })

    it("keeps the latest value per key across several keys", () => {
      const adapter = createDebouncedStorageAdapter(500)

      adapter.setItem("k-a", "a1")
      adapter.setItem("k-b", "b1")
      adapter.setItem("k-a", "a2")

      jest.advanceTimersByTime(500)
      expect(setStorageSync).toHaveBeenCalledTimes(2)
      expect(setStorageSync).toHaveBeenCalledWith("k-a", "a2")
      expect(setStorageSync).toHaveBeenCalledWith("k-b", "b1")
    })

    it("keeps writing after a flush", () => {
      const adapter = createDebouncedStorageAdapter(500)

      adapter.setItem("k-again", "v1")
      flushPersistedStores()
      setStorageSync.mockClear()

      adapter.setItem("k-again", "v2")
      jest.advanceTimersByTime(500)
      expect(setStorageSync).toHaveBeenCalledWith("k-again", "v2")
    })

    it("is a no-op to flush when nothing is pending", () => {
      flushPersistedStores()
      expect(setStorageSync).not.toHaveBeenCalled()
    })
  })
})
