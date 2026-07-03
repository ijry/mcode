import {
  createRemoteProjectFileEntry,
  getRemoteProjectFileChildren,
  getRemoteProjectFileTree,
  normalizeProjectFileTree,
  readRemoteProjectFilePreview,
} from "@/services/projectFiles"

describe("projectFiles", () => {
  it("normalizes nested file tree nodes", () => {
    expect(
      normalizeProjectFileTree([
        {
          name: "src",
          path: "src",
          kind: "directory",
          children: [{ name: "App.vue", path: "src/App.vue", kind: "file" }],
        },
        { name: "README.md", path: "README.md", isDirectory: false },
      ])
    ).toEqual([
      {
        id: "src",
        name: "src",
        path: "src",
        kind: "directory",
        depth: 0,
        children: [
          {
            id: "src/App.vue",
            name: "App.vue",
            path: "src/App.vue",
            kind: "file",
            depth: 1,
            children: [],
          },
        ],
      },
      {
        id: "README.md",
        name: "README.md",
        path: "README.md",
        kind: "file",
        depth: 0,
        children: [],
      },
    ])
  })

  it("requests the project file tree with root path and max depth", async () => {
    const gateway = { call: jest.fn().mockResolvedValue([]) }
    await getRemoteProjectFileTree(gateway as any, "D:/Repos/demo", 4)
    expect(gateway.call).toHaveBeenCalledWith("get_file_tree", {
      path: "D:/Repos/demo",
      maxDepth: 4,
    })
  })

  it("loads folder children lazily and rebases paths under the project root", async () => {
    const gateway = {
      call: jest.fn().mockResolvedValue([
        { name: "App.vue", path: "App.vue", kind: "file" },
        { name: "components", path: "components", kind: "directory" },
      ]),
    }

    await expect(
      getRemoteProjectFileChildren(gateway as any, "D:/Repos/demo", "src", 1)
    ).resolves.toEqual([
      {
        id: "src/App.vue",
        name: "App.vue",
        path: "src/App.vue",
        kind: "file",
        depth: 1,
        children: [],
      },
      {
        id: "src/components",
        name: "components",
        path: "src/components",
        kind: "directory",
        depth: 1,
        children: [],
      },
    ])
    expect(gateway.call).toHaveBeenCalledWith("get_file_tree", {
      path: "D:/Repos/demo/src",
      maxDepth: 1,
    })
  })

  it("requests workspace-confined file preview", async () => {
    const gateway = {
      call: jest.fn().mockResolvedValue({ content: "hello", truncated: false, language: "text" }),
    }
    await readRemoteProjectFilePreview(gateway as any, "D:/Repos/demo", "README.md")
    expect(gateway.call).toHaveBeenCalledWith("read_file_preview", {
      rootPath: "D:/Repos/demo",
      path: "README.md",
    })
  })

  it("creates files and folders through create_file_tree_entry", async () => {
    const gateway = { call: jest.fn().mockResolvedValue("src/new.ts") }
    await createRemoteProjectFileEntry(gateway as any, "D:/Repos/demo", "src", "new.ts", "file")
    expect(gateway.call).toHaveBeenCalledWith("create_file_tree_entry", {
      rootPath: "D:/Repos/demo",
      path: "src",
      name: "new.ts",
      kind: "file",
    })
  })
})
