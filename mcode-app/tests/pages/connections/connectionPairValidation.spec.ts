import { assertPairTargetAgentMatchesSelection } from "@/services/connectionPairValidation"

describe("connection pair validation", () => {
  it("allows matching or legacy pair responses without targetAgent", () => {
    expect(() =>
      assertPairTargetAgentMatchesSelection({ targetAgent: "opencode" }, "opencode")
    ).not.toThrow()
    expect(() =>
      assertPairTargetAgentMatchesSelection({}, "codeg")
    ).not.toThrow()
  })

  it("rejects gateway pair codes generated for another target agent", () => {
    expect(() =>
      assertPairTargetAgentMatchesSelection({ targetAgent: "mcode-desktop" }, "opencode")
    ).toThrow("配对码属于 MCode Desktop，不是 OpenCode")
  })
})
