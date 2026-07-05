import fs from "node:fs"
import path from "node:path"

describe("messageBubbleCyberMode", () => {
  it("renders a decode overlay only for streaming assistant text", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/components/MessageBubble.vue"),
      "utf8"
    )

    expect(source).toContain("detailTheme?: DetailThemeId")
    expect(source).toContain("cyberEffectPhase?: CyberEffectPhase")
    expect(source).toContain("cyberActive?: boolean")
    expect(source).toContain("bubble-wrap--cyber")
    expect(source).toContain("bubble-wrap--theme-sweet")
    expect(source).toContain("latestCyberTextPartIndex")
    expect(source).toContain("index === latestCyberTextPartIndex.value")
    expect(source).toContain("buildCyberDecodeText")
    expect(source).toContain("part-text__cyber-overlay")
    expect(source).toContain("setInterval")
    expect(source).toContain("clearInterval")
  })

  it("threads cyber props into message bubbles from detail timelines", () => {
    const interactive = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue"),
      "utf8"
    )
    const readonly = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/ConversationDetailReadonlyTimeline.vue"),
      "utf8"
    )

    expect(interactive).toContain(':detail-theme="detailTheme"')
    expect(interactive).toContain(`:cyber-effect-phase="active ? cyberEffectPhase : 'idle'"`)
    expect(interactive).toContain(':detail-theme="detailTheme"')
    expect(interactive).toContain(`:cyber-effect-phase="active ? (cyberEffectPhase || 'idle') : 'idle'"`)
    expect(interactive).toContain(':cyber-active="Boolean(detailTheme === \'matrix\' && active)"')
    expect(readonly).toContain(':detail-theme="detailTheme"')
    expect(readonly).toContain(':cyber-active="false"')
  })
})
