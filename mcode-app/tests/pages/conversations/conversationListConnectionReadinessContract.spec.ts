import fs from "node:fs"
import path from "node:path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8")
}

describe("conversation list connection readiness contract", () => {
  it("prepares linked connections before loading the overview on page show", () => {
    const source = read("../../../src/pages/conversations/index.vue")
    const onShowStart = source.indexOf("onShow(() => {")
    const onShowEnd = source.indexOf("\n})", onShowStart)
    const onShowBlock = source.slice(onShowStart, onShowEnd)

    expect(onShowBlock).toContain("loadOverviewDataAfterConnectionPrepare(")
    expect(onShowBlock).toContain("scheduleLivePreviewReconcile()")
    expect(onShowBlock.indexOf("loadOverviewDataAfterConnectionPrepare("))
      .toBeLessThan(onShowBlock.indexOf("scheduleLivePreviewReconcile()"))
  })

  it("does not schedule pet-session overview refreshes while the list page is hidden", () => {
    const source = read("../../../src/pages/conversations/index.vue")

    expect(source).toContain("function scheduleActiveSessionsOverviewRefresh(instanceKey: string)")
    expect(source).toContain("if (!livePreviewPageVisible.value) return")
    expect(source).toContain("activeSessionsRefreshTimerMap.forEach((timer) => clearTimeout(timer))")
  })
})
