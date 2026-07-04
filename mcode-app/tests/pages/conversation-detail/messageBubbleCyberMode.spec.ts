import fs from "node:fs"
import path from "node:path"

describe("messageBubbleCyberMode", () => {
  it("renders a decode overlay only for streaming assistant text", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/components/MessageBubble.vue"),
      "utf8"
    )

    expect(source).toContain("cyberModeEnabled?: boolean")
    expect(source).toContain("cyberEffectPhase?: CyberEffectPhase")
    expect(source).toContain("cyberActive?: boolean")
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

    expect(interactive).toContain(':cyber-mode-enabled="Boolean(cyberModeEnabled && active)"')
    expect(interactive).toContain(`:cyber-effect-phase="cyberEffectPhase || 'idle'"`)
    expect(interactive).toContain(':cyber-active="Boolean(cyberModeEnabled && active)"')
    expect(readonly).toContain(':cyber-mode-enabled="cyberModeEnabled"')
    expect(readonly).toContain(':cyber-active="false"')
  })
})
