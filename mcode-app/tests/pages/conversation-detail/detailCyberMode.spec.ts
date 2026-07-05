import {
  DETAIL_THEME_OPTIONS,
  DETAIL_THEME_STORAGE_KEY,
  DETAIL_CYBER_MODE_STORAGE_KEY,
  buildCyberDecodeText,
  buildCyberModeMenuAction,
  buildDetailThemeMenuActions,
  deriveCyberEffectPhase,
  normalizeDetailThemeStorage,
  normalizeCyberModeStorage,
  shouldShowDetailBackgroundImage,
} from "@/pages/conversation-detail/detailCyberMode"

describe("detailCyberMode", () => {
  it("normalizes stored toggle snapshots and menu actions", () => {
    expect(DETAIL_THEME_STORAGE_KEY).toBe("mcode_detail_theme_v1")
    expect(DETAIL_CYBER_MODE_STORAGE_KEY).toBe("mcode_detail_cyber_mode_v1")
    expect(DETAIL_THEME_OPTIONS).toHaveLength(4)
    expect(normalizeDetailThemeStorage("sweet")).toBe("sweet")
    expect(normalizeDetailThemeStorage("summer")).toBe("summer")
    expect(normalizeDetailThemeStorage('{"theme":"matrix"}')).toBe("matrix")
    expect(normalizeDetailThemeStorage('{"enabled":true}')).toBe("matrix")
    expect(normalizeDetailThemeStorage("garbage")).toBe("default")
    expect(normalizeCyberModeStorage(true)).toBe(true)
    expect(normalizeCyberModeStorage('{"enabled":true}')).toBe(true)
    expect(normalizeCyberModeStorage('{"enabled":false}')).toBe(false)
    expect(normalizeCyberModeStorage("garbage")).toBe(false)
    expect(buildDetailThemeMenuActions("sweet").map((item) => item.id)).toEqual([
      "default",
      "matrix",
      "sweet",
      "summer",
    ])
    expect(buildDetailThemeMenuActions("summer").map((item) => item.id)).toEqual([
      "default",
      "matrix",
      "sweet",
      "summer",
    ])
    expect(buildCyberModeMenuAction(false)).toEqual({
      name: "微黑暗帝国",
      color: "#22c55e",
    })
    expect(buildCyberModeMenuAction(true)).toEqual({
      name: "关闭微黑暗帝国",
      color: "#19be6b",
    })
  })

  it("derives phases and background precedence", () => {
    expect(shouldShowDetailBackgroundImage({
      detailTheme: "default",
      detailBackgroundImageUrl: "file://bg.png",
    })).toBe(true)
    expect(shouldShowDetailBackgroundImage({
      detailTheme: "matrix",
      detailBackgroundImageUrl: "file://bg.png",
    })).toBe(false)
    expect(shouldShowDetailBackgroundImage({
      detailTheme: "sweet",
      detailBackgroundImageUrl: "file://bg.png",
    })).toBe(false)
    expect(shouldShowDetailBackgroundImage({
      detailTheme: "summer",
      detailBackgroundImageUrl: "file://bg.png",
    })).toBe(false)

    expect(deriveCyberEffectPhase({
      detailTheme: "matrix",
      runtimeStatus: "idle",
      hasLiveMessage: false,
      lastStreamEndedAt: 0,
      now: 100,
    })).toBe("idle")
    expect(deriveCyberEffectPhase({
      detailTheme: "sweet",
      runtimeStatus: "thinking",
      hasLiveMessage: false,
      lastStreamEndedAt: 0,
      now: 100,
    })).toBe("ramp")
    expect(deriveCyberEffectPhase({
      detailTheme: "matrix",
      runtimeStatus: "thinking",
      hasLiveMessage: true,
      lastStreamEndedAt: 0,
      now: 100,
    })).toBe("streaming")
    expect(deriveCyberEffectPhase({
      detailTheme: "sweet",
      runtimeStatus: "idle",
      hasLiveMessage: false,
      lastStreamEndedAt: 1_000,
      now: 1_600,
    })).toBe("settle")
    expect(deriveCyberEffectPhase({
      detailTheme: "summer",
      runtimeStatus: "thinking",
      hasLiveMessage: false,
      lastStreamEndedAt: 0,
      now: 100,
    })).toBe("ramp")
  })

  it("keeps decode text length stable while revealing the prefix first", () => {
    const text = "hello world"
    const early = buildCyberDecodeText({ text, progress: 0.2, tick: 1 })
    const late = buildCyberDecodeText({ text, progress: 0.8, tick: 1 })

    expect(early).toHaveLength(text.length)
    expect(late).toHaveLength(text.length)
    expect(late.startsWith("hello")).toBe(true)
    expect(late).not.toBe(text)
  })
})
