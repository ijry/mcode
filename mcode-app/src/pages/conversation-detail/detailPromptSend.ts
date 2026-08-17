import type { PromptInputBlock } from "@/types/acp"
import type { ConnectionTargetAgent } from "@/services/connectionSchema"
import type { QueuedDraft } from "./detailDataNormalization"
import { buildDraftPromptBlocks } from "./detailDraftQueue"

export interface DraftSendPayload {
  blocks: PromptInputBlock[]
}

export interface SendAttemptResult {
  started: boolean
  error?: string
}

export interface PromptConnectionRecoveryResult<T> {
  connectionId: string
  response: T
  recovered: boolean
}

export interface PromptStartWatchSessionLike {
  status?: string
  liveMessage?: {
    content?: unknown
  } | null
}

export function buildDraftSendPayload(
  draft: QueuedDraft,
  options: { targetAgent?: ConnectionTargetAgent | null } = {}
): DraftSendPayload {
  return {
    blocks: buildDraftPromptBlocks(draft, options),
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

export function isConnectionNotFoundError(message: string) {
  return /connection\s+not\s+found/i.test(message)
}

export async function sendPromptWithConnectionRecovery<T>(input: {
  connectionId: string
  send: (connectionId: string) => Promise<T>
  reconnect: (staleConnectionId: string) => Promise<string>
}): Promise<PromptConnectionRecoveryResult<T>> {
  try {
    return {
      connectionId: input.connectionId,
      response: await input.send(input.connectionId),
      recovered: false,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "")
    if (!isConnectionNotFoundError(message)) throw error
  }

  const connectionId = await input.reconnect(input.connectionId)
  if (!connectionId) throw new Error("重新连接代理失败")
  return {
    connectionId,
    response: await input.send(connectionId),
    recovered: true,
  }
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
