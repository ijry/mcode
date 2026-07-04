import fs from "node:fs"
import path from "node:path"

describe("detailCyberLayout", () => {
  it("renders the cyber rain atmosphere from the detail shell", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/index.vue"),
      "utf8"
    )

    expect(source).toContain("<ConversationDetailCyberRain")
    expect(source).toContain(':enabled="cyberModeEnabled"')
    expect(source).toContain(':phase="cyberEffectPhase"')
  })

  it("threads cyber props through the detail body layers", () => {
    const body = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/ConversationDetailBody.vue"),
      "utf8"
    )
    const interactive = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue"),
      "utf8"
    )
    const readonly = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/ConversationDetailReadonlyTimeline.vue"),
      "utf8"
    )

    expect(body).toContain("cyberModeEnabled?: boolean")
    expect(body).toContain("cyberEffectPhase?: CyberEffectPhase")
    expect(body).toContain("detail-body--cyber")
    expect(interactive).toContain("cyberModeEnabled?: boolean")
    expect(interactive).toContain("detail-interactive-pane--cyber")
    expect(interactive).toContain(':cyber-mode-enabled="cyberModeEnabled"')
    expect(readonly).toContain("readonly-pane--cyber")
  })

  it("defines cyber-specific layout selectors and rain animation", () => {
    const styles = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/index.scss"),
      "utf8"
    )
    const rain = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/ConversationDetailCyberRain.vue"),
      "utf8"
    )

    expect(styles).toContain(".page--cyber")
    expect(styles).toContain("#000000")
    expect(styles).toContain(".page--cyber::before")
    expect(styles).toContain(".page--cyber::after")
    expect(styles).toContain(":deep(.detail-interactive-pane--cyber .bubble--assistant)")
    expect(styles).toContain(":deep(.detail-interactive-pane--cyber .part-thinking)")
    expect(styles).toContain(":deep(.detail-interactive-pane--cyber .input-wrap)")
    expect(styles).toContain(".detail-tabs-bar--cyber")
    expect(styles).toContain("page--cyber-streaming")
    expect(styles).toContain("@keyframes cyberScanPulse")
    expect(rain).toContain("CYBER_RAIN_COLUMN_COUNT = 18")
    expect(rain).toContain("cyber-rain--streaming")
    expect(rain).toContain("cyberRainFlicker")
    expect(rain).toContain("@keyframes cyberRainColumn")
    expect(rain).toContain("cyber-rain__column")
  })
})
