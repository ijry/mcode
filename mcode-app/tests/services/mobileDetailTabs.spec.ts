import {
  MOBILE_DETAIL_TABS_STORAGE_PREFIX,
  activateMobileDetailTab,
  closeMobileDetailTab,
  ensureMobileDetailTab,
  readMobileDetailTabs,
} from "@/services/conversation/mobileDetailTabs"

describe("mobileDetailTabs", () => {
  const instanceKey = "direct:http://127.0.0.1:3000"

  beforeEach(() => {
    uni.removeStorageSync(`${MOBILE_DETAIL_TABS_STORAGE_PREFIX}:${instanceKey}`)
  })

  it("creates and persists a mobile-owned tab list", () => {
    const tabs = ensureMobileDetailTab({
      instanceKey,
      folderId: 2,
      conversationId: 88,
      agentType: "codex",
    })

    expect(tabs).toEqual([
      expect.objectContaining({
        folder_id: 2,
        conversation_id: 88,
        agent_type: "codex",
        position: 0,
        is_active: true,
      }),
    ])
    expect(readMobileDetailTabs(instanceKey)).toEqual(tabs)
  })

  it("adds new conversations without duplicating existing ones", () => {
    ensureMobileDetailTab({ instanceKey, folderId: 2, conversationId: 88 })
    ensureMobileDetailTab({ instanceKey, folderId: 2, conversationId: 99 })
    const tabs = ensureMobileDetailTab({ instanceKey, folderId: 2, conversationId: 88 })

    expect(tabs.map((tab) => tab.conversation_id)).toEqual([88, 99])
    expect(tabs.map((tab) => tab.is_active)).toEqual([true, false])
  })

  it("activates and closes tabs locally", () => {
    ensureMobileDetailTab({ instanceKey, folderId: 2, conversationId: 88 })
    ensureMobileDetailTab({ instanceKey, folderId: 2, conversationId: 99 })

    expect(activateMobileDetailTab(instanceKey, 88).map((tab) => tab.is_active)).toEqual([
      true,
      false,
    ])
    expect(closeMobileDetailTab(instanceKey, 88).map((tab) => tab.conversation_id)).toEqual([99])
  })
})
