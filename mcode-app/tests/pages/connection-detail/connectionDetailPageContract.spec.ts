import fs from "node:fs"
import path from "node:path"

const root = path.resolve(__dirname, "../../../src")

function readSource(relative: string) {
  return fs.readFileSync(path.join(root, relative), "utf8")
}

describe("connection detail page contract", () => {
  it("registers the page and renders all four tabs", () => {
    const pages = readSource("pages.json")
    const source = readSource("pages/connection-detail/index.vue")
    expect(pages).toContain("pages/connection-detail/index")
    expect(source).toContain("ProjectFolderList")
    expect(source).toContain("ConnectionSettingsTab")
    expect(source).toContain("ConnectionInfoTab")
    expect(source).toContain("ConnectionConfigCodeTab")
    expect(source).toContain("folders")
    expect(source).toContain("settings")
    expect(source).toContain("info")
    expect(source).toContain("config")
  })

  it("routes connections page card and config action into detail", () => {
    const source = readSource("pages/connections/index.vue")
    expect(source).toContain("buildConnectionDetailRoute")
    expect(source).toContain("openConnectionDetail")
    expect(source).toContain('tab: "config"')
  })
})
