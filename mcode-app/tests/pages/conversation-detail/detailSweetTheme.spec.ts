import fs from "node:fs"
import path from "node:path"

describe("detailSweetTheme", () => {
  it("renders layered sweet atmosphere markup and motion", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/ConversationDetailSweetBubbles.vue"),
      "utf8"
    )

    expect(source).toContain("largeBubbles")
    expect(source).toContain("smallBubbles")
    expect(source).toContain("sparkles")
    expect(source).toContain("sweet-bubbles__item sweet-bubbles__item--large")
    expect(source).toContain("sweet-bubbles__item sweet-bubbles__item--small")
    expect(source).toContain("sweet-bubbles__sparkle")
    expect(source).toContain("@keyframes sweetBubbleFloat")
    expect(source).toContain("@keyframes sweetBubbleSparkle")
  })

  it("defines jelly chrome selectors for the sweet theme", () => {
    const styles = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/index.scss"),
      "utf8"
    )

    expect(styles).toContain(".page--sweet")
    expect(styles).toContain(".page--sweet .detail-tabs-bar")
    expect(styles).toContain(".page--sweet .detail-tab-pill--active")
    expect(styles).toContain(".page--sweet .detail-dropdown-menu")
    expect(styles).toContain(":deep(.detail-interactive-pane--theme-sweet .input-wrap)")
    expect(styles).toContain(":deep(.detail-interactive-pane--theme-sweet .input-box)")
    expect(styles).toContain(":deep(.detail-interactive-pane--theme-sweet .send-btn)")
  })

  it("keeps sweet message surfaces translucent and readable", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/components/MessageBubble.vue"),
      "utf8"
    )

    expect(source).toContain("bubble-wrap--theme-sweet")
    expect(source).toContain("--message-sweet-text")
    expect(source).toContain("bubble-wrap--theme-sweet .bubble--user")
    expect(source).toContain("bubble-wrap--theme-sweet .part-thinking")
    expect(source).toContain("bubble-wrap--theme-sweet :deep(.goal-card)")
    expect(source).toContain("bubble-wrap--theme-sweet :deep(.tool-group__summary)")
  })
})
