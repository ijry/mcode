import {
  buildDraftPromptBlocks,
  canProcessDraftQueue,
  createComposerDraft,
  createStandaloneDraft,
  hasPromptActuallyStarted,
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
    ])
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
})
