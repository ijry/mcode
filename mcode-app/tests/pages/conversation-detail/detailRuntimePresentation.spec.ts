import {
  buildLiveActivitySignature,
  buildOptimisticText,
  draftSummary,
  formatQueueTime,
  formatTokenCountK,
  isStoppableRuntimeStatus,
  looksLikeNetworkFailure,
  queueStatusText,
} from "@/pages/conversation-detail/detailRuntimePresentation"
import type { ContentPart } from "@/types/acp"
import type { QueuedDraft, UploadedAttachment } from "@/pages/conversation-detail/detailDataNormalization"

const attachment = (name: string): UploadedAttachment => ({
  id: name,
  name,
  url: `https://file/${name}`,
  size: 1,
  type: "text/plain",
  kind: "file",
})

describe("detailRuntimePresentation", () => {
  it("formats token counts in compact K units", () => {
    expect(formatTokenCountK(0)).toBe("0")
    expect(formatTokenCountK(999)).toBe("<1K")
    expect(formatTokenCountK(1500)).toBe("1.5K")
    expect(formatTokenCountK(12_300)).toBe("12.3K")
    expect(formatTokenCountK(123_400)).toBe("123K")
  })

  it("detects stoppable runtime statuses", () => {
    expect(isStoppableRuntimeStatus("thinking")).toBe(true)
    expect(isStoppableRuntimeStatus("running_tool")).toBe(true)
    expect(isStoppableRuntimeStatus("waiting_permission")).toBe(true)
    expect(isStoppableRuntimeStatus("waiting_question")).toBe(true)
    expect(isStoppableRuntimeStatus("connected")).toBe(false)
  })

  it("builds stable live activity signatures from content parts", () => {
    const parts: ContentPart[] = [
      { type: "text", text: "hello" },
      { type: "thinking", thinking: "think" },
      {
        type: "tool_call",
        tool_call: {
          id: "tool-1",
          name: "Read",
          status: "running",
          input: { path: "a.txt" },
          output: "",
        },
      },
      {
        type: "tool_result",
        tool_result: {
          tool_call_id: "tool-1",
          output: "done",
          is_error: false,
        },
      },
      { type: "plan", plan: { steps: [{ description: "ship" }] } },
    ]

    expect(buildLiveActivitySignature(parts)).toBe(JSON.stringify([
      ["text", "hello"],
      ["thinking", "think"],
      ["tool_call", "tool-1", "Read", "running", JSON.stringify({ path: "a.txt" }), "", ""],
      ["tool_result", "tool-1", "done", "0"],
      ["plan", JSON.stringify({ steps: [{ description: "ship" }] })],
    ]))
  })

  it("formats queued draft labels and optimistic text", () => {
    const draft: QueuedDraft = {
      id: "draft-1",
      text: "  send this  ",
      attachments: [attachment("a.txt")],
      createdAt: new Date(2026, 0, 1, 9, 5).getTime(),
      status: "pending",
    }

    expect(draftSummary(draft)).toBe("send this（1 个附件）")
    expect(draftSummary({ ...draft, text: "  ", attachments: [attachment("a.txt"), attachment("b.txt")] }))
      .toBe("附件消息（2 个）")
    expect(queueStatusText("sending")).toBe("发送中")
    expect(queueStatusText("failed")).toBe("失败")
    expect(queueStatusText("pending")).toBe("待发送")
    expect(formatQueueTime(draft.createdAt)).toBe("09:05")
    expect(buildOptimisticText("hello", [])).toBe("hello")
    expect(buildOptimisticText("", [attachment("a.txt")])).toBe("已附文件：a.txt")
    expect(buildOptimisticText("hello", [attachment("a.txt"), attachment("b.txt")]))
      .toBe("hello\n\n已附文件：a.txt、b.txt")
  })

  it("detects network-like failure copy", () => {
    expect(looksLikeNetworkFailure("WebSocket connection timed out")).toBe(true)
    expect(looksLikeNetworkFailure("主机网络不可达")).toBe(true)
    expect(looksLikeNetworkFailure("permission denied")).toBe(false)
  })
})
