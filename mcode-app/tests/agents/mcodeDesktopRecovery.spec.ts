import {
  describeDesktopRecoveryInteraction,
  describeDesktopRecoverySession,
  isDesktopInterruptedSession,
  isDesktopStaleInteraction,
} from "@/agents/mcode-desktop/recovery"

describe("mcode desktop recovery helpers", () => {
  it("detects interrupted sessions and stale interactions", () => {
    expect(isDesktopInterruptedSession({ status: "interrupted" })).toBe(true)
    expect(isDesktopInterruptedSession({ status: "running" })).toBe(false)
    expect(isDesktopStaleInteraction({ status: "stale" })).toBe(true)
    expect(isDesktopStaleInteraction({ status: "pending" })).toBe(false)
  })

  it("returns user-facing recovery copy", () => {
    expect(describeDesktopRecoverySession({ status: "interrupted" })).toContain("重新发送")
    expect(describeDesktopRecoveryInteraction({ status: "stale" })).toContain("已失效")
  })
})
