import {
  createDetailTabState,
} from "@/pages/conversation-detail/detailTabState"

describe("detailTabState", () => {
  it("creates an isolated empty local state for each tab", () => {
    const state = createDetailTabState({
      tabId: 1,
      folderId: 2,
      conversationId: 3,
      agentType: "codex",
      title: "会话 3",
      active: true,
      position: 0,
    })

    expect(state).toEqual(expect.objectContaining({
      askQuestionSelectionsJson: "{}",
      pageScrollTop: 0,
      lastMeasuredScrollTop: 0,
      anchorMessageId: "",
      shouldAutoFollowBottom: true,
      hasUnreadBelow: false,
      showPlanDrawer: false,
      questionSubmitting: false,
      permissionSubmitting: false,
    }))
    expect(state).not.toHaveProperty("hasMoreHistory")
    expect(state).not.toHaveProperty("oldestLoadedCursor")
    // 草稿与 composer UI 状态已随输入框迁到 pane（草稿改为按会话落 SQLite）。
    // 留在这里会造成两份状态，而其中一份永远是空的 —— 那正是抽离时踩过的坑。
    expect(state).not.toHaveProperty("draftText")
    expect(state).not.toHaveProperty("attachments")
    expect(state).not.toHaveProperty("draftQueue")
    expect(state).not.toHaveProperty("queueExpanded")
    expect(state).not.toHaveProperty("toolRowExpanded")
    expect(state).not.toHaveProperty("composerPanelMode")
    expect(state).not.toHaveProperty("expandedConfigKey")
  })
})
