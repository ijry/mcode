import {
  buildProjectDetailRoute,
  isWorkspaceCapableConnection,
  parseProjectDetailRouteOptions,
  workspaceUnsupportedText,
} from "@/services/projectDetail"

describe("projectDetail", () => {
  it("builds a detail route carrying connection, folder, project name, and path", () => {
    expect(
      buildProjectDetailRoute({
        connectionId: "conn123",
        folderId: 42,
        projectName: "demo 项目",
        projectPath: "D:/Repos/demo",
      })
    ).toBe(
      "/pages/project-detail/index?connectionId=conn123&folderId=42&projectName=demo%20%E9%A1%B9%E7%9B%AE&projectPath=D%3A%2FRepos%2Fdemo"
    )
  })

  it("parses route options into a project detail context", () => {
    expect(
      parseProjectDetailRouteOptions({
        connectionId: "conn123",
        folderId: "42",
        projectName: "demo%20%E9%A1%B9%E7%9B%AE",
        projectPath: "D%3A%2FRepos%2Fdemo",
      })
    ).toEqual({
      connectionId: "conn123",
      folderId: 42,
      projectName: "demo 项目",
      projectPath: "D:/Repos/demo",
    })
  })

  it("treats codeg connections as workspace capable and desktop as unsupported", () => {
    expect(isWorkspaceCapableConnection({ targetAgent: "codeg" } as any)).toBe(true)
    expect(
      isWorkspaceCapableConnection({
        gatewaySession: { targetAgent: "codeg" },
      } as any)
    ).toBe(true)
    expect(isWorkspaceCapableConnection({ targetAgent: "mcode-desktop" } as any)).toBe(false)
  })

  it("returns a clear unsupported message for desktop connections", () => {
    expect(workspaceUnsupportedText({ targetAgent: "mcode-desktop" } as any)).toBe(
      "当前连接暂不支持项目文件、Git 和终端功能，请使用 codeg-main 连接。"
    )
  })
})
