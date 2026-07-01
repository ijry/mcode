import {
  buildDetailShellTabs,
  resolveMountedDetailConversationIds,
  resolveDetailTabChangeIndex,
  resolveDetailTabCloseTarget,
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

  it("deduplicates duplicate opened tabs by conversation id", () => {
    expect(buildDetailShellTabs({
      openedTabs: [
        {
          id: 3,
          folder_id: 2,
          conversation_id: 88,
          agent_type: "claude_code",
          position: 0,
          is_active: true,
          is_pinned: false,
        },
        {
          id: 9,
          folder_id: 2,
          conversation_id: 88,
          agent_type: "claude_code",
          position: 1,
          is_active: false,
          is_pinned: false,
        },
      ],
      titleByConversationId: {
        88: "test",
      },
    })).toEqual([
      expect.objectContaining({
        tabId: 3,
        conversationId: 88,
        title: "test",
      }),
    ])
  })

  it("closes the active tab by preferring the right tab and then the left tab", () => {
    expect(resolveDetailTabCloseTarget(1, 1, 4)).toBe(1)
    expect(resolveDetailTabCloseTarget(3, 3, 4)).toBe(2)
    expect(resolveDetailTabCloseTarget(0, 0, 1)).toBe(-1)
  })

  it("resolves tab change index from up-tabs payload variants", () => {
    const tabs = buildDetailShellTabs({
      openedTabs: [
        {
          id: 3,
          folder_id: 2,
          conversation_id: 88,
          agent_type: "claude_code",
          position: 0,
          is_active: true,
          is_pinned: false,
        },
        {
          id: 9,
          folder_id: 2,
          conversation_id: 99,
          agent_type: "codex",
          position: 1,
          is_active: false,
          is_pinned: false,
        },
      ],
    })

    expect(resolveDetailTabChangeIndex(1, tabs)).toBe(1)
    expect(resolveDetailTabChangeIndex({ index: 1 }, tabs)).toBe(1)
    expect(resolveDetailTabChangeIndex({ current: "1" }, tabs)).toBe(1)
    expect(resolveDetailTabChangeIndex({ conversation_id: 99 }, tabs)).toBe(1)
    expect(resolveDetailTabChangeIndex({ tabId: 9 }, tabs)).toBe(1)
    expect(resolveDetailTabChangeIndex({ title: "unknown" }, tabs)).toBe(-1)
  })

  it("does not treat up-tabs item id as a remote tab id", () => {
    const tabs = buildDetailShellTabs({
      openedTabs: [
        {
          id: 99,
          folder_id: 2,
          conversation_id: 88,
          agent_type: "claude_code",
          position: 0,
          is_active: true,
          is_pinned: false,
        },
        {
          id: 100,
          folder_id: 2,
          conversation_id: 89,
          agent_type: "codex",
          position: 1,
          is_active: false,
          is_pinned: false,
        },
      ],
    })

    expect(resolveDetailTabChangeIndex({ id: 100 }, tabs)).toBe(-1)
    expect(resolveDetailTabChangeIndex({ conversationId: 89 }, tabs)).toBe(1)
  })

  it("keeps visited conversation ids mounted until their tabs disappear", () => {
    const tabs = buildDetailShellTabs({
      openedTabs: [
        {
          id: 3,
          folder_id: 2,
          conversation_id: 88,
          agent_type: "claude_code",
          position: 0,
          is_active: true,
          is_pinned: false,
        },
        {
          id: 9,
          folder_id: 2,
          conversation_id: 99,
          agent_type: "codex",
          position: 1,
          is_active: false,
          is_pinned: false,
        },
      ],
    })

    expect(Array.from(resolveMountedDetailConversationIds({
      mountedConversationIds: [88, 99, 101],
      tabs,
    })).sort()).toEqual([88, 99])
  })
})
