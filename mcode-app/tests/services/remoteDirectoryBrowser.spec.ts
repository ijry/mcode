import {
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
})
