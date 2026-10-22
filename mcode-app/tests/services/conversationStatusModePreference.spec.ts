import {
  CONVERSATION_STATUS_MODE_KEY,
  readConversationStatusMode,
  writeConversationStatusMode,
} from "@/services/conversation/conversationStatusModePreference"

/**
 * 状态筛选模式偏好的归一化健壮性：只认四个合法枚举，其余一切（键不存在的空串、
 * 字符串 "all"、拼写错、大小写错）都退回默认 `all`。与旧版「隐藏已完成」只认严格
 * `false` 为关的方向不同 —— 这里是「非合法枚举即默认」，因为非法值没有有意义的语义。
 */
describe("conversationStatusModePreference", () => {
  beforeEach(() => {
    uni.removeStorageSync(CONVERSATION_STATUS_MODE_KEY)
  })

  it("defaults to all when nothing is stored", () => {
    expect(readConversationStatusMode()).toBe("all")
  })

  it("persists a written mode and reads it back", () => {
    expect(writeConversationStatusMode("archived")).toBe("archived")
    expect(uni.getStorageSync(CONVERSATION_STATUS_MODE_KEY)).toBe("archived")
    expect(readConversationStatusMode()).toBe("archived")
  })

  it("round-trips every valid mode", () => {
    for (const mode of ["all", "running", "pinned", "archived"] as const) {
      writeConversationStatusMode(mode)
      expect(readConversationStatusMode()).toBe(mode)
    }
  })

  it("falls back to all on garbage input", () => {
    // 注意：带前后空格的**合法枚举**（如 " running "）会先被 trim 再判定，属于可回收值，
    // 不算垃圾；这里只放真正无法映射到四模式的输入。
    for (const garbage of ["", " ", "ARCHIVED", "pending", 0, null, undefined, {}]) {
      uni.setStorageSync(CONVERSATION_STATUS_MODE_KEY, garbage)
      expect(readConversationStatusMode()).toBe("all")
    }
  })

  it("trims and recovers a padded but valid mode", () => {
    uni.setStorageSync(CONVERSATION_STATUS_MODE_KEY, " pinned ")
    expect(readConversationStatusMode()).toBe("pinned")
  })

  it("normalizes and rewrites a malformed stored value back to a clean enum", () => {
    uni.setStorageSync(CONVERSATION_STATUS_MODE_KEY, " pinned ")
    expect(readConversationStatusMode()).toBe("pinned")
    // 回写归一化后的值，后续读取不再依赖宽容解析。
    expect(uni.getStorageSync(CONVERSATION_STATUS_MODE_KEY)).toBe("pinned")
  })
})
