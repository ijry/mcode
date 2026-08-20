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
    connectionKey: "codeg::direct::http://localhost:3000",
    connectionName: "本地连接",
    targetAgent: "codeg",
    routeMode: "direct",
    baseUrl: "http://localhost:3000",
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

  it("keeps active tab metadata from normalized snapshots", () => {
    const snapshot = buildSnapshot({
      now: Date.parse("2026-06-09T00:10:00+08:00"),
      tabs: [
        {
          id: 6,
          folder_id: folder.id,
          conversation_id: 101,
          agent_type: "codex",
          is_active: true,
          position: 1,
        },
      ],
      conversations: [conversation()],
    })

    expect(snapshot.openTabCards[0]).toEqual(
      expect.objectContaining({
        tabId: 6,
        conversationId: 101,
        isActive: true,
      })
    )
  })

  // ——— 列表顺序：不管打开中的标签，只按时间 ———
  //
  // 用户原话：「会话列表 24H 顺序似乎不对，比如 5 分钟前的排在了 4 天前后边」。
  // 两个独立成因，分别对应下面两组用例。缺任何一个都还是乱序。
  describe("cards ordering", () => {
    // 成因 ①：渲染用的是 `[...openTabCards, ...recentActiveCards]`，而标签组按
    // isActive → tabId 排序、**完全不看时间**。于是一个几天前打开的标签被钉在最前面，
    // 整个列表读起来就是「没排序」。
    it("sorts an old open tab below a conversation from minutes ago", () => {
      const now = Date.parse("2026-06-09T12:00:00+08:00")
      const snapshot = buildSnapshot({
        now,
        tabs: [
          {
            id: 1,
            folder_id: folder.id,
            conversation_id: 301,
            agent_type: "codex",
            is_active: true,
          },
        ],
        conversations: [
          conversation({
            id: 301,
            title: "老标签",
            updated_at: "2026-06-05T12:00:00+08:00",
            last_message_at: "2026-06-05T12:00:00+08:00",
          }),
          conversation({
            id: 302,
            title: "刚聊过",
            updated_at: "2026-06-09T11:55:00+08:00",
            last_message_at: "2026-06-09T11:55:00+08:00",
          }),
        ],
      })

      expect(snapshot.cards.map((card) => card.title)).toEqual(["刚聊过", "老标签"])
    })

    // `openTabCards` / `recentActiveCards` 仍然表达「这张卡是哪来的」，只是不再表达顺序。
    // 这条锁住「合并」而不是「换一组」—— 4 天前的标签不在 24H 窗口里，若只渲染
    // `recentActiveCards` 它会整张消失。
    it("still surfaces open tabs that fall outside the 24h window", () => {
      const snapshot = buildSnapshot({
        now: Date.parse("2026-06-09T12:00:00+08:00"),
        tabs: [
          {
            id: 1,
            folder_id: folder.id,
            conversation_id: 301,
            agent_type: "codex",
          },
        ],
        conversations: [
          conversation({
            id: 301,
            title: "四天前的标签",
            updated_at: "2026-06-05T12:00:00+08:00",
            last_message_at: "2026-06-05T12:00:00+08:00",
          }),
        ],
      })

      expect(snapshot.recentActiveCards).toEqual([])
      expect(snapshot.cards.map((card) => card.title)).toEqual(["四天前的标签"])
      // 顺序不再表达「PC 上开着」，所以必须有个显式字段供 UI 打角标。
      expect(snapshot.cards[0].isOpenTab).toBe(true)
    })

    // 成因 ②：排序取 `last_message_at → lastMessageAt → updated_at`，显示取
    // `updated_at → last_message_at` —— **第一优先级是反的**。于是一个只改了标题/状态的
    // 会话（`updated_at` 新、`last_message_at` 旧）显示成「刚刚」却排在几天前那批后面。
    it("sorts by the same field it displays", () => {
      const now = Date.parse("2026-06-09T12:00:00+08:00")
      const snapshot = buildSnapshot({
        now,
        conversations: [
          conversation({
            id: 401,
            title: "只改过标题",
            // `updated_at` 很新（标题刚被改），但最后一条消息是 3 小时前。
            updated_at: "2026-06-09T11:59:00+08:00",
            last_message_at: "2026-06-09T09:00:00+08:00",
          }),
          conversation({
            id: 402,
            title: "刚发过消息",
            updated_at: "2026-06-09T10:00:00+08:00",
            last_message_at: "2026-06-09T11:30:00+08:00",
          }),
        ],
      })

      expect(snapshot.cards.map((card) => card.title)).toEqual(["刚发过消息", "只改过标题"])
      // 显示用的字符串必须是排序用的那个字段，否则「显示较新、排序较旧」会再次分叉。
      expect(snapshot.cards[0].updatedAt).toBe("2026-06-09T11:30:00+08:00")
      expect(snapshot.cards[1].updatedAt).toBe("2026-06-09T09:00:00+08:00")
      expect(snapshot.cards[0].activityAt).toBe(Date.parse("2026-06-09T11:30:00+08:00"))
    })

    // 标签还没关联会话时没有任何时间戳。让它们参与数值比较会与「1970 年」混在一起 ——
    // 统一沉底。相对顺序由 `openTabCards` 自己的 isActive → tabId 排序决定（tiebreak 是
    // 数组下标，所以传入顺序原样保留），因此 #4 在 #9 前面，且与输入顺序无关。
    it("sinks timestamp-less tabs to the bottom in a stable order", () => {
      const build = (tabs: any[]) =>
        buildSnapshot({
          now: Date.parse("2026-06-09T12:00:00+08:00"),
          tabs,
          conversations: [
            conversation({
              id: 501,
              title: "有时间的会话",
              updated_at: "2026-06-09T11:00:00+08:00",
              last_message_at: "2026-06-09T11:00:00+08:00",
            }),
          ],
        })

      const tabNine = { id: 9, folder_id: folder.id, conversation_id: null, agent_type: "codex" }
      const tabFour = { id: 4, folder_id: folder.id, conversation_id: null, agent_type: "codex" }
      const expected = ["有时间的会话", "标签会话 #4", "标签会话 #9"]

      expect(build([tabNine, tabFour]).cards.map((card) => card.title)).toEqual(expected)
      // 输入顺序反过来结果必须一样 —— 否则列表会在每次刷新时抖动。
      expect(build([tabFour, tabNine]).cards.map((card) => card.title)).toEqual(expected)
    })
  })
})
