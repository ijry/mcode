import {
  buildProjectGitCommitRoute,
  buildProjectGitDiffRoute,
  buildProjectGitRoute,
  buildWorkspaceStatusSummary,
  getRemoteCommitDiff,
  getRemoteWorkspaceDiff,
  isNotGitRepositoryError,
  isCurrentBranchHistoryView,
  normalizeGitStatusEntries,
  parseProjectGitCommitRoute,
  pushRemoteBranch,
} from "@/services/projectGit"

describe("projectGit service", () => {
  it("normalizes git status entries and preserves supported statuses", () => {
    expect(
      normalizeGitStatusEntries([
        { status: "M", file: "src/App.vue" },
        { status: "A", file: "src/new.ts" },
        { status: "D", file: "src/old.ts" },
        { status: "??", file: "README.md" },
      ])
    ).toEqual([
      { status: "M", file: "src/App.vue" },
      { status: "A", file: "src/new.ts" },
      { status: "D", file: "src/old.ts" },
      { status: "??", file: "README.md" },
    ])
  })

  it("builds workspace summary counters from git status entries", () => {
    expect(
      buildWorkspaceStatusSummary([
        { status: "M", file: "src/App.vue" },
        { status: " M", file: "src/changed.ts" },
        { status: "A", file: "src/new.ts" },
        { status: "D", file: "src/old.ts" },
        { status: "??", file: "README.md" },
      ])
    ).toEqual({
      modified: 2,
      added: 1,
      deleted: 1,
      untracked: 1,
    })
  })

  it("counts combined status flags without dropping non-delete changes", () => {
    expect(
      buildWorkspaceStatusSummary([
        { status: "AM", file: "src/both.ts" },
        { status: "MD", file: "src/remove-after-edit.ts" },
      ])
    ).toEqual({
      modified: 2,
      added: 1,
      deleted: 1,
      untracked: 0,
    })
  })

  it("treats only the selected current branch as reset-safe", () => {
    expect(isCurrentBranchHistoryView("main", "main")).toBe(true)
    expect(isCurrentBranchHistoryView("main", "feature/mobile")).toBe(false)
    expect(isCurrentBranchHistoryView("main", "origin/main")).toBe(false)
    expect(isCurrentBranchHistoryView(null, "main")).toBe(false)
  })

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

  it("builds a commit detail route with serialized commit payload", () => {
    const route = buildProjectGitCommitRoute({
      encodedConnection: "ctx123",
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

    expect(route).toContain("/pages/project-git-commit/index?")
    expect(route).toContain("commit=")
  })

  it("parses the serialized commit payload back into a commit entry", () => {
    const encoded = encodeURIComponent(
      JSON.stringify({
        hash: "abc1234",
        full_hash: "abc123456789",
        author: "dev",
        date: "2026-06-14T10:00:00Z",
        message: "feat: change",
        files: [{ path: "src/App.vue", status: "M", additions: 3, deletions: 1 }],
        pushed: true,
      })
    )

    expect(parseProjectGitCommitRoute(encoded)).toEqual({
      hash: "abc1234",
      full_hash: "abc123456789",
      author: "dev",
      date: "2026-06-14T10:00:00Z",
      message: "feat: change",
      files: [{ path: "src/App.vue", status: "M", additions: 3, deletions: 1 }],
      pushed: true,
    })
  })

  it("builds a diff route for commit files and workspace files", () => {
    expect(
      buildProjectGitDiffRoute({
        encodedConnection: "ctx123",
        folderId: 42,
        projectName: "demo",
        projectPath: "D:/Repos/demo",
        filePath: "src/App.vue",
        fileStatus: "M",
        mode: "commit",
        commitHash: "abc123456789",
        commitMessage: "feat: change",
      })
    ).toContain("mode=commit")

    expect(
      buildProjectGitDiffRoute({
        encodedConnection: "ctx123",
        folderId: 42,
        projectName: "demo",
        projectPath: "D:/Repos/demo",
        filePath: "src/App.vue",
        fileStatus: "M",
        mode: "workspace",
        branch: "main",
      })
    ).toContain("mode=workspace")
  })

  it("detects not-a-git-repository errors from backend messages", () => {
    expect(isNotGitRepositoryError(new Error("git_status: not_a_git_repository"))).toBe(true)
    expect(isNotGitRepositoryError("git_status: not a git repository: D:/Repos/demo")).toBe(true)
    expect(isNotGitRepositoryError(new Error("network timeout"))).toBe(false)
  })

  it("pushes with the remote/folderId payload expected by the backend handler", async () => {
    const gateway = {
      call: jest.fn().mockResolvedValue({ pushed_commits: 1, upstream_set: true }),
    }

    await pushRemoteBranch(gateway as any, "D:/Repos/demo", "origin", 42)

    expect(gateway.call).toHaveBeenCalledWith("git_push", {
      path: "D:/Repos/demo",
      folderId: 42,
      remote: "origin",
      credentials: null,
    })
  })

  it("loads workspace diff with the expected payload", async () => {
    const gateway = {
      call: jest.fn().mockResolvedValue("diff --git a/src/App.vue b/src/App.vue"),
    }

    await getRemoteWorkspaceDiff(gateway as any, "D:/Repos/demo", "src/App.vue")

    expect(gateway.call).toHaveBeenCalledWith("git_diff", {
      path: "D:/Repos/demo",
      file: "src/App.vue",
    })
  })

  it("loads commit diff with the expected payload", async () => {
    const gateway = {
      call: jest.fn().mockResolvedValue("diff --git a/src/App.vue b/src/App.vue"),
    }

    await getRemoteCommitDiff(gateway as any, "D:/Repos/demo", "abc123456789", "src/App.vue")

    expect(gateway.call).toHaveBeenCalledWith("git_show_diff", {
      path: "D:/Repos/demo",
      commit: "abc123456789",
      file: "src/App.vue",
    })
  })
})
