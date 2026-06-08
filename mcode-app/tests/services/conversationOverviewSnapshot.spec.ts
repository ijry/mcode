import { buildConnectionConversationSnapshot } from "@/services/conversation/conversationOverviewSnapshot"

const folder = {
  id: 7,
  name: "mcode",
  path: "D:/Repos/xyito/lingyun/mcode",
}

const conversation = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 101,
    title: "跨零点回归测试",
    agent_type: "codex",
    updated_at: "2026-06-08T23:50:00+08:00",
    last_message_at: "2026-06-08T23:50:00+08:00",
    folder_id: folder.id,
    status: "completed",
    ...overrides,
  }) as any

function buildSnapshot(input: {
  now: number
  conversations?: any[]
  tabs?: any[]
}) {
  return buildConnectionConversationSnapshot({
    connectionKey: "direct::http://localhost:3000",
    connectionName: "本地连接",
    mode: "direct",
    url: "http://localhost:3000",
    folders: [folder],
    tabs: input.tabs || [],
    conversations: input.conversations || [],
    now: input.now,
  })
}

describe("conversationOverviewSnapshot", () => {
  it("keeps late-night recent sessions visible after midnight", () => {
    const snapshot = buildSnapshot({
      now: Date.parse("2026-06-09T00:10:00+08:00"),
      conversations: [conversation()],
    })

    expect(snapshot.recentActiveCards).toHaveLength(1)
    expect(snapshot.recentActiveCards[0]).toEqual(
      expect.objectContaining({
        conversationId: 101,
        title: "跨零点回归测试",
      })
    )
  })

  it("filters out sessions that are older than the recent activity window", () => {
    const snapshot = buildSnapshot({
      now: Date.parse("2026-06-09T12:30:00+08:00"),
      conversations: [
        conversation({
          id: 202,
          updated_at: "2026-06-08T11:59:00+08:00",
          last_message_at: "2026-06-08T11:59:00+08:00",
        }),
      ],
    })

    expect(snapshot.recentActiveCards).toEqual([])
  })

  it("still dedupes opened tab conversations from the recent section", () => {
    const snapshot = buildSnapshot({
      now: Date.parse("2026-06-09T00:10:00+08:00"),
      tabs: [
        {
          id: 1,
          folder_id: folder.id,
          conversation_id: 101,
          agent_type: "codex",
          is_active: true,
        },
      ],
      conversations: [conversation()],
    })

    expect(snapshot.openTabCards).toHaveLength(1)
    expect(snapshot.recentActiveCards).toEqual([])
  })
})
