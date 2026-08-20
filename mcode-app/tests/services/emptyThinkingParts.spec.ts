import fs from "node:fs"
import path from "node:path"

import {
  dropEmptyThinkingParts,
  isEmptyThinkingPart,
} from "@/services/conversation/conversationTurnIdentity"
import { buildBubbleDisplayParts } from "@/services/conversation/bubbleDisplayParts"
import {
  mapPersistedTurnToMessage,
  normalizeContentParts,
  normalizeTurns,
} from "@/pages/conversation-detail/detailDataNormalization"

const readSource = (relative: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../src", relative), "utf8")

describe("isEmptyThinkingPart", () => {
  it("only matches thinking parts whose text is blank", () => {
    expect(isEmptyThinkingPart({ type: "thinking", thinking: "" } as any)).toBe(true)
    // 纯空白也算空：服务端的 redacted 胶囊有时带换行。
    expect(isEmptyThinkingPart({ type: "thinking", thinking: "  \n " } as any)).toBe(true)
    expect(isEmptyThinkingPart({ type: "thinking" } as any)).toBe(true)
    expect(isEmptyThinkingPart({ type: "thinking", thinking: "推理" } as any)).toBe(false)
    // 只认 thinking：空 text 是合法的（比如工具轮次里的占位），不能顺手删。
    expect(isEmptyThinkingPart({ type: "text", text: "" } as any)).toBe(false)
    expect(isEmptyThinkingPart(null)).toBe(false)
    expect(isEmptyThinkingPart(undefined)).toBe(false)
  })

  it("keeps every non-empty part and its order", () => {
    const parts = [
      { type: "text", text: "before" },
      { type: "thinking", thinking: "" },
      { type: "thinking", thinking: "kept" },
      { type: "thinking", thinking: "   " },
      { type: "text", text: "after" },
    ] as any[]

    expect(dropEmptyThinkingParts(parts)).toEqual([
      { type: "text", text: "before" },
      { type: "thinking", thinking: "kept" },
      { type: "text", text: "after" },
    ])
  })
})

describe("empty thinking capsules never reach the timeline", () => {
  it("drops them from typed content parts", () => {
    // 用户报的现象：一轮里「很多个深度思考，点开还是空的」。成因在服务端 ——
    // parsers/claude.rs 用 as_str() 取值，对 "" 返回 Some("")，无条件 push 一个
    // Thinking { text: "" }；group_into_turns 又把一条 assistant 消息和它后面所有
    // tool-result 折成一个轮次，于是 N 个空胶囊全挤进同一个气泡。
    expect(normalizeContentParts([
      { type: "thinking", thinking: "" },
      { type: "text", text: "answer" },
      { type: "thinking", thinking: "" },
    ])).toEqual([{ type: "text", text: "answer" }])
  })

  it("drops them from CodeG blocks, where the transcript actually carries them", () => {
    // blocks 分支读的是 block.text（不是 block.thinking）—— 这是服务端 Thinking 块
    // 序列化后的字段名，两条分支都要滤到。
    expect(normalizeContentParts(undefined, [
      { type: "thinking", text: "" },
      { type: "thinking", text: "real reasoning" },
      { type: "text", text: "answer" },
    ])).toEqual([
      { type: "thinking", thinking: "real reasoning" },
      { type: "text", text: "answer" },
    ])
  })

  it("does not mistake an all-empty-thinking turn for a parse failure", () => {
    // 过滤放在归一化的**出口**而不是 normalizeBlocks 里逐条跳过，正是为了这一条：
    // 内部的三处 `if (parts.length > 0) return parts` 用「这一路有没有解析出东西」
    // 做分支选择。blocks 里只有一个空 thinking 时，blocks 分支**照旧胜出**（它确实
    // 解析出了 1 个 part），过滤发生在选择之后，结果是空数组。
    //
    // 若把过滤挪进 normalizeBlocks，这一路就会变成 0 个 part、被判成解析失败，
    // 从而回退去把 rawContent 当字符串解析、渲染出一条本不该出现的 text ——
    // 那是行为改变，所以这里把「不回退」钉死。
    expect(normalizeContentParts("fallback text", [{ type: "thinking", text: "" }])).toEqual([])
    expect(normalizeContentParts([{ type: "thinking", thinking: "" }])).toEqual([])
  })

  it("keeps the surrounding turn even when filtering empties its content", () => {
    // 不能因为内容被滤空就把整条轮次丢掉：轮次本身（角色、时间戳、dedupeKey）
    // 仍然是时间线的一部分，丢了会让远端对账认为本地少了一条而反复回填。
    const turns = normalizeTurns([
      { id: "a1", role: "assistant", content: [{ type: "thinking", thinking: "" }] },
    ])

    expect(turns).toHaveLength(1)
    expect(turns[0].content).toEqual([])
  })

  it("filters stale SQLite rows on read, not just on write", () => {
    // 过滤上线前落库的行里已经存了一批空胶囊。只在写入侧过滤治不了存量缓存 ——
    // 本地水合会把它们原样读回来，用户重启 App 依然看到一排空的深度思考。
    const message = mapPersistedTurnToMessage({
      id: "turn-local",
      conversationId: 7,
      instanceKey: "direct::phone",
      dedupeKey: "dedupe",
      role: "assistant",
      createdAt: 12345,
      seq: 1,
      status: "completed",
      version: 1,
      parts: [
        {
          id: "part-0",
          turnId: "turn-local",
          conversationId: 7,
          partIndex: 0,
          type: "thinking",
          payloadJson: JSON.stringify({ thinking: "" }),
          updatedAt: 1,
        },
        {
          id: "part-1",
          turnId: "turn-local",
          conversationId: 7,
          partIndex: 1,
          type: "text",
          payloadJson: JSON.stringify({ text: "answer" }),
          updatedAt: 1,
        },
      ],
    } as any)

    expect(message.content).toEqual([{ type: "text", text: "answer" }])
  })
})

describe("streaming keeps empty thinking", () => {
  // 这两条以前是对 `MessageBubble.vue` 的源码文本断言（`toContain` + 正则）。
  // 它们**挡不住行为回归**：`isEmptyThinkingPart` 曾在气泡里被调用却没被 import，
  // 非流式轮次每次重算 displayParts 都 ReferenceError，而文本断言全程是绿的。
  // 分组循环抽进 `buildBubbleDisplayParts` 后改成行为断言。
  const parts = [
    { type: "thinking", thinking: "" },
    { type: "text", text: "answer" },
  ] as any[]

  it("drops empty thinking on the history path", () => {
    expect(buildBubbleDisplayParts({ parts, isStreaming: false })).toEqual([
      { type: "text", text: "answer" },
    ])
  })

  it("keeps empty thinking while streaming", () => {
    // 流式期间**不能**丢：空 thinking 驱动「正在思考」指示器，而对
    // reasoning-redacting 模型来说这个空状态是永久的（正文永远不会补上来）。
    expect(buildBubbleDisplayParts({ parts, isStreaming: true })).toEqual([
      { type: "thinking", thinking: "" },
      { type: "text", text: "answer" },
    ])
  })

  it("filters before assigning render indexes so collapse state stays aligned", () => {
    // 折叠状态 `isThinkingCollapsed(index)` 用的是渲染列表的下标。过滤若发生在
    // 模板的 v-else-if 上（即留在返回值里让模板跳过），下标就与实际渲染项错位 ——
    // 点一个展开另一个。所以空块必须在这里就消失，而不是被标记后保留。
    const withTwoEmpties = [
      { type: "thinking", thinking: "" },
      { type: "thinking", thinking: "推理" },
      { type: "thinking", thinking: "  " },
      { type: "text", text: "answer" },
    ] as any[]

    const rendered = buildBubbleDisplayParts({ parts: withTwoEmpties, isStreaming: false })

    expect(rendered).toHaveLength(2)
    expect(rendered[0]).toEqual({ type: "thinking", thinking: "推理" })
    expect(rendered[1]).toEqual({ type: "text", text: "answer" })
  })

  it("keeps dropping empty thinking inside goal runs", () => {
    // `GoalToolCallBlock` 走 skipGoalRuns 复用同一个函数，过滤不能因此失效。
    expect(buildBubbleDisplayParts({ parts, isStreaming: false, skipGoalRuns: true })).toEqual([
      { type: "text", text: "answer" },
    ])
  })

  it("never filters the live snapshot rebuild in the runtime store", () => {
    const source = readSource("stores/conversationRuntime.ts")
    const snapshotBlock = source.slice(
      source.indexOf("function mapSnapshotContentBlock"),
      source.indexOf("function mapSnapshotContentBlock") + 1200,
    )

    expect(snapshotBlock).toContain('return { type: "thinking", thinking: firstString(block?.text) || "" }')
    // mapSnapshotContentBlock 复原的是实时 liveMessage（isStreaming: true），
    // 所以这条路径故意不过滤。
    expect(snapshotBlock).not.toContain("dropEmptyThinkingParts")
  })
})
