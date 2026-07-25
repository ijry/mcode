import fs from "fs"
import path from "path"

describe("settings page contract", () => {
  it("hosts conversation live stream and detail tab multitask settings", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/settings/index.vue"),
      "utf8"
    )

    expect(source).toContain("会话列表实时消息流")
    expect(source).toContain("TAB 多任务")
    expect(source).toContain("移动端自管")
    expect(source).toContain("同步 PC 端")
    expect(source).toContain("实验性功能")
    expect(source).toContain("实时信息流和同步 PC 端 TAB 仅供体验，不建议正式使用")
    expect(source).toContain("readConversationListLiveStreamEnabled")
    expect(source).toContain("readDetailTabMultitaskMode")
  })

  it("is registered as a navigable non-tab page", () => {
    const pagesJson = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages.json"),
      "utf8"
    )
    const parsed = JSON.parse(pagesJson)

    expect(parsed.pages.some((page: { path?: string }) => page.path === "pages/settings/index")).toBe(true)
    expect(parsed.tabBar.list.some((page: { pagePath?: string }) => page.pagePath === "pages/settings/index")).toBe(false)
  })
})
