import fs from "node:fs"
import path from "node:path"

const root = path.resolve(__dirname, "../../../src")

function readSource(relative: string) {
  return fs.readFileSync(path.join(root, relative), "utf8")
}

describe("ProjectFolderList extraction", () => {
  it("keeps folder loading and add-folder behavior in the reusable component", () => {
    const source = readSource("components/projects/ProjectFolderList.vue")
    expect(source).toContain("loadRemoteProjects")
    expect(source).toContain("buildProjectListItems")
    expect(source).toContain("RemoteDirectoryBrowser")
    expect(source).toContain("openRemoteFolder")
    expect(source).toContain("buildProjectDetailRoute")
    expect(source).toContain("defineExpose")
  })

  it("does not reload when a resolved connection is emitted back to the parent", () => {
    const source = readSource("components/projects/ProjectFolderList.vue")
    expect(source).toContain("loadedConnectionKey")
    expect(source).toContain("connectionIdentityKey")
    expect(source).toContain("nextKey === loadedConnectionKey")
  })

  it("keeps projects page as a route wrapper", () => {
    const source = readSource("pages/projects/index.vue")
    expect(source).toContain("ProjectFolderList")
    expect(source).toContain("findStoredConnectionById")
    expect(source).toContain("decodeConnectionContext")
  })
})
