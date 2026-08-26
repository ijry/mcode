import fs from "node:fs"
import path from "node:path"

describe("profile version presentation", () => {
  it("uses the shared runtime version label instead of a hardcoded version", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/profile/index.vue"),
      "utf8",
    )

    expect(source).toContain("buildAppVersionLabel")
    expect(source).not.toContain('const version = ref("1.0.0")')
  })

  it("injects a compile timestamp into the app bundle", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../vite.config.js"),
      "utf8",
    )

    expect(source).toContain("__APP_BUILD_TIME__")
  })
})
