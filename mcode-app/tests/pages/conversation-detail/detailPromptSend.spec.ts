import {
  buildDraftSendPayload,
  buildPromptStartWatchSignature,
  isConnectionNotFoundError,
  isNoActiveTurnRejection,
  isQueuedPromptResponse,
  isRealtimeFeedbackMenuDisabled,
  isTurnInProgressRejection,
  REALTIME_FEEDBACK_MAX_CHARS,
  resolvePromptStartSnapshotOutcome,
  resolvePromptStartTimeoutFailure,
  resolvePromptStartWatchOutcome,
  resolveDraftSendFailure,
  resolveNoActiveTurnFeedbackFallback,
  resolveFeedbackNoteStatusLabel,
  resolveRealtimeFeedbackChannel,
  resolveRunningSendAction,
  sendPromptWithConnectionRecovery,
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
  it("builds ACP prompt blocks from draft attachments and text", () => {
    expect(buildDraftSendPayload(draft({
      text: "hello",
      attachments: [
        attachment("image", "image.png"),
        attachment("file", "a.txt"),
      ],
    }), { targetAgent: "codeg" })).toEqual({
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

  it("recognizes only ACP missing-connection errors as recoverable", () => {
    expect(isConnectionNotFoundError(
      "acp_prompt: connection not found: eb16fb12-a8bd-4e5b-a498-9fbbf64c232f"
    )).toBe(true)
    expect(isConnectionNotFoundError("CONNECTION NOT FOUND: conn-1")).toBe(true)
    expect(isConnectionNotFoundError("network request failed")).toBe(false)
    expect(isConnectionNotFoundError("connection already in use")).toBe(false)
  })

  it("reconnects and retries a prompt once after a missing connection", async () => {
    const send = jest.fn()
      .mockRejectedValueOnce(new Error("acp_prompt: connection not found: conn-old"))
      .mockResolvedValueOnce({ status: "ok" })
    const reconnect = jest.fn().mockResolvedValue("conn-new")

    await expect(sendPromptWithConnectionRecovery({
      connectionId: "conn-old",
      send,
      reconnect,
    })).resolves.toEqual({
      connectionId: "conn-new",
      response: { status: "ok" },
      recovered: true,
    })

    expect(reconnect).toHaveBeenCalledWith("conn-old")
    expect(send).toHaveBeenNthCalledWith(1, "conn-old")
    expect(send).toHaveBeenNthCalledWith(2, "conn-new")
  })

  it("does not retry prompts for non-recoverable errors", async () => {
    const error = new Error("network request failed")
    const send = jest.fn().mockRejectedValue(error)
    const reconnect = jest.fn()

    await expect(sendPromptWithConnectionRecovery({
      connectionId: "conn-old",
      send,
      reconnect,
    })).rejects.toThrow(error)

    expect(reconnect).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("stops after the single retry when the recovered connection also fails", async () => {
    const error = new Error("acp_prompt: connection not found: conn-new")
    const send = jest.fn()
      .mockRejectedValueOnce(new Error("acp_prompt: connection not found: conn-old"))
      .mockRejectedValueOnce(error)
    const reconnect = jest.fn().mockResolvedValue("conn-new")

    await expect(sendPromptWithConnectionRecovery({
      connectionId: "conn-old",
      send,
      reconnect,
    })).rejects.toThrow(error)

    expect(reconnect).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledTimes(2)
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

})

describe("running send interception", () => {
  it("sends normally when no turn is running", () => {
    expect(resolveRunningSendAction({
      isBusy: false,
      nativeSteeringAvailable: false,
      hasAttachments: false,
    })).toBe("send")

    // native 能力与是否有附件都只在「运行中」这条路上才有意义 —— 空闲时一律直发。
    expect(resolveRunningSendAction({
      isBusy: false,
      nativeSteeringAvailable: true,
      hasAttachments: true,
    })).toBe("send")
  })

  it("offers the steer sheet only on sessions whose feedback channel is native", () => {
    expect(resolveRunningSendAction({
      isBusy: true,
      nativeSteeringAvailable: true,
      hasAttachments: false,
    })).toBe("steer_sheet")

    // 非 native（codex / 旧版 claude / mcode-desktop）：弹一个唯一选项还点不动的面板
    // 是纯噪音，直接走拦截提示。
    expect(resolveRunningSendAction({
      isBusy: true,
      nativeSteeringAvailable: false,
      hasAttachments: false,
    })).toBe("blocked")
  })

  it("blocks instead of offering the sheet when the draft carries attachments", () => {
    // 服务端 steering 是 text-only：给一个会静默丢掉附件的按钮，比不给更糟。
    expect(resolveRunningSendAction({
      isBusy: true,
      nativeSteeringAvailable: true,
      hasAttachments: true,
    })).toBe("blocked")
  })

  it("disables the explicit realtime feedback menu for Claude agents", () => {
    expect(isRealtimeFeedbackMenuDisabled({
      agentType: "claude_code",
      isBusy: true,
      feedbackToolAvailable: true,
      nativeSteeringAvailable: true,
      hasConnection: true,
      submitting: false,
    })).toBe(true)
    expect(isRealtimeFeedbackMenuDisabled({
      agentType: "Claude-Code",
      isBusy: true,
      feedbackToolAvailable: true,
      nativeSteeringAvailable: true,
      hasConnection: true,
      submitting: false,
    })).toBe(true)

    expect(isRealtimeFeedbackMenuDisabled({
      agentType: "codex",
      isBusy: true,
      feedbackToolAvailable: true,
      nativeSteeringAvailable: false,
      hasConnection: true,
      submitting: false,
    })).toBe(false)
  })

  it("selects native feedback before the pull fallback", () => {
    expect(resolveRealtimeFeedbackChannel({
      nativeSteeringAvailable: true,
      feedbackToolAvailable: true,
    })).toBe("native")
    expect(resolveRealtimeFeedbackChannel({
      nativeSteeringAvailable: false,
      feedbackToolAvailable: true,
    })).toBe("pull")
    expect(resolveRealtimeFeedbackChannel({
      nativeSteeringAvailable: false,
      feedbackToolAvailable: false,
    })).toBeNull()
    expect(REALTIME_FEEDBACK_MAX_CHARS).toBe(4096)
  })

  it("accepts a native-only channel for non-Claude agents", () => {
    expect(isRealtimeFeedbackMenuDisabled({
      agentType: "gemini",
      isBusy: true,
      feedbackToolAvailable: false,
      nativeSteeringAvailable: true,
      hasConnection: true,
      submitting: false,
    })).toBe(false)
  })

  it("requires an active feedback channel before enabling the menu", () => {
    const available = {
      agentType: "codex",
      isBusy: true,
      feedbackToolAvailable: true,
      nativeSteeringAvailable: false,
      hasConnection: true,
      submitting: false,
    }

    expect(isRealtimeFeedbackMenuDisabled({ ...available, isBusy: false })).toBe(true)
    expect(isRealtimeFeedbackMenuDisabled({
      ...available,
      feedbackToolAvailable: false,
      nativeSteeringAvailable: false,
    })).toBe(true)
    expect(isRealtimeFeedbackMenuDisabled({
      ...available,
      hasConnection: false,
    })).toBe(true)
    expect(isRealtimeFeedbackMenuDisabled({
      ...available,
      submitting: true,
    })).toBe(true)
  })

  it("recognizes the no-active-turn feedback rejection across transports", () => {
    expect(isNoActiveTurnRejection("submit_session_feedback: no active turn")).toBe(true)
    expect(isNoActiveTurnRejection(new Error("no active turn to send feedback to"))).toBe(true)
    expect(isNoActiveTurnRejection({
      message: "submit_session_feedback: no active turn",
    })).toBe(true)
    expect(isNoActiveTurnRejection({ code: "no_active_turn" })).toBe(true)
    expect(isNoActiveTurnRejection("turn already in progress")).toBe(false)
    expect(isNoActiveTurnRejection({ code: "target_offline" })).toBe(false)
  })

  it("returns feedback to the main composer only when it is empty", () => {
    expect(resolveNoActiveTurnFeedbackFallback({
      hasComposerContent: false,
    })).toBe("composer")
    expect(resolveNoActiveTurnFeedbackFallback({
      hasComposerContent: true,
    })).toBe("feedback_panel")
  })

  it("keeps feedback note labels independent from the current channel", () => {
    expect(resolveFeedbackNoteStatusLabel("pending")).toBe("等待读取")
    expect(resolveFeedbackNoteStatusLabel("delivered")).toBe("已送达")
  })

  it("recognizes the busy rejection from both backends", () => {
    // codeg-plus：`AcpError::TurnInProgress` 的 Display 串（error.rs:20），
    // web 传输另带稳定错误码 `turn_in_progress`（app_error.rs:92）。
    expect(isTurnInProgressRejection(
      "acp_prompt: turn already in progress for this connection"
    )).toBe(true)
    expect(isTurnInProgressRejection({ code: "turn_in_progress" })).toBe(true)
    expect(isTurnInProgressRejection({
      message: "turn already in progress for this connection",
    })).toBe(true)
    expect(isTurnInProgressRejection(
      new Error("acp_prompt: turn already in progress for this connection")
    )).toBe(true)

    // mcode-desktop：同一语义换了个名字（runtime/mod.rs:1760 的 turn_busy_error）。
    expect(isTurnInProgressRejection({ code: "turn_busy" })).toBe(true)
    expect(isTurnInProgressRejection(
      'acp_prompt: {"code":"turn_busy","message":"another device is running a turn"}'
    )).toBe(true)
  })

  it("does not mistake other failures for the busy rejection", () => {
    expect(isTurnInProgressRejection("network request failed")).toBe(false)
    expect(isTurnInProgressRejection({ code: "target_offline" })).toBe(false)
    expect(isTurnInProgressRejection(
      "acp_prompt: connection not found: conn-1"
    )).toBe(false)
    expect(isTurnInProgressRejection(null)).toBe(false)
    expect(isTurnInProgressRejection(undefined)).toBe(false)
  })
})
