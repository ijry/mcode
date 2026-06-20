import {
  isHotConversation,
  releaseHotConversation,
  resetHotConversationCoordinator,
  sweepHotConversations,
  touchHotConversation,
} from "@/services/conversation/hotConversationCoordinator"

describe("hotConversationCoordinator", () => {
  beforeEach(() => {
    resetHotConversationCoordinator()
    jest.useFakeTimers()
    jest.setSystemTime(new Date("2026-06-20T10:00:00+08:00"))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("keeps touched conversations hot within retention window", () => {
    touchHotConversation(7)
    expect(isHotConversation(7)).toBe(true)
  })

  it("sweeps expired entries", () => {
    touchHotConversation(7)
    jest.setSystemTime(new Date("2026-06-20T10:03:30+08:00"))
    sweepHotConversations()
    expect(isHotConversation(7)).toBe(false)
  })

  it("releases explicit entries", () => {
    touchHotConversation(7)
    releaseHotConversation(7)
    expect(isHotConversation(7)).toBe(false)
  })
})
