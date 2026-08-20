import fs from "fs"
import path from "path"

describe("settings page contract", () => {
  it("hosts conversation live stream and detail tab multitask settings", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/settings/index.vue"),
      "utf8"
    )

    expect(source).toContain("会话列表实时消息流")
    expect(source).toContain("本地缓存最新页消息")
    expect(source).toContain("TAB 多任务")
    expect(source).toContain("移动端自管")
    expect(source).toContain("同步 PC 端")
    expect(source).toContain("实验性功能")
    expect(source).toContain("实时信息流、本地缓存消息和同步 PC 端 TAB 仅供体验，不建议正式使用")
    expect(source).toContain("readConversationListLiveStreamEnabled")
    expect(source).toContain("readLocalTurnCacheEnabled")
    expect(source).toContain("readDetailTabMultitaskMode")
  })

  // 关掉开关时必须顺手清掉已缓存的轮次，否则它们变成「幽灵行」：读写两侧都已关闭，
  // 谁都不会再碰，但仍占存储、还被清除缓存页算进条数，用户看到一个删不掉也说不清
  // 来源的数字。同时只能清轮次 —— 会话摘要（列表页标题/状态/未读）不在这个开关的
  // 语义里，一起删会让列表离线空白。
  it("clears cached turns but keeps summaries when the local cache toggle is switched off", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/settings/index.vue"),
      "utf8"
    )

    expect(source).toContain("clearCachedConversationTurns")
    expect(source).not.toContain("clearCachedConversationData")
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
