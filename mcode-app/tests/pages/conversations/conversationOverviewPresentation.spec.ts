import {
  resolveOverviewCardDisplayStatus,
  shouldHideCompletedOverviewCard,
} from "@/pages/conversations/conversationOverviewPresentation"

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

describe("hiding completed cards", () => {
  it("hides a completed card when the preference is on", () => {
    expect(shouldHideCompletedOverviewCard("completed", true)).toBe(true)
  })

  it("keeps every other status", () => {
    // 只挡 `completed`。特别是 `pending_review`（列表上显示「待处理」）—— 轮次跑完时
    // mcode 写的正是它（`conversationSyncService.ts` 的 markSummaryPendingReview 硬编码），
    // 把它一起藏掉会让「刚跑完等我看」的会话消失，那是数据丢失级的误解。
    expect(shouldHideCompletedOverviewCard("pending_review", true)).toBe(false)
    expect(shouldHideCompletedOverviewCard("in_progress", true)).toBe(false)
    expect(shouldHideCompletedOverviewCard("failed", true)).toBe(false)
    expect(shouldHideCompletedOverviewCard("cancelled", true)).toBe(false)
    expect(shouldHideCompletedOverviewCard("unknown", true)).toBe(false)
    expect(shouldHideCompletedOverviewCard("", true)).toBe(false)
  })

  it("hides nothing when the preference is off", () => {
    expect(shouldHideCompletedOverviewCard("completed", false)).toBe(false)
  })

  it("is driven by displayStatus, so a running card is never hidden", () => {
    // 判据必须是 displayStatus 而非 summary 原值：一个状态是 completed、但此刻 runtime
    // 正在跑的会话，displayStatus 会被提升成 in_progress —— 那种会话绝不能藏。
    // 这两行合起来锁住「用哪个值判」这个决定。
    const runningDisplayStatus = resolveOverviewCardDisplayStatus("completed", "thinking")
    expect(shouldHideCompletedOverviewCard(runningDisplayStatus, true)).toBe(false)

    const idleDisplayStatus = resolveOverviewCardDisplayStatus("completed", "connected")
    expect(shouldHideCompletedOverviewCard(idleDisplayStatus, true)).toBe(true)
  })

  it("normalizes casing and padding like the status resolver does", () => {
    // 状态串来自服务端且不是封闭枚举（normalizeConversationSummaryStatus 会原样透传
    // 未知值），所以这里必须和 displayStatus 用同一套归一化，否则 " Completed " 之类
    // 的漂移写法会绕过过滤。
    expect(shouldHideCompletedOverviewCard(" COMPLETED ", true)).toBe(true)
  })
})
