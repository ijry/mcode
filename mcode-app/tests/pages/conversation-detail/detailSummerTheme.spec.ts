import fs from "node:fs"
import path from "node:path"

describe("detailSummerTheme", () => {
  it("renders summer atmosphere markup and seasonal svg layers", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/ConversationDetailSummerAtmosphere.vue"),
      "utf8"
    )

    expect(source).toContain("summer-atmosphere")
    expect(source).toContain("waveLayers")
    expect(source).toContain("watermelonSlices")
    expect(source).toContain("palmLeaves")
    expect(source).toContain("coconuts")
    expect(source).toContain("summer-atmosphere__wave")
    expect(source).toContain("summer-atmosphere__slice")
    expect(source).toContain("summer-atmosphere__leaf")
    expect(source).toContain("summer-atmosphere__coconut")
  })

  it("defines summer page chrome selectors", () => {
    const styles = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/index.scss"),
      "utf8"
    )

    expect(styles).toContain(".page--summer")
    expect(styles).toContain(".page--summer .detail-tabs-bar")
    expect(styles).toContain(".page--summer .detail-tab-pill--active")
    expect(styles).toContain(":deep(.detail-interactive-pane--theme-summer .input-wrap)")
    expect(styles).toContain(":deep(.detail-interactive-pane--theme-summer .send-btn)")
  })

  it("defines summer message bubble surfaces", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/components/MessageBubble.vue"),
      "utf8"
    )

    expect(source).toContain("bubble-wrap--theme-summer")
    expect(source).toContain("--message-summer-text")
    expect(source).toContain("bubble-wrap--theme-summer .bubble--user")
    expect(source).toContain("bubble-wrap--theme-summer .part-thinking")
    expect(source).toContain("bubble-wrap--theme-summer :deep(.goal-card)")
  })
})
