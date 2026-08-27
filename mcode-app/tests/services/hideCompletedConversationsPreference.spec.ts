import {
  HIDE_COMPLETED_CONVERSATIONS_KEY,
  readHideCompletedConversations,
  writeHideCompletedConversations,
} from "@/services/conversation/hideCompletedConversationsPreference"

describe("hideCompletedConversationsPreference", () => {
  beforeEach(() => {
    uni.removeStorageSync(HIDE_COMPLETED_CONVERSATIONS_KEY)
  })

  // **默认开启（隐藏）** —— 与 localTurnCachePreference 相反，写死成断言。
  // 这个开关只影响列表的可见性、不落盘也不改数据，且隐藏起来的会话仍能从「历史会话」
  // 入口找到，所以默认帮用户清干净列表是安全的。
  it("defaults to hiding completed conversations", () => {
    expect(readHideCompletedConversations()).toBe(true)
  })

  it("persists both values", () => {
    expect(writeHideCompletedConversations(false)).toBe(false)
    expect(readHideCompletedConversations()).toBe(false)
    expect(uni.getStorageSync(HIDE_COMPLETED_CONVERSATIONS_KEY)).toBe(false)

    expect(writeHideCompletedConversations(true)).toBe(true)
    expect(readHideCompletedConversations()).toBe(true)
    expect(uni.getStorageSync(HIDE_COMPLETED_CONVERSATIONS_KEY)).toBe(true)
  })

  // 默认值为 true 时，「归一化」的方向和默认关的开关相反：**只有严格 false 才算关**。
  // 用 truthy/falsy 判会让空串（uni 的 getStorageSync 在键不存在时返回 ""）被当成
  // 「用户关掉了」，于是默认值静默失效 —— 这正是默认开的开关最容易踩的坑。
  it("treats only a strict false as disabled", () => {
    uni.setStorageSync(HIDE_COMPLETED_CONVERSATIONS_KEY, "")
    expect(readHideCompletedConversations()).toBe(true)

    uni.setStorageSync(HIDE_COMPLETED_CONVERSATIONS_KEY, 0)
    expect(readHideCompletedConversations()).toBe(true)

    uni.setStorageSync(HIDE_COMPLETED_CONVERSATIONS_KEY, "false")
    expect(readHideCompletedConversations()).toBe(true)

    uni.setStorageSync(HIDE_COMPLETED_CONVERSATIONS_KEY, false)
    expect(readHideCompletedConversations()).toBe(false)
  })

  it("writes the normalized boolean back so later reads are plain booleans", () => {
    uni.setStorageSync(HIDE_COMPLETED_CONVERSATIONS_KEY, "false")
    readHideCompletedConversations()
    expect(uni.getStorageSync(HIDE_COMPLETED_CONVERSATIONS_KEY)).toBe(true)
  })

  it("is a pure preference module with no SQLite dependency", () => {
    // 与 localTurnCachePreference 同样的约束：它会被页面和纯函数层同时 import，
    // 任何一处都不能被拖进 `services/db`（`sql.js` 的 `?url` 导入在 jest 里直接炸）。
    const module = require("@/services/conversation/hideCompletedConversationsPreference")
    expect(typeof module.readHideCompletedConversations).toBe("function")
    expect(typeof module.writeHideCompletedConversations).toBe("function")
  })
})
