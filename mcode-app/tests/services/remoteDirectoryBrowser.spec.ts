import {
  childDirectoryPath,
  createRemoteDirectory,
  normalizeDirectoryEntries,
  parentDirectoryPath,
} from "@/services/remoteDirectoryBrowser"

describe("remoteDirectoryBrowser", () => {
  it("normalizes camelCase and snake_case directory entries", () => {
    expect(
      normalizeDirectoryEntries([
        { name: "src", path: "/repo/src", isDirectory: true, hasChildren: true },
        { name: "docs", path: "/repo/docs", is_dir: true, has_children: false },
        { name: "file.txt", path: "/repo/file.txt", isDirectory: false },
        { name: "", path: "/repo/empty", isDirectory: true },
      ])
    ).toEqual([
      { name: "src", path: "/repo/src", isDirectory: true, hasChildren: true },
      { name: "docs", path: "/repo/docs", isDirectory: true, hasChildren: false },
    ])
  })

  it("unwraps data arrays from gateway envelopes", () => {
    expect(
      normalizeDirectoryEntries({
        data: [{ name: "work", path: "D:/work", isDirectory: true }],
      })
    ).toEqual([
      { name: "work", path: "D:/work", isDirectory: true, hasChildren: false },
    ])
  })

  it("accepts codeg-main directory-only entries without an explicit directory flag", () => {
    expect(
      normalizeDirectoryEntries([
        { name: "Repos", path: "D:/Repos", hasChildren: true },
        { name: "Downloads", path: "D:/Downloads", hasChildren: false },
      ])
    ).toEqual([
      { name: "Repos", path: "D:/Repos", isDirectory: true, hasChildren: true },
      { name: "Downloads", path: "D:/Downloads", isDirectory: true, hasChildren: false },
    ])
  })

  it("resolves POSIX parent paths without crossing root", () => {
    expect(parentDirectoryPath("/Users/admin/project")).toBe("/Users/admin")
    expect(parentDirectoryPath("/Users")).toBe("/")
    expect(parentDirectoryPath("/")).toBe("")
  })

  it("resolves Windows parent paths without crossing drive root", () => {
    expect(parentDirectoryPath("D:\\Repos\\xyito\\lingyun")).toBe("D:\\Repos\\xyito")
    expect(parentDirectoryPath("D:\\Repos")).toBe("D:\\")
    expect(parentDirectoryPath("D:\\")).toBe("")
  })

  it("builds child directory paths for POSIX and Windows parents", () => {
    expect(childDirectoryPath("/Users/admin", "project")).toBe("/Users/admin/project")
    expect(childDirectoryPath("/", "project")).toBe("/project")
    expect(childDirectoryPath("D:\\Repos", "project")).toBe("D:\\Repos\\project")
    expect(childDirectoryPath("D:\\", "project")).toBe("D:\\project")
  })

  it("creates remote directories through the gateway command", async () => {
    const gateway = { call: jest.fn().mockResolvedValue(null) }

    await createRemoteDirectory(gateway as any, "/repo/new-project")

    expect(gateway.call).toHaveBeenCalledWith("create_folder_directory", {
      path: "/repo/new-project",
    })
  })
})
