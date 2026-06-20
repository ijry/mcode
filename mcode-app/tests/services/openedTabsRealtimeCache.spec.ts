import {
  applyOpenedTabsSnapshot,
  getOpenedTabsSnapshot,
  resetOpenedTabsSnapshotCache,
} from "@/services/conversation/openedTabsRealtimeCache"

describe("openedTabsRealtimeCache", () => {
  beforeEach(() => {
    resetOpenedTabsSnapshotCache()
  })

  it("stores the newest snapshot per instance", () => {
    applyOpenedTabsSnapshot("inst-a", {
      version: 2,
      origin: "remote-a",
      tabs: [
        {
          id: 1,
          folder_id: 3,
          conversation_id: 9,
          agent_type: "codex",
          position: 0,
          is_active: true,
          is_pinned: false,
        },
      ],
    })

    expect(getOpenedTabsSnapshot("inst-a")).toEqual({
      instanceKey: "inst-a",
      version: 2,
      items: [
        expect.objectContaining({
          id: 1,
          conversation_id: 9,
          is_active: true,
        }),
      ],
    })
  })

  it("ignores stale versions", () => {
    applyOpenedTabsSnapshot("inst-a", {
      version: 4,
      origin: "remote-a",
      tabs: [],
    })
    applyOpenedTabsSnapshot("inst-a", {
      version: 3,
      origin: "remote-b",
      tabs: [
        {
          id: 2,
          folder_id: 1,
          conversation_id: 8,
          agent_type: "claude_code",
          position: 0,
          is_active: true,
          is_pinned: false,
        },
      ],
    })

    expect(getOpenedTabsSnapshot("inst-a")?.version).toBe(4)
    expect(getOpenedTabsSnapshot("inst-a")?.items).toEqual([])
  })
})
