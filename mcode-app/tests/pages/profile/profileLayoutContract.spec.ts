import fs from "fs"
import path from "path"

describe("profile layout contract", () => {
  it("keeps the live stream setting title row from being squeezed into vertical text", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/profile/index.vue"),
      "utf8"
    )

    expect(source).toContain("class=\"menu-switch\"")
    expect(source).toContain(".menu-left--column")
    expect(source).toContain("flex-direction: column;")
    expect(source).toContain(".menu-row-title")
    expect(source).toContain("white-space: nowrap;")
    expect(source).toContain(".menu-switch")
    expect(source).toContain("flex-shrink: 0;")
  })
})
