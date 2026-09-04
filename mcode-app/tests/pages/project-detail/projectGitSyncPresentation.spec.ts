import { buildPullOutcomeView } from "@/pages/project-detail/projectGitSyncPresentation"

describe("拉取结果文案", () => {
  it("无冲突时按更新文件数措辞", () => {
    expect(buildPullOutcomeView({ updatedFiles: 3, conflictFiles: [] })).toEqual({
      hasConflict: false,
      text: "已拉取，更新 3 个文件",
      conflictText: "",
    })
    expect(buildPullOutcomeView({ updatedFiles: 0, conflictFiles: [] }).text).toBe(
      "已拉取，没有新的改动"
    )
  })

  it("有冲突时必须同时给出「有冲突」「文件名」「去电脑端」三件事", () => {
    const view = buildPullOutcomeView({
      updatedFiles: 2,
      conflictFiles: ["src/a.ts", "src/b.ts"],
    })
    expect(view.hasConflict).toBe(true)
    expect(view.text).toBe("拉取后有 2 个文件冲突")
    expect(view.conflictText).toContain("src/a.ts")
    expect(view.conflictText).toContain("src/b.ts")
    expect(view.conflictText).toContain("电脑端")
  })

  it("冲突文件很多时折叠成「等 N 个」", () => {
    const view = buildPullOutcomeView({
      updatedFiles: 0,
      conflictFiles: ["a", "b", "c", "d", "e"],
    })
    expect(view.text).toBe("拉取后有 5 个文件冲突")
    expect(view.conflictText).toContain("等 5 个文件")
  })

  it("空文件名不算冲突", () => {
    const view = buildPullOutcomeView({ updatedFiles: 1, conflictFiles: ["", "  "] })
    expect(view.hasConflict).toBe(false)
  })

  it("空入参当成没有改动", () => {
    expect(buildPullOutcomeView(null).hasConflict).toBe(false)
    expect(buildPullOutcomeView(undefined).text).toBe("已拉取，没有新的改动")
  })
})
