import {
  applyConversationTabBarBadge,
  fetchOngoingActiveSessionCount,
  formatConversationTabBadgeText,
  getOngoingActiveSessionCount,
  normalizeActiveSessionCounts,
  refreshConversationTabBarActiveSessionBadge,
} from "@/services/conversation/tabbarActiveSessions"

describe("tabbarActiveSessions", () => {
  it("normalizes camelCase and snake_case active session counts", () => {
    expect(
      normalizeActiveSessionCounts({
        runningCount: 2,
        waiting_count: "3",
        errorCount: 1,
      })
    ).toEqual({
      runningCount: 2,
      waitingCount: 3,
      errorCount: 1,
    })
  })

  it("derives counts from session rows when aggregate fields are missing", () => {
    expect(
      normalizeActiveSessionCounts({
        sessions: [
          { status: "prompting" },
          { status: "waiting_permission" },
          { status: "waiting_question" },
          { status: "error" },
          { status: "connected" },
        ],
      })
    ).toEqual({
      runningCount: 1,
      waitingCount: 2,
      errorCount: 1,
    })
    expect(
      getOngoingActiveSessionCount({
        sessions: [
          { status: "prompting" },
          { status: "waiting_permission" },
          { status: "error" },
        ],
      })
    ).toBe(2)
  })

  it("formats the tabbar badge text", () => {
    expect(formatConversationTabBadgeText(0)).toBe("")
    expect(formatConversationTabBadgeText(8)).toBe("8")
    expect(formatConversationTabBadgeText(101)).toBe("99+")
  })

  it("sets and removes the conversations tab badge", async () => {
    const uniApi = {
      setTabBarBadge: jest.fn((options) => options.success?.()),
      removeTabBarBadge: jest.fn((options) => options.success?.()),
    }

    await applyConversationTabBarBadge(6, uniApi as any)
    expect(uniApi.setTabBarBadge).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 1,
        text: "6",
      })
    )

    await applyConversationTabBarBadge(0, uniApi as any)
    expect(uniApi.removeTabBarBadge).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 1,
      })
    )
  })

  it("fetches active session count from the codeg-main pet endpoint", async () => {
    const gateway = {
      call: jest.fn().mockResolvedValue({
        runningCount: 1,
        waitingCount: 2,
        errorCount: 4,
      }),
    }

    await expect(fetchOngoingActiveSessionCount(gateway as any)).resolves.toBe(3)
    expect(gateway.call).toHaveBeenCalledWith("pet_list_active_sessions")
  })

  it("refreshes badge from multiple gateways and drops failed calls from the sum", async () => {
    const gateways = [
      { call: jest.fn().mockResolvedValue({ runningCount: 1, waitingCount: 1 }) },
      { call: jest.fn().mockRejectedValue(new Error("offline")) },
      { call: jest.fn().mockResolvedValue({ running_count: 4 }) },
    ]
    const uniApi = {
      setTabBarBadge: jest.fn((options) => options.success?.()),
      removeTabBarBadge: jest.fn((options) => options.success?.()),
    }

    await expect(
      refreshConversationTabBarActiveSessionBadge(gateways as any, uniApi as any)
    ).resolves.toEqual({
      count: 6,
      failed: 1,
    })
    expect(uniApi.setTabBarBadge).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 1,
        text: "6",
      })
    )
  })
})
