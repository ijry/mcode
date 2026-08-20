import {
  LOCAL_TURN_CACHE_ENABLED_KEY,
  readLocalTurnCacheEnabled,
  writeLocalTurnCacheEnabled,
} from "@/services/conversation/localTurnCachePreference"

describe("localTurnCachePreference", () => {
  beforeEach(() => {
    uni.removeStorageSync(LOCAL_TURN_CACHE_ENABLED_KEY)
  })

  // 默认关闭是这个开关的核心约定：它挂在设置页「实验性功能」里，老用户升级上来
  // 不该突然开始往本机写会话内容。写死成断言，避免哪天改默认值时只有 UI 静默变了。
  it("defaults to disabled when no value exists", () => {
    expect(readLocalTurnCacheEnabled()).toBe(false)
  })

  it("persists enabled and disabled values", () => {
    expect(writeLocalTurnCacheEnabled(true)).toBe(true)
    expect(readLocalTurnCacheEnabled()).toBe(true)
    expect(uni.getStorageSync(LOCAL_TURN_CACHE_ENABLED_KEY)).toBe(true)

    expect(writeLocalTurnCacheEnabled(false)).toBe(false)
    expect(readLocalTurnCacheEnabled()).toBe(false)
    expect(uni.getStorageSync(LOCAL_TURN_CACHE_ENABLED_KEY)).toBe(false)
  })

  // 归一化必须是「只认严格 true」，不能用 truthy 判断：老版本或异常写入留下的
  // 字符串（`"true"` / `"yes"`）会被 truthy 判成开启，用户从没打开过的开关就自己
  // 生效了 —— 而且它控制的是往本机落盘。
  it("normalizes unknown stored values to disabled", () => {
    uni.setStorageSync(LOCAL_TURN_CACHE_ENABLED_KEY, "yes")
    expect(readLocalTurnCacheEnabled()).toBe(false)
    expect(uni.getStorageSync(LOCAL_TURN_CACHE_ENABLED_KEY)).toBe(false)

    uni.setStorageSync(LOCAL_TURN_CACHE_ENABLED_KEY, "true")
    expect(readLocalTurnCacheEnabled()).toBe(false)

    uni.setStorageSync(LOCAL_TURN_CACHE_ENABLED_KEY, 1)
    expect(readLocalTurnCacheEnabled()).toBe(false)
  })

  it("is a pure preference module with no SQLite dependency", () => {
    // 读写点分布在 store / 页面 / 落库服务三处，任何一处 import 它都不能被拖进
    // `services/db`（`sql.js` 的 `?url` 导入在 jest 里直接炸）。这条断言锁住
    // 「纯模块」这个性质：模块能被单独 require 出来就说明没有传染性依赖。
    const module = require("@/services/conversation/localTurnCachePreference")
    expect(typeof module.readLocalTurnCacheEnabled).toBe("function")
    expect(typeof module.writeLocalTurnCacheEnabled).toBe("function")
  })
})
