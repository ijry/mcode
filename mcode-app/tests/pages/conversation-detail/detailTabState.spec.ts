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
      draftText: "",
      attachments: [],
      draftQueue: [],
      queueExpanded: false,
      toolRowExpanded: false,
      composerPanelMode: "",
      expandedConfigKey: "",
      askQuestionSelectionsJson: "{}",
      pageScrollTop: 0,
      lastMeasuredScrollTop: 0,
      anchorMessageId: "",
      shouldAutoFollowBottom: true,
      hasUnreadBelow: false,
      hasMoreHistory: false,
      oldestLoadedCursor: null,
      showPlanDrawer: false,
      questionSubmitting: false,
      permissionSubmitting: false,
    }))
  })
})
