import fs from "fs"
import path from "path"

describe("profile layout contract", () => {
  it("links to the dedicated settings page instead of hosting conversation settings inline", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/profile/index.vue"),
      "utf8"
    )

    expect(source).toContain("应用设置")
    expect(source).toContain("goToSettings")
    expect(source).toContain('url: "/pages/settings/index"')
    expect(source).not.toContain("handleConversationListLiveStreamChange")
    expect(source).not.toContain("readConversationListLiveStreamEnabled")
  })
})
