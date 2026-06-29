import {
  appendQueuedDraft,
  canContinueDraftQueue,
  buildDraftPromptBlocks,
  canProcessDraftQueue,
  createComposerDraft,
  createStandaloneDraft,
  finalizeQueuedDraftAttempt,
  findQueuedDraftById,
  hasPromptActuallyStarted,
  prependFailedQueuedDraft,
  removeQueuedDraftById,
  splitDraftAttachments,
} from "@/pages/conversation-detail/detailDraftQueue"
import type { QueuedDraft, UploadedAttachment } from "@/pages/conversation-detail/detailDataNormalization"

const createId = (prefix: string) => `${prefix}-id`

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

describe("detailDraftQueue", () => {
  it("creates standalone and composer drafts", () => {
    expect(createStandaloneDraft({
      text: "  /review  ",
      createId,
      now: 123,
    })).toEqual({
      id: "draft-id",
      text: "/review",
      attachments: [],
      createdAt: 123,
      status: "pending",
    })
    expect(createStandaloneDraft({ text: "  ", createId })).toBeNull()

    const image = attachment("image", "image.png")
    const composerDraft = createComposerDraft({
      text: " hello ",
      attachments: [image],
      createId,
      now: 456,
    })
    expect(composerDraft).toEqual({
      id: "draft-id",
      text: "hello",
      attachments: [image],
      createdAt: 456,
      status: "pending",
    })
    if (composerDraft) {
      composerDraft.attachments[0].name = "changed"
    }
    expect(image.name).toBe("image.png")
    expect(createComposerDraft({ text: "", attachments: [], createId })).toBeNull()
  })

  it("builds prompt blocks from text, images, and files", () => {
    expect(buildDraftPromptBlocks(draft({
      text: "hello",
      attachments: [
        attachment("image", "image.png"),
        attachment("file", "a.txt"),
      ],
    }))).toEqual([
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
    ])

    expect(() => buildDraftPromptBlocks(draft({
      text: "hello",
      attachments: [{
        ...attachment("image", "missing.png"),
        data: undefined,
        localPath: undefined,
        url: "/tmp/missing.png",
      }],
    }))).toThrow("图片缺少可发送数据")
  })

  it("splits attachments and detects started prompt states", () => {
    const image = attachment("image", "image.png")
    const file = attachment("file", "a.txt")
    expect(splitDraftAttachments(draft({ attachments: [image, file] }))).toEqual({
      imageAttachments: [image],
      fileAttachments: [file],
    })
    expect(hasPromptActuallyStarted({ status: "connected", liveContentLength: 1 })).toBe(true)
    expect(hasPromptActuallyStarted({ status: "thinking", liveContentLength: 0 })).toBe(true)
    expect(hasPromptActuallyStarted({ status: "connected", liveContentLength: 0 })).toBe(false)
  })

  it("checks whether the draft queue can process", () => {
    expect(canContinueDraftQueue({
      isBusyForSend: false,
      uploadingCount: 0,
      canSendSharedLive: true,
      draftQueueLength: 1,
    })).toBe(true)
    expect(canContinueDraftQueue({
      isBusyForSend: true,
      uploadingCount: 0,
      canSendSharedLive: true,
      draftQueueLength: 1,
    })).toBe(false)

    expect(canProcessDraftQueue({
      processingQueue: false,
      isBusyForSend: false,
      uploadingCount: 0,
      canSendSharedLive: true,
      draftQueueLength: 1,
    })).toBe(true)
    expect(canProcessDraftQueue({
      processingQueue: true,
      isBusyForSend: false,
      uploadingCount: 0,
      canSendSharedLive: true,
      draftQueueLength: 1,
    })).toBe(false)
    expect(canProcessDraftQueue({
      processingQueue: false,
      isBusyForSend: false,
      uploadingCount: 1,
      canSendSharedLive: true,
      draftQueueLength: 1,
    })).toBe(false)
    expect(canProcessDraftQueue({
      processingQueue: false,
      isBusyForSend: false,
      uploadingCount: 0,
      canSendSharedLive: true,
      draftQueueLength: 0,
    })).toBe(false)
  })

  it("handles queue mutations by draft id", () => {
    const first = draft({ id: "draft-1", status: "pending" })
    const second = draft({ id: "draft-2", status: "sending" })
    const queue = [first, second]

    expect(appendQueuedDraft([first], second)).toEqual([first, second])
    expect(prependFailedQueuedDraft([second], first)).toEqual([
      { ...first, status: "failed" },
      second,
    ])
    expect(findQueuedDraftById(queue, "draft-2")).toEqual(second)
    expect(findQueuedDraftById(queue, "missing")).toBeNull()
    expect(removeQueuedDraftById(queue, "draft-1")).toEqual([second])
    expect(removeQueuedDraftById(queue, "missing")).toEqual(queue)
    expect(finalizeQueuedDraftAttempt(queue, "draft-2", true)).toEqual([first])
    expect(finalizeQueuedDraftAttempt(queue, "draft-1", false)).toEqual([
      { ...first, status: "failed" },
      second,
    ])
    expect(finalizeQueuedDraftAttempt(queue, "missing", false)).toEqual(queue)
  })
})
