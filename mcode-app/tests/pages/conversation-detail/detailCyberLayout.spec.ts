import fs from "node:fs"
import path from "node:path"

describe("detailCyberLayout", () => {
  it("renders the cyber rain atmosphere from the detail shell", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/index.vue"),
      "utf8"
    )

    expect(source).toContain("<ConversationDetailCyberRain")
    expect(source).toContain(':enabled="detailTheme === \'matrix\'"')
    expect(source).toContain("<ConversationDetailSweetBubbles")
    expect(source).toContain(':enabled="detailTheme === \'sweet\'"')
    expect(source).toContain("<ConversationDetailSummerAtmosphere")
    expect(source).toContain(':enabled="detailTheme === \'summer\'"')
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

    expect(body).toContain("detailTheme?: DetailThemeId")
    expect(body).toContain("cyberEffectPhase?: CyberEffectPhase")
    expect(body).toContain("detail-body--cyber")
    expect(interactive).toContain("detailTheme?: DetailThemeId")
    expect(interactive).toContain("detail-interactive-pane--cyber")
    expect(interactive).toContain(':detail-theme="detailTheme"')
    expect(readonly).toContain("readonly-pane--cyber")
    expect(readonly).toContain("readonly-pane--sweet")
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
    const sweet = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/ConversationDetailSweetBubbles.vue"),
      "utf8"
    )

    expect(styles).toContain(".page--cyber")
    expect(styles).toContain(".page--sweet")
    expect(styles).toContain(".page--summer")
    expect(styles).toContain("#000000")
    expect(styles).toContain(".page--cyber::before")
    expect(styles).toContain(".page--cyber::after")
    expect(styles).toContain(".page--sweet::before")
    expect(styles).toContain(":deep(.detail-interactive-pane--theme-sweet .input-wrap)")
    expect(styles).toContain(":deep(.detail-interactive-pane--theme-summer .input-wrap)")
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
    expect(sweet).toContain("sweet-bubbles__item")
    expect(sweet).toContain("@keyframes sweetBubbleFloat")
  })

  it("animates the cyber status capsule with state-aware motion and reduced-motion fallback", () => {
    const interactive = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue"),
      "utf8"
    )
    const body = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/ConversationDetailBody.vue"),
      "utf8"
    )

    expect(interactive).toContain("input-status-row--${runtimeStatusClass}")
    expect(interactive).toContain("input-status-row--thinking")
    expect(interactive).toContain("input-status-row--running-tool")
    expect(body).toContain("@keyframes cyberStatusDotPulse")
    expect(body).toContain("@keyframes cyberStatusTextFlicker")
    expect(body).toContain("prefers-reduced-motion: reduce")
    expect(body).toContain("animation: none !important")
  })

  it("drops the inner left-to-right sweep and keeps the border animation", () => {
    const body = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/ConversationDetailBody.vue"),
      "utf8"
    )
    const styles = fs.readFileSync(path.resolve(__dirname, "../../../src/pages/conversation-detail/index.scss"), "utf8")

    // 用户要求：胶囊内部那条从左到右扫过的高光不要了，边框动画留着。
    // `.input-status-wrap__content` 本身是布局容器，保留；被删的是挂在它上面的 ::before 高光层。
    expect(body).not.toContain("input-status-wrap__content::before")
    expect(body).not.toContain("cyberStatusSweep")
    // 边框动画 = ::before 的旋转 conic-gradient + wrap 自身的外发光脉冲。
    expect(body).toContain("@keyframes inputStatusLedSpin")
    expect(body).toContain("animation: inputStatusLedSpin")
    expect(styles).toContain("@keyframes cyberScanPulse")
    expect(styles).toContain("animation: cyberScanPulse")
  })
})
