import type { PromptInputBlock } from "@/types/acp"
import type { QueuedDraft, UploadedAttachment } from "./detailDataNormalization"
import { resolveSlashPreset } from "./detailSlashCommands"

export interface DraftIdFactory {
  (prefix: string): string
}

export interface DraftQueueProcessState {
  processingQueue: boolean
  isBusyForSend: boolean
  uploadingCount: number
  canSendSharedLive: boolean
  draftQueueLength: number
}

export function createStandaloneDraft(input: {
  text: string
  createId: DraftIdFactory
  now?: number
}): QueuedDraft | null {
  const normalized = resolveSlashPreset(String(input.text || "").trim())
  if (!normalized) return null
  return {
    id: input.createId("draft"),
    text: normalized,
    attachments: [],
    createdAt: input.now ?? Date.now(),
    status: "pending",
  }
}

export function createComposerDraft(input: {
  text: string
  attachments: UploadedAttachment[]
  createId: DraftIdFactory
  now?: number
}): QueuedDraft | null {
  const text = String(input.text || "").trim()
  const attachments = input.attachments.map((att) => ({ ...att }))
  if (!text && attachments.length === 0) return null
  return {
    id: input.createId("draft"),
    text: resolveSlashPreset(text),
    attachments,
    createdAt: input.now ?? Date.now(),
    status: "pending",
  }
}

export function buildDraftPromptBlocks(draft: QueuedDraft): PromptInputBlock[] {
  const blocks: PromptInputBlock[] = []
  if (draft.text) {
    blocks.push({ type: "text", text: draft.text })
  }

  draft.attachments.forEach((att) => {
    if (att.kind === "image") {
      blocks.push({
        type: "image",
        source: { type: "url", url: att.url, media_type: att.type },
      })
      return
    }
    blocks.push({
      type: "resource",
      resource: {
        type: "file",
        uri: att.url,
        name: att.name,
        size: att.size,
      },
    })
  })

  return blocks
}

export function splitDraftAttachments(draft: QueuedDraft): {
  imageAttachments: UploadedAttachment[]
  fileAttachments: UploadedAttachment[]
} {
  return {
    imageAttachments: draft.attachments.filter((item) => item.kind === "image"),
    fileAttachments: draft.attachments.filter((item) => item.kind === "file"),
  }
}

export function hasPromptActuallyStarted(input: {
  status?: string
  liveContentLength?: number
}) {
  if (Number(input.liveContentLength || 0) > 0) return true
  return (
    input.status === "thinking" ||
    input.status === "running_tool" ||
    input.status === "waiting_permission" ||
    input.status === "waiting_question"
  )
}

export function canProcessDraftQueue(input: DraftQueueProcessState) {
  return (
    !input.processingQueue &&
    !input.isBusyForSend &&
    input.uploadingCount === 0 &&
    input.canSendSharedLive &&
    input.draftQueueLength > 0
  )
}
