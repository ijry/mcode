import { isDetailDebugEnabled } from "@/pages/conversation-detail/detailDebugPreference"

describe("detailDebugPreference", () => {
  it("enables detail diagnostics only when the H5 URL flag is explicitly set", () => {
    expect(isDetailDebugEnabled("?mcode_detail_debug=1")).toBe(true)
    expect(isDetailDebugEnabled("#/pages/conversation-detail/index?mcode_detail_debug=true")).toBe(true)
    expect(isDetailDebugEnabled("?mcode_detail_debug=0")).toBe(false)
    expect(isDetailDebugEnabled("")).toBe(false)
  })
})
