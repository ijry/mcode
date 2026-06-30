import {
  buildDetailShellTabs,
  resolveDetailTabCloseTarget,
  resolveDetailTabWindow,
} from "@/pages/conversation-detail/detailTabsPresentation"

describe("detailTabsPresentation", () => {
  it("maps opened tabs into shell tabs ordered by position", () => {
    expect(buildDetailShellTabs({
      openedTabs: [
        {
          id: 9,
          folder_id: 2,
          conversation_id: 99,
          agent_type: "codex",
          position: 1,
          is_active: false,
          is_pinned: false,
        },
        {
          id: 3,
          folder_id: 2,
          conversation_id: 88,
          agent_type: "claude_code",
          position: 0,
          is_active: true,
          is_pinned: false,
        },
      ],
      titleByConversationId: {
        88: "mcode",
        99: "infra-core",
      },
    })).toEqual([
      expect.objectContaining({
        tabId: 3,
        conversationId: 88,
        title: "mcode",
        active: true,
      }),
      expect.objectContaining({
        tabId: 9,
        conversationId: 99,
        title: "infra-core",
        active: false,
      }),
    ])
  })

  it("returns only current and adjacent indexes for the lazy mount window", () => {
    expect(resolveDetailTabWindow(0, 4)).toEqual([0, 1])
    expect(resolveDetailTabWindow(2, 5)).toEqual([1, 2, 3])
    expect(resolveDetailTabWindow(4, 5)).toEqual([3, 4])
  })

  it("closes the active tab by preferring the right tab and then the left tab", () => {
    expect(resolveDetailTabCloseTarget(1, 1, 4)).toBe(1)
    expect(resolveDetailTabCloseTarget(3, 3, 4)).toBe(2)
    expect(resolveDetailTabCloseTarget(0, 0, 1)).toBe(-1)
  })
})
