/**
 * pinia-plugin-persistedstate 的存储适配器。
 *
 * `uni.setStorageSync` 在所有平台都是**同步**主线程调用（Android 上单次可达数毫秒），
 * 而 persistedstate 是「每个发生变更的 tick 落一次整个 state」。对低频 store（登录态、
 * 配对目标）无所谓；对被实时事件驱动的 store 就是把阻塞 IO 直接插进流式热路径。
 *
 * 所以这里给两个适配器，按 store 的写入频率选：
 *
 * - `syncStorageAdapter`：立即写。用于低频且「丢一次就麻烦」的状态（auth / targets / session）。
 * - `createDebouncedStorageAdapter()`：尾防抖合并。用于高频装饰性状态（pet 的经验值、
 *   统计计数）—— 那些数据没有任何理由在同一秒内落盘多次。
 *
 * 防抖的那批必须能被冲掉，否则关页面会丢最后一个窗口内的写：模块自己挂
 * `pagehide` / `visibilitychange`，同时导出 `flushPersistedStores()` 给 `App.vue`
 * 的 `onHide` 用（原生端没有上面那两个 DOM 事件）。
 */

export interface PersistStorageAdapter {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export const syncStorageAdapter: PersistStorageAdapter = {
  getItem: (key: string) => uni.getStorageSync(key),
  setItem: (key: string, value: string) => {
    uni.setStorageSync(key, value)
  },
}

const DEFAULT_PERSIST_DEBOUNCE_MS = 600

/** key → 最后一次待落盘的值。同一个 key 只保留最新值。 */
const pendingWrites = new Map<string, string>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
let pageHideHookInstalled = false

function flushPendingWrites() {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (pendingWrites.size === 0) return
  for (const [key, value] of pendingWrites) {
    try {
      uni.setStorageSync(key, value)
    } catch (error) {
      console.warn("persist flush failed", key, error)
    }
  }
  pendingWrites.clear()
}

/** 把所有防抖中的持久化写立刻落盘。`App.vue` 的 `onHide` 要调。 */
export function flushPersistedStores() {
  flushPendingWrites()
}

function installPageHideHook() {
  if (pageHideHookInstalled) return
  if (typeof window === "undefined" || typeof document === "undefined") return
  pageHideHookInstalled = true
  window.addEventListener("pagehide", flushPendingWrites)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingWrites()
  })
}

export function createDebouncedStorageAdapter(
  debounceMs: number = DEFAULT_PERSIST_DEBOUNCE_MS
): PersistStorageAdapter {
  installPageHideHook()
  return {
    getItem: (key: string) => {
      // 读要看得到还压在防抖里的那次写，否则同一 tick 内「写完立刻读」会拿到旧值。
      const pending = pendingWrites.get(key)
      if (pending !== undefined) return pending
      return uni.getStorageSync(key)
    },
    setItem: (key: string, value: string) => {
      pendingWrites.set(key, value)
      if (flushTimer) return
      flushTimer = setTimeout(() => {
        flushTimer = null
        flushPendingWrites()
      }, debounceMs)
    },
  }
}
