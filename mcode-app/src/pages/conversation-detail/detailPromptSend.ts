import type { PromptInputBlock } from "@/types/acp"
import type { QueuedDraft, UploadedAttachment } from "./detailDataNormalization"
import { buildOptimisticText } from "./detailRuntimePresentation"
import { buildDraftPromptBlocks, splitDraftAttachments } from "./detailDraftQueue"

export interface DraftSendPayload {
  imageAttachments: UploadedAttachment[]
  fileAttachments: UploadedAttachment[]
  optimisticText: string
  blocks: PromptInputBlock[]
}

export interface SendAttemptResult {
  started: boolean
  error?: string
}

export function buildDraftSendPayload(draft: QueuedDraft): DraftSendPayload {
  const { imageAttachments, fileAttachments } = splitDraftAttachments(draft)
  return {
    imageAttachments,
    fileAttachments,
    optimisticText: buildOptimisticText(draft.text, fileAttachments),
    blocks: buildDraftPromptBlocks(draft),
  }
}

export function resolveDraftSendFailure(result: {
  startedResult?: SendAttemptResult | null
  errorMessage?: string
  fallbackMessage?: string
}) {
  const message =
    result.startedResult && !result.startedResult.started
      ? result.startedResult.error || result.fallbackMessage || "请求已发出，但智能体未开始处理"
      : result.errorMessage || result.fallbackMessage || "发送失败"
  return {
    status: "failed" as const,
    error: message,
    toastTitle: `发送失败: ${message}`,
  }
}

export function findLatestOptimisticTurnId(source: Array<{ id?: string | null } | null | undefined>) {
  for (let index = source.length - 1; index >= 0; index--) {
    const id = source[index]?.id
    if (typeof id === "string" && id) return id
  }
  return ""
}
