import { buildRenderMessageItems } from "@/pages/conversation-detail/detailMessagePresentation"
import type { MessageTurn } from "@/types/acp"

const turn = (overrides: Partial<MessageTurn>): MessageTurn => ({
  id: "turn",
  role: "assistant",
  content: [],
  timestamp: 1000,
  ...overrides,
})

describe("detailMessagePresentation", () => {
  it("keeps a single assistant turn unmerged", () => {
    const items = buildRenderMessageItems([
      turn({ id: "a1", role: "assistant", content: [{ type: "text", text: "one" }] }),
    ])

    expect(items).toEqual([
      {
        key: "a1",
        anchorId: "a1",
        sourceIds: ["a1"],
        message: expect.objectContaining({
          id: "a1",
          content: [{ type: "text", text: "one" }],
        }),
      },
    ])
  })

  it("merges only adjacent assistant runs and anchors them to the last assistant turn", () => {
    const items = buildRenderMessageItems([
      turn({ id: "u1", role: "user", content: [{ type: "text", text: "ask" }] }),
      turn({
        id: "a1",
        role: "assistant",
        content: [{ type: "text", text: "first" }],
        timestamp: 10,
      }),
      turn({
        id: "a2",
        role: "assistant",
        content: [{ type: "thinking", thinking: "second" }],
        timestamp: 20,
      }),
      turn({ id: "u2", role: "user", content: [{ type: "text", text: "next" }], timestamp: 30 }),
    ])

    expect(items.map((item) => item.key)).toEqual(["u1", "merged-a1-a2", "u2"])
    expect(items[1]).toEqual({
      key: "merged-a1-a2",
      anchorId: "a2",
      sourceIds: ["a1", "a2"],
      message: expect.objectContaining({
        id: "a2",
        role: "assistant",
        timestamp: 20,
        content: [
          { type: "text", text: "first" },
          { type: "thinking", thinking: "second" },
        ],
      }),
    })
  })

  // system 轮次（上下文压缩摘要等注入上下文）必须独立成项，不能被拼进相邻 agent
  // 回复的气泡 —— 那等于把内部说明混进正文，而且它会打断 assistant 的合并串。
  it("keeps a system turn as its own item and splits the assistant run", () => {
    const items = buildRenderMessageItems([
      turn({ id: "a1", role: "assistant", content: [{ type: "text", text: "before" }], timestamp: 10 }),
      turn({
        id: "s1",
        role: "system",
        content: [{ type: "text", text: "This session is being continued…" }],
        timestamp: 20,
      }),
      turn({ id: "a2", role: "assistant", content: [{ type: "text", text: "after" }], timestamp: 30 }),
    ])

    expect(items.map((item) => item.key)).toEqual(["a1", "s1", "a2"])
    expect(items[1].message.role).toBe("system")
    expect(items[1].message.content).toEqual([
      { type: "text", text: "This session is being continued…" },
    ])
  })

  it("clones merged content so caller mutations do not mutate source turns", () => {
    const messages = [
      turn({ id: "a1", content: [{ type: "text", text: "first" }] }),
      turn({ id: "a2", content: [{ type: "text", text: "second" }] }),
    ]

    const items = buildRenderMessageItems(messages)
    items[0].message.content[0].text = "changed"

    expect(messages[0].content[0].text).toBe("first")
  })
})
