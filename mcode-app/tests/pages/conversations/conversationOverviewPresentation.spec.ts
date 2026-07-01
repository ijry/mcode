import { resolveOverviewCardDisplayStatus } from "@/pages/conversations/conversationOverviewPresentation"

describe("conversationOverviewPresentation", () => {
  it("keeps persisted summary status when runtime is only connected state", () => {
    expect(resolveOverviewCardDisplayStatus("completed", "connected")).toBe("completed")
    expect(resolveOverviewCardDisplayStatus("failed", "connecting")).toBe("failed")
    expect(resolveOverviewCardDisplayStatus("unknown", "idle")).toBe("unknown")
    expect(resolveOverviewCardDisplayStatus("completed", "error")).toBe("failed")
  })

  it("promotes only real execution states to in_progress", () => {
    expect(resolveOverviewCardDisplayStatus("completed", "thinking")).toBe("in_progress")
    expect(resolveOverviewCardDisplayStatus("completed", "running_tool")).toBe("in_progress")
    expect(resolveOverviewCardDisplayStatus("completed", "waiting_permission")).toBe("in_progress")
    expect(resolveOverviewCardDisplayStatus("completed", "waiting_question")).toBe("in_progress")
  })
})
