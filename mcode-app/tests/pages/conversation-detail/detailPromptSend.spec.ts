import {
  buildDraftSendPayload,
  buildPromptStartWatchSignature,
  findLatestOptimisticTurnId,
  isQueuedPromptResponse,
  resolvePromptStartSnapshotOutcome,
  resolvePromptStartTimeoutFailure,
  resolvePromptStartWatchOutcome,
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
  ...(kind === "image" ? { data: "QUJD", localPath: `/tmp/${name}` } : {}),
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
    }), { targetAgent: "codeg" })).toEqual({
      imageAttachments: [attachment("image", "image.png")],
      fileAttachments: [attachment("file", "a.txt")],
      optimisticText: "hello\n\n已附文件：a.txt",
      blocks: [
        { type: "text", text: "hello" },
        {
          type: "image",
          data: "QUJD",
          mime_type: "image/png",
          uri: "/tmp/image.png",
        },
        {
          type: "resource_link",
          uri: "https://file/a.txt",
          name: "a.txt",
          mime_type: "text/plain",
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

  it("accepts queued prompt responses", () => {
    expect(isQueuedPromptResponse({
      status: "queued",
      queueItemId: "queue-1",
    })).toBe(true)
    expect(isQueuedPromptResponse({
      queued: true,
      queueItemId: "queue-1",
    })).toBe(true)
    expect(isQueuedPromptResponse({
      status: "ok",
    })).toBe(false)
    expect(isQueuedPromptResponse(null)).toBe(false)
  })

  it("builds stable prompt-start watch signatures", () => {
    expect(buildPromptStartWatchSignature(null)).toEqual(["", ""])
    expect(buildPromptStartWatchSignature({
      status: "thinking",
      liveMessage: {
        content: [{ type: "text", text: "hello" }],
      },
    })).toEqual([
      "thinking",
      JSON.stringify([{ type: "text", text: "hello" }]),
    ])
  })

  it("resolves prompt-start watch outcomes", () => {
    expect(resolvePromptStartWatchOutcome({
      hasStarted: true,
      draftStatus: "sending",
    })).toEqual({ started: true })

    expect(resolvePromptStartWatchOutcome({
      hasStarted: false,
      draftStatus: "failed",
      draftError: "发送失败了",
      fallbackMessage: "发送失败",
    })).toEqual({
      started: false,
      error: "发送失败了",
    })

    expect(resolvePromptStartWatchOutcome({
      hasStarted: false,
      draftStatus: "pending",
      fallbackMessage: "发送失败",
    })).toBeNull()
  })

  it("resolves prompt-start timeout and snapshot outcomes", () => {
    expect(resolvePromptStartTimeoutFailure("请求已入队，但会话没有进入运行状态")).toEqual({
      started: false,
      error: "请求已入队，但会话没有进入运行状态",
    })

    expect(resolvePromptStartSnapshotOutcome({
      startedBySnapshot: true,
      hasStartedAfterSnapshot: false,
      timeoutMessage: "请求已入队，但会话没有进入运行状态",
    })).toEqual({ started: true })

    expect(resolvePromptStartSnapshotOutcome({
      startedBySnapshot: false,
      hasStartedAfterSnapshot: true,
      timeoutMessage: "请求已入队，但会话没有进入运行状态",
    })).toEqual({ started: true })

    expect(resolvePromptStartSnapshotOutcome({
      startedBySnapshot: false,
      hasStartedAfterSnapshot: false,
      timeoutMessage: "请求已入队，但会话没有进入运行状态",
    })).toEqual({
      started: false,
      error: "请求已入队，但会话没有进入运行状态",
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
