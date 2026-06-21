import {
  buildDraftSendPayload,
  findLatestOptimisticTurnId,
  resolveDraftSendFailure,
} from "@/pages/conversation-detail/detailPromptSend"
import type { QueuedDraft, UploadedAttachment } from "@/pages/conversation-detail/detailDataNormalization"

const attachment = (kind: UploadedAttachment["kind"], name: string): UploadedAttachment => ({
  id: name,
  url: `https://file/${name}`,
  name,
  size: 10,
  type: kind === "image" ? "image/png" : "text/plain",
  kind,
})

const draft = (patch: Partial<QueuedDraft> = {}): QueuedDraft => ({
  id: "draft",
  text: "hello",
  attachments: [],
  createdAt: 1,
  status: "pending",
  ...patch,
})

describe("detailPromptSend", () => {
  it("builds send payload from draft attachments and text", () => {
    expect(buildDraftSendPayload(draft({
      text: "hello",
      attachments: [
        attachment("image", "image.png"),
        attachment("file", "a.txt"),
      ],
    }))).toEqual({
      imageAttachments: [attachment("image", "image.png")],
      fileAttachments: [attachment("file", "a.txt")],
      optimisticText: "hello\n\n已附文件：a.txt",
      blocks: [
        { type: "text", text: "hello" },
        {
          type: "image",
          source: { type: "url", url: "https://file/image.png", media_type: "image/png" },
        },
        {
          type: "resource",
          resource: {
            type: "file",
            uri: "https://file/a.txt",
            name: "a.txt",
            size: 10,
          },
        },
      ],
    })
  })

  it("resolves send failures from not-started results and caught errors", () => {
    expect(resolveDraftSendFailure({
      startedResult: { started: false, error: "未开始" },
      fallbackMessage: "请求已发出，但智能体未开始处理",
    })).toEqual({
      status: "failed",
      error: "未开始",
      toastTitle: "发送失败: 未开始",
    })

    expect(resolveDraftSendFailure({
      startedResult: { started: false },
      fallbackMessage: "请求已发出，但智能体未开始处理",
    })).toEqual({
      status: "failed",
      error: "请求已发出，但智能体未开始处理",
      toastTitle: "发送失败: 请求已发出，但智能体未开始处理",
    })

    expect(resolveDraftSendFailure({ errorMessage: "网络异常" })).toEqual({
      status: "failed",
      error: "网络异常",
      toastTitle: "发送失败: 网络异常",
    })
  })

  it("finds the latest optimistic turn id", () => {
    expect(findLatestOptimisticTurnId([
      null,
      { id: "" },
      { id: "turn-1" },
      undefined,
      { id: "turn-2" },
    ])).toBe("turn-2")
    expect(findLatestOptimisticTurnId([{ id: "" }, null])).toBe("")
  })
})
