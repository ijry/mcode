import {
  DETAIL_TAB_MULTITASK_MODE_KEY,
  normalizeDetailTabMultitaskMode,
  readDetailTabMultitaskMode,
  writeDetailTabMultitaskMode,
} from "@/services/conversation/detailTabMultitaskPreference"

describe("detailTabMultitaskPreference", () => {
  beforeEach(() => {
    uni.removeStorageSync(DETAIL_TAB_MULTITASK_MODE_KEY)
  })

  it("defaults to off when no value exists", () => {
    expect(readDetailTabMultitaskMode()).toBe("off")
    expect(uni.getStorageSync(DETAIL_TAB_MULTITASK_MODE_KEY)).toBe("off")
  })

  it("persists all supported modes", () => {
    expect(writeDetailTabMultitaskMode("mobile")).toBe("mobile")
    expect(readDetailTabMultitaskMode()).toBe("mobile")

    expect(writeDetailTabMultitaskMode("pc")).toBe("pc")
    expect(readDetailTabMultitaskMode()).toBe("pc")

    expect(writeDetailTabMultitaskMode("off")).toBe("off")
    expect(readDetailTabMultitaskMode()).toBe("off")
  })

  it("normalizes unknown stored values to off", () => {
    uni.setStorageSync(DETAIL_TAB_MULTITASK_MODE_KEY, "desktop")

    expect(readDetailTabMultitaskMode()).toBe("off")
    expect(uni.getStorageSync(DETAIL_TAB_MULTITASK_MODE_KEY)).toBe("off")
  })

  it("rejects non-string values", () => {
    expect(normalizeDetailTabMultitaskMode(true)).toBe("off")
    expect(normalizeDetailTabMultitaskMode(null)).toBe("off")
  })
})
