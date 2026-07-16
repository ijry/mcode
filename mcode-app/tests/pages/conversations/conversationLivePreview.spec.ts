import {
  CONVERSATION_LIST_LIVE_PREVIEW_LIMIT,
  CONVERSATION_LIST_LIVE_PREVIEW_TEXT_LIMIT,
  resolveConversationLivePreviewText,
  selectConversationLivePreviewIds,
  trimLivePreviewText,
} from "@/pages/conversations/conversationLivePreview"

describe("conversationLivePreview", () => {
  it("selects only in-progress cards and applies the default cap", () => {
    const cards = [
      { conversationId: 1, displayStatus: "completed" },
      { conversationId: 2, displayStatus: "in_progress" },
      { conversationId: 3, displayStatus: "thinking" },
      { conversationId: 4, displayStatus: "running_tool" },
      { conversationId: 5, displayStatus: "waiting_permission" },
      { conversationId: 6, displayStatus: "waiting_question" },
      { conversationId: 7, displayStatus: "in_progress" },
      { conversationId: 8, displayStatus: "in_progress" },
    ]

    expect(selectConversationLivePreviewIds({ cards })).toEqual([2, 3, 4, 5, 6])
    expect(selectConversationLivePreviewIds({ cards, limit: 3 })).toEqual([2, 3, 4])
    expect(CONVERSATION_LIST_LIVE_PREVIEW_LIMIT).toBe(5)
  })

  it("dedupes repeated conversation ids in card order", () => {
    expect(selectConversationLivePreviewIds({
      cards: [
        { conversationId: 10, displayStatus: "in_progress" },
        { conversationId: 10, displayStatus: "running_tool" },
        { conversationId: 11, displayStatus: "in_progress" },
      ],
    })).toEqual([10, 11])
  })

  it("builds one-line text from runtime live content", () => {
    expect(resolveConversationLivePreviewText({
      status: "thinking",
      liveMessage: {
        role: "assistant",
        isStreaming: true,
        timestamp: 1,
        content: [
          { type: "text", text: "hello" },
          { type: "text", text: " world" },
        ],
      },
    })).toBe("hello world")
  })

  it("prefers running tool and waiting states over plain text", () => {
    expect(resolveConversationLivePreviewText({
      status: "running_tool",
      liveMessage: {
        role: "assistant",
        isStreaming: true,
        timestamp: 1,
        content: [
          { type: "text", text: "before tool" },
          {
            type: "tool_call",
            tool_call: {
              id: "tool-1",
              name: "shell_command",
              input: {},
              status: "running",
            },
          },
        ],
      },
    })).toBe("正在调用工具：shell_command")

    expect(resolveConversationLivePreviewText({
      status: "waiting_permission",
      pendingPermission: { id: "perm-1" },
      liveMessage: null,
    })).toBe("等待确认")

    expect(resolveConversationLivePreviewText({
      status: "waiting_question",
      pendingQuestion: { question_id: "q1" },
      liveMessage: null,
    })).toBe("等待回答")
  })

  it("falls back to thinking text and placeholder text", () => {
    expect(resolveConversationLivePreviewText({
      status: "thinking",
      liveMessage: {
        role: "assistant",
        isStreaming: true,
        timestamp: 1,
        content: [{ type: "thinking", thinking: "checking files" }],
      },
    })).toBe("思考：checking files")

    expect(resolveConversationLivePreviewText({
      status: "thinking",
      liveMessage: {
        role: "assistant",
        isStreaming: true,
        timestamp: 1,
        isPlaceholderThinking: true,
        content: [],
      },
    })).toBe("思考中...")
  })

  it("caps long streaming text to protect list rendering", () => {
    const longText = `${"a".repeat(CONVERSATION_LIST_LIVE_PREVIEW_TEXT_LIMIT)}tail`

    expect(trimLivePreviewText(longText)).toBe(
      `...${longText.slice(-(CONVERSATION_LIST_LIVE_PREVIEW_TEXT_LIMIT - 3))}`
    )

    const preview = resolveConversationLivePreviewText({
      status: "thinking",
      liveMessage: {
        role: "assistant",
        isStreaming: true,
        timestamp: 1,
        content: [{ type: "text", text: longText }],
      },
    })
    expect(preview.length).toBe(CONVERSATION_LIST_LIVE_PREVIEW_TEXT_LIMIT)
    expect(preview.endsWith("tail")).toBe(true)
  })
})
