import {
  buildRenderMessageItems,
  findLatestUserMessage,
} from "@/pages/conversation-detail/detailMessagePresentation"
import type { MessageTurn } from "@/types/acp"

const turn = (overrides: Partial<MessageTurn>): MessageTurn => ({
  id: "turn",
  role: "assistant",
  content: [],
  timestamp: 1000,
  ...overrides,
})

describe("detailMessagePresentation", () => {
  it("selects the newest user turn by timestamp instead of array order", () => {
    const newest = turn({
      id: "newest",
      role: "user",
      timestamp: 200,
      content: [{ type: "text", text: "要" }],
    })
    const stale = turn({
      id: "stale",
      role: "user",
      timestamp: 100,
      content: [{ type: "text", text: "继续" }],
    })

    expect(findLatestUserMessage([newest, stale])).toBe(newest)
  })

  it("uses source position as a stable tie-break when timestamps match", () => {
    const first = turn({ id: "first", role: "user", timestamp: 100 })
    const second = turn({ id: "second", role: "user", timestamp: 100 })

    expect(findLatestUserMessage([first, second])).toBe(second)
  })

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

    // key 只用首条 id：尾随 assistant 串的成员在流式期间会变（新轮次落盘、
    // suppressCoveredTrailingAssistantPartial 按内容前缀增删尾部轮次、live 结束换成
    // 落盘 id）。key 里带 last.id 会让整个合并气泡销毁重建，里面所有 up-markdown
    // 重新解析。锚点仍然用 last.id —— 那才是要滚到的位置。
    expect(items.map((item) => item.key)).toEqual(["u1", "merged-a1", "u2"])
    expect(items[1]).toEqual({
      key: "merged-a1",
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

  // 合并串的成员变化时 key 必须保持稳定，否则 Vue 把整个气泡当新节点重建。
  it("keeps the merged key stable when the trailing assistant run grows", () => {
    const a1 = turn({ id: "a1", content: [{ type: "text", text: "first" }], timestamp: 10 })
    const a2 = turn({ id: "a2", content: [{ type: "text", text: "second" }], timestamp: 20 })
    const a3 = turn({ id: "a3", content: [{ type: "text", text: "third" }], timestamp: 30 })

    const before = buildRenderMessageItems([a1, a2])
    const after = buildRenderMessageItems([a1, a2, a3])

    expect(before[0].key).toBe(after[0].key)
    expect(after[0].anchorId).toBe("a3")
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

  // 合并时**刻意不拷贝** content parts，直接拼引用。
  //
  // 原先是 `JSON.parse(JSON.stringify(...))`，纯防御性 —— 全仓库没有任何消费者会改
  // `item.message.content`（`buildBubbleDisplayParts` / `buildGoalDisplayParts` 只往新
  // 数组里 push 引用，MessageBubble 及其子组件全是只读）。而这个函数在
  // `renderMessageItems` computed 里、每个流式 delta 都会重跑，深拷贝的代价是
  // 「整串尾随 assistant 轮次 + 整条 live 正文」，并且会让所有 part 换身份、
  // 逼着气泡内每个子组件重渲染。
  //
  // 这条测试锁的是「引用共享」这个前提。**如果哪天有消费者需要改 parts，不要把深拷贝
  // 加回来** —— 在那个消费者侧拷它自己要改的那一份。
  it("shares content part references with the source turns instead of deep-cloning", () => {
    const first = { type: "text" as const, text: "first" }
    const second = { type: "text" as const, text: "second" }
    const messages = [
      turn({ id: "a1", content: [first] }),
      turn({ id: "a2", content: [second] }),
    ]

    const items = buildRenderMessageItems(messages)

    expect(items[0].message.content[0]).toBe(first)
    expect(items[0].message.content[1]).toBe(second)
  })
})
