import { assertPairTargetAgentMatchesSelection } from "@/services/connectionPairValidation"

describe("connection pair validation", () => {
  it("allows matching v2 pair responses", () => {
    expect(() =>
      assertPairTargetAgentMatchesSelection({ targetAgent: "opencode" }, "opencode")
    ).not.toThrow()
  })

  it("rejects obsolete pair responses missing targetAgent", () => {
    expect(() =>
      assertPairTargetAgentMatchesSelection({}, "codeg")
    ).toThrow("网关配对响应缺少目标类型")
  })

  it("rejects gateway pair codes generated for another target agent", () => {
    expect(() =>
      assertPairTargetAgentMatchesSelection({ targetAgent: "mcode-desktop" }, "opencode")
    ).toThrow("配对码属于 MCode Desktop，不是 OpenCode")
  })
})
