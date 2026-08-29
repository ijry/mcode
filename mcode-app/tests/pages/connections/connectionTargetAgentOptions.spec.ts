import {
  TARGET_AGENT_OPTIONS,
  getPairCodeTip,
  getTargetAgentIndex,
  getVisibleTargetAgentOptions,
  resolveTargetAgentByIndex,
} from "@/pages/connections/connectionTargetAgentOptions"

describe("connection target agent options", () => {
  it("hides opencode and mcode-desktop for new connections", () => {
    expect(getVisibleTargetAgentOptions("codeg").map((option) => option.value)).toEqual(["codeg"])
    expect(getVisibleTargetAgentOptions(undefined).map((option) => option.value)).toEqual(["codeg"])
  })

  it("keeps the full option table so stored records are not rewritten", () => {
    expect(TARGET_AGENT_OPTIONS.map((option) => option.value)).toEqual([
      "codeg",
      "opencode",
      "mcode-desktop",
    ])
  })

  it("still shows a hidden option when an existing connection selects it", () => {
    expect(getVisibleTargetAgentOptions("mcode-desktop").map((option) => option.value)).toEqual([
      "codeg",
      "mcode-desktop",
    ])
    expect(getTargetAgentIndex("mcode-desktop")).toBe(1)
    expect(resolveTargetAgentByIndex(1, "mcode-desktop")).toBe("mcode-desktop")
  })

  it("falls back to codeg when the index is out of range", () => {
    expect(resolveTargetAgentByIndex(5, "codeg")).toBe("codeg")
    expect(getTargetAgentIndex("opencode")).toBe(1)
  })

  it("drops hidden target names from the pair code tip", () => {
    const tip = getPairCodeTip("codeg")
    expect(tip).toContain("Codeg")
    expect(tip).not.toContain("OpenCode")
    expect(tip).not.toContain("MCode Desktop")
  })

  it("lists both targets in the tip when editing a hidden target", () => {
    const tip = getPairCodeTip("mcode-desktop")
    expect(tip).toContain("Codeg")
    expect(tip).toContain("MCode Desktop")
  })
})
