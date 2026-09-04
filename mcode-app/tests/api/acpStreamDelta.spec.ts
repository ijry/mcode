import { acpApi } from "@/api/acp"

/**
 * 流式 delta 是字节流的一段，必须**原样**透传。
 *
 * 归一化层曾经把它过 `firstString`（trim + 空白判假），于是：chunk 的前后空白被吃掉
 * （`"Hello"` + `" world"` 拼成 `"Helloworld"`），纯空白 chunk（`" "` / `"\n\n"`）
 * 整块丢弃 —— 独立成块的段落空行就此消失。能否看见取决于服务端怎么切块，所以这类 bug
 * 可以潜伏很久，必须由测试锁住。
 */
describe("acpApi stream delta normalization", () => {
  function contentDelta(text: unknown) {
    return acpApi.normalizeRealtimeEvent({
      connection_id: "conn-1",
      type: "content_delta",
      text,
    })
  }

  function thinkingDelta(text: unknown) {
    return acpApi.normalizeRealtimeEvent({
      connection_id: "conn-1",
      type: "thinking",
      text,
    })
  }

  it("keeps the leading space that joins two words", () => {
    expect(contentDelta("Hello")).toMatchObject({
      type: "stream_batch",
      data: { delta: "Hello", contentType: "text" },
    })
    expect(contentDelta(" world")).toMatchObject({
      data: { delta: " world" },
    })
  })

  it("keeps a whitespace-only chunk instead of dropping it", () => {
    expect(contentDelta("\n\n")).toMatchObject({ data: { delta: "\n\n" } })
    expect(contentDelta(" ")).toMatchObject({ data: { delta: " " } })
  })

  it("preserves trailing whitespace and indentation", () => {
    expect(contentDelta("line one\n    ")).toMatchObject({
      data: { delta: "line one\n    " },
    })
  })

  it("applies the same rule to thinking deltas", () => {
    expect(thinkingDelta("  reasoning  ")).toMatchObject({
      type: "stream_batch",
      data: { delta: "  reasoning  ", contentType: "thinking" },
    })
    expect(thinkingDelta("\n")).toMatchObject({ data: { delta: "\n" } })
  })

  it("falls back to an empty string for non-string payloads", () => {
    expect(contentDelta(undefined)).toMatchObject({ data: { delta: "" } })
    expect(contentDelta(null)).toMatchObject({ data: { delta: "" } })
    expect(contentDelta(42)).toMatchObject({ data: { delta: "" } })
  })

  it("still trims the subagent attribution id", () => {
    // `parentToolUseId` 是标识符，不是正文 —— 那个仍然该 trim。
    expect(
      acpApi.normalizeRealtimeEvent({
        connection_id: "conn-1",
        type: "content_delta",
        text: " chunk ",
        parent_tool_use_id: "  task-1  ",
      })
    ).toMatchObject({
      data: { delta: " chunk ", parentToolUseId: "task-1" },
    })
  })
})
