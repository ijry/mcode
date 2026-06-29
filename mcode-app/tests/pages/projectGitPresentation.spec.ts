import {
  buildProjectGitCommitRoute,
  buildProjectGitDiffRoute,
  buildProjectGitRoute,
  buildWorkspaceStatusSummary,
  isCurrentBranchHistoryView,
} from "@/services/projectGit"

describe("project git routing helpers", () => {
  it("builds a route carrying connection, folder, project name, and project path", () => {
    expect(
      buildProjectGitRoute({
        connectionId: "conn123",
        folderId: 42,
        projectName: "demo",
        projectPath: "D:/Repos/demo",
      })
    ).toBe(
      "/pages/project-git/index?connectionId=conn123&folderId=42&projectName=demo&projectPath=D%3A%2FRepos%2Fdemo"
    )
  })

  it("builds drill-down routes for commit detail and diff pages", () => {
    expect(
      buildProjectGitCommitRoute({
        connectionId: "conn123",
        folderId: 42,
        projectName: "demo",
        projectPath: "D:/Repos/demo",
        commit: {
          hash: "abc1234",
          full_hash: "abc123456789",
          author: "dev",
          date: "2026-06-14T10:00:00Z",
          message: "feat: change",
          files: [{ path: "src/App.vue", status: "M", additions: 3, deletions: 1 }],
          pushed: true,
        },
      })
    ).toContain("/pages/project-git-commit/index?")

    expect(
      buildProjectGitDiffRoute({
        connectionId: "conn123",
        folderId: 42,
        projectName: "demo",
        projectPath: "D:/Repos/demo",
        filePath: "src/App.vue",
        fileStatus: "M",
        mode: "workspace",
        branch: "main",
      })
    ).toContain("/pages/project-git-diff/index?")
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
