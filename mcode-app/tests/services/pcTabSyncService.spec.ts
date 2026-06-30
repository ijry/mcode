import {
  closeConversationTab,
  ensureConversationTab,
  normalizeOpenedTabsList,
  resolveConversationTabIndex,
} from "@/services/conversation/pcTabSyncService"
import {
  getOpenedTabsSnapshot,
  replaceOpenedTabsSnapshot,
} from "@/services/conversation/openedTabsRealtimeCache"

jest.mock("@/services/conversation/openedTabsRealtimeCache", () => ({
  getOpenedTabsSnapshot: jest.fn(),
  replaceOpenedTabsSnapshot: jest.fn(),
}))

describe("pcTabSyncService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("appends a missing conversation tab and preserves current active tab by default", async () => {
    ;(getOpenedTabsSnapshot as jest.Mock).mockReturnValue(null)
    const gateway = {
      call: jest
        .fn()
        .mockResolvedValueOnce({
          items: [
            {
              id: 3,
              folder_id: 7,
              conversation_id: 10,
              agent_type: "codex",
              position: 0,
              is_active: true,
              is_pinned: false,
            },
          ],
          version: 3,
        })
        .mockResolvedValueOnce({
          accepted: true,
          version: 4,
          tabs: [
            {
              id: 3,
              folder_id: 7,
              conversation_id: 10,
              agent_type: "codex",
              position: 0,
              is_active: true,
              is_pinned: false,
            },
            {
              id: 4,
              folder_id: 7,
              conversation_id: 99,
              agent_type: "codex",
              position: 1,
              is_active: false,
              is_pinned: false,
            },
          ],
        }),
      getRemoteInstanceDescriptor: jest.fn(),
    }

    const result = await ensureConversationTab({
      instanceKey: "inst-a",
      gateway: gateway as any,
      folderId: 7,
      conversationId: 99,
      agentType: "codex",
      activation: "preserve",
      origin: "mcode-mobile",
    })

    expect(gateway.call).toHaveBeenNthCalledWith(1, "list_opened_tabs")
    expect(gateway.call).toHaveBeenNthCalledWith(
      2,
      "save_opened_tabs",
      expect.objectContaining({
        expectedVersion: 3,
        items: expect.arrayContaining([
          expect.objectContaining({
            conversation_id: 99,
            is_active: false,
          }),
        ]),
      })
    )
    expect(replaceOpenedTabsSnapshot).toHaveBeenCalled()
    expect(result?.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ conversation_id: 99 })])
    )
  })

  it("parses legacy arrays", () => {
    expect(
      normalizeOpenedTabsList([
        {
          id: 1,
          folderId: 2,
          conversationId: 3,
          agentType: "codex",
          isActive: true,
        },
      ])
    ).toEqual([
      expect.objectContaining({
        id: 1,
        folder_id: 2,
        conversation_id: 3,
        agent_type: "codex",
        is_active: true,
      }),
    ])
  })

  it("removes a conversation tab and preserves remaining order", async () => {
    ;(getOpenedTabsSnapshot as jest.Mock).mockReturnValue({
      instanceKey: "inst-a",
      version: 4,
      items: [
        {
          id: 1,
          folder_id: 2,
          conversation_id: 10,
          agent_type: "codex",
          position: 0,
          is_active: true,
          is_pinned: false,
        },
        {
          id: 2,
          folder_id: 2,
          conversation_id: 11,
          agent_type: "codex",
          position: 1,
          is_active: false,
          is_pinned: false,
        },
      ],
    })
    const gateway = {
      call: jest.fn().mockResolvedValue({
        accepted: true,
        version: 5,
        tabs: [
          {
            id: 1,
            folder_id: 2,
            conversation_id: 10,
            agent_type: "codex",
            position: 0,
            is_active: true,
            is_pinned: false,
          },
        ],
      }),
    }

    await closeConversationTab({
      instanceKey: "inst-a",
      gateway: gateway as any,
      conversationId: 11,
      origin: "mcode-mobile",
    })

    expect(gateway.call).toHaveBeenCalledWith(
      "save_opened_tabs",
      expect.objectContaining({
        expectedVersion: 4,
        items: [expect.objectContaining({ conversation_id: 10 })],
      }),
    )
    expect(replaceOpenedTabsSnapshot).toHaveBeenCalled()
  })

  it("finds the correct tab index for a conversation id", () => {
    expect(resolveConversationTabIndex([
      {
        id: 1,
        folder_id: 2,
        conversation_id: 10,
        agent_type: "codex",
        position: 0,
        is_active: true,
        is_pinned: false,
      },
      {
        id: 2,
        folder_id: 2,
        conversation_id: 11,
        agent_type: "codex",
        position: 1,
        is_active: false,
        is_pinned: false,
      },
    ], 11)).toBe(1)
  })
})
