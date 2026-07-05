import fs from "fs"
import path from "path"

describe("connection host picker layout contract", () => {
  it("keeps horizontal filter chips on one line", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/connections/components/ConnectionHostPicker.vue"),
      "utf8"
    )

    expect(source).toContain("flex: 0 0 auto;")
    expect(source).toContain(".host-picker__filter > text")
    expect(source).toContain("white-space: nowrap;")
  })
})
