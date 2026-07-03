import {
  buildProjectGitSplitStorageKey,
  clampProjectGitSplitRatio,
  readProjectGitSplitRatio,
  writeProjectGitSplitRatio,
} from "@/pages/project-detail/projectGitSplitState"

describe("projectGitSplitState", () => {
  it("builds a per-project storage key", () => {
    expect(buildProjectGitSplitStorageKey("conn123", 42)).toBe(
      "mcode_project_git_split:conn123:42"
    )
  })

  it("clamps the split ratio to usable bounds", () => {
    expect(clampProjectGitSplitRatio(0.1)).toBe(0.3)
    expect(clampProjectGitSplitRatio(0.55)).toBe(0.55)
    expect(clampProjectGitSplitRatio(0.9)).toBe(0.75)
    expect(clampProjectGitSplitRatio(Number.NaN)).toBe(0.5)
  })

  it("reads and writes through uni-like storage", () => {
    const store = new Map<string, unknown>()
    const storage = {
      getStorageSync: (key: string) => store.get(key),
      setStorageSync: (key: string, value: unknown) => store.set(key, value),
    }
    writeProjectGitSplitRatio(storage, "conn123", 42, 0.7)
    expect(readProjectGitSplitRatio(storage, "conn123", 42)).toBe(0.7)
  })
})
