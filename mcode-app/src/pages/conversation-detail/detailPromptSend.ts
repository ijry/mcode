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

export interface PromptStartWatchSessionLike {
  status?: string
  liveMessage?: {
    content?: unknown
  } | null
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

export function isQueuedPromptResponse(response: unknown) {
  if (!response || typeof response !== "object") return false
  const record = response as Record<string, unknown>
  const status = typeof record.status === "string" ? record.status.trim() : ""
  return status === "queued" || record.queued === true
}

export function buildPromptStartWatchSignature(
  session: PromptStartWatchSessionLike | null | undefined
) {
  return [
    session?.status || "",
    session?.liveMessage ? JSON.stringify(session.liveMessage.content || []) : "",
  ] as const
}

export function resolvePromptStartWatchOutcome(input: {
  hasStarted: boolean
  draftStatus: QueuedDraft["status"]
  draftError?: string
  fallbackMessage?: string
}): SendAttemptResult | null {
  if (input.hasStarted) {
    return { started: true }
  }
  if (input.draftStatus === "failed") {
    return {
      started: false,
      error: input.draftError || input.fallbackMessage || "发送失败",
    }
  }
  return null
}

export function resolvePromptStartTimeoutFailure(timeoutMessage?: string): SendAttemptResult {
  return {
    started: false,
    error: timeoutMessage || "请求已入队，但会话没有进入运行状态",
  }
}

export function resolvePromptStartSnapshotOutcome(input: {
  startedBySnapshot: boolean
  hasStartedAfterSnapshot: boolean
  timeoutMessage?: string
}): SendAttemptResult {
  if (input.startedBySnapshot || input.hasStartedAfterSnapshot) {
    return { started: true }
  }
  return resolvePromptStartTimeoutFailure(input.timeoutMessage)
}

export function findLatestOptimisticTurnId(source: Array<{ id?: string | null } | null | undefined>) {
  for (let index = source.length - 1; index >= 0; index--) {
    const id = source[index]?.id
    if (typeof id === "string" && id) return id
  }
  return ""
}
