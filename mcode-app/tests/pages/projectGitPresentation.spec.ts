import {
  buildProjectGitRoute,
  buildWorkspaceStatusSummary,
  isCurrentBranchHistoryView,
} from "@/services/projectGit"

describe("project git routing helpers", () => {
  it("builds a route carrying connection, folder, project name, and project path", () => {
    expect(
      buildProjectGitRoute({
        encodedConnection: "ctx123",
        folderId: 42,
        projectName: "demo",
        projectPath: "D:/Repos/demo",
      })
    ).toBe(
      "/pages/project-git/index?connection=ctx123&folderId=42&projectName=demo&projectPath=D%3A%2FRepos%2Fdemo"
    )
  })
})

describe("project git presentation helpers", () => {
  it("summarizes workspace counters for the page header", () => {
    expect(
      buildWorkspaceStatusSummary([
        { status: "M", file: "src/App.vue" },
        { status: "A", file: "src/new.ts" },
        { status: "D", file: "src/old.ts" },
        { status: "??", file: "README.md" },
      ])
    ).toEqual({
      modified: 1,
      added: 1,
      deleted: 1,
      untracked: 1,
    })
  })

  it("allows reset only on the current branch view", () => {
    expect(isCurrentBranchHistoryView("main", "main")).toBe(true)
    expect(isCurrentBranchHistoryView("main", "origin/main")).toBe(false)
    expect(isCurrentBranchHistoryView("main", "feature/mobile")).toBe(false)
  })
})
