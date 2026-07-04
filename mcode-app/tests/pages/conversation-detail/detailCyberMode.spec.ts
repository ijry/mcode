import {
  DETAIL_CYBER_MODE_STORAGE_KEY,
  buildCyberDecodeText,
  buildCyberModeMenuAction,
  deriveCyberEffectPhase,
  normalizeCyberModeStorage,
  shouldShowDetailBackgroundImage,
} from "@/pages/conversation-detail/detailCyberMode"

describe("detailCyberMode", () => {
  it("normalizes stored toggle snapshots and menu actions", () => {
    expect(DETAIL_CYBER_MODE_STORAGE_KEY).toBe("mcode_detail_cyber_mode_v1")
    expect(normalizeCyberModeStorage(true)).toBe(true)
    expect(normalizeCyberModeStorage('{"enabled":true}')).toBe(true)
    expect(normalizeCyberModeStorage('{"enabled":false}')).toBe(false)
    expect(normalizeCyberModeStorage("garbage")).toBe(false)
    expect(buildCyberModeMenuAction(false)).toEqual({
      name: "炫酷模式",
      color: "#22c55e",
    })
    expect(buildCyberModeMenuAction(true)).toEqual({
      name: "关闭炫酷模式",
      color: "#19be6b",
    })
  })

  it("derives phases and background precedence", () => {
    expect(shouldShowDetailBackgroundImage({
      cyberModeEnabled: false,
      detailBackgroundImageUrl: "file://bg.png",
    })).toBe(true)
    expect(shouldShowDetailBackgroundImage({
      cyberModeEnabled: true,
      detailBackgroundImageUrl: "file://bg.png",
    })).toBe(false)

    expect(deriveCyberEffectPhase({
      cyberModeEnabled: true,
      runtimeStatus: "idle",
      hasLiveMessage: false,
      lastStreamEndedAt: 0,
      now: 100,
    })).toBe("idle")
    expect(deriveCyberEffectPhase({
      cyberModeEnabled: true,
      runtimeStatus: "thinking",
      hasLiveMessage: false,
      lastStreamEndedAt: 0,
      now: 100,
    })).toBe("ramp")
    expect(deriveCyberEffectPhase({
      cyberModeEnabled: true,
      runtimeStatus: "thinking",
      hasLiveMessage: true,
      lastStreamEndedAt: 0,
      now: 100,
    })).toBe("streaming")
    expect(deriveCyberEffectPhase({
      cyberModeEnabled: true,
      runtimeStatus: "idle",
      hasLiveMessage: false,
      lastStreamEndedAt: 1_000,
      now: 1_600,
    })).toBe("settle")
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
