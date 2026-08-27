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

/**
 * 运行中点发送时该走哪条路。
 *
 * 三个取值：
 * - `send`：没有回合在跑，正常发送。
 * - `steer_sheet`：弹面板，让用户选「插入当前回合」。
 * - `blocked`：拦下来，保留草稿并提示等回合结束。
 *
 * `nativeSteeringAvailable` 是**后端合成**的权威判据（codeg-plus
 * `session_state.rs:1673` 的 `native_steering_available`），已经包含三道闸：
 * adapter 声明 `_meta.steering.supported`、registry 认为该 agent honors
 * `promptRequired` opt-in、以及**运行中的适配器版本**达标（claude-agent-acp
 * ≥ 0.65.0）。**不要在前端用 agentType 重新推导** —— codex 也声明 steering，但
 * 缺少 idle 约定会把当前回合变成 detached turn，服务端因此明确不给它开。
 *
 * 有附件时即使 native 也退回 `blocked`：steering 是 text-only（`connection.rs:2577`
 * 的 params 只有一个 text block），给一个会静默丢掉附件的按钮比不给更糟。
 */
export function resolveRunningSendAction(input: {
  isBusy: boolean
  nativeSteeringAvailable: boolean
  hasAttachments: boolean
}): "send" | "steer_sheet" | "blocked" {
  if (!input.isBusy) return "send"
  if (!input.nativeSteeringAvailable) return "blocked"
  if (input.hasAttachments) return "blocked"
  return "steer_sheet"
}

// codeg-plus `AcpError::TurnInProgress` 的 Display 串前缀（`acp/error.rs:20`）。
// 取子串而不是整串，这样服务端以后把文案写长也还认得出来。
const TURN_IN_PROGRESS_MARKER = "turn already in progress"

// 两个后端各自的稳定错误码：codeg-plus 走 `AppErrorCode::TurnInProgress`
// （`app_error.rs:92`，HTTP 409），mcode-desktop 走 `turn_busy`
// （`runtime/mod.rs:1760` 的 turn_busy_error）。语义相同，名字不同。
const TURN_BUSY_CODES = new Set(["turn_in_progress", "turn_busy"])

/**
 * 后端是否因为「当前连接已有回合在跑」拒绝了这次发送。
 *
 * 这个判断是**必需的兜底**，不是冗余：前端的 `runtimeStatus` 来自推送事件，断线
 * 期间会滞后，所以「本地以为空闲、服务端正在跑」的窗口一直存在。命中时调用方要把
 * 草稿回填给用户，而不是让它蒸发。
 *
 * 覆盖两种后端 × 三种载荷形状：裸字符串、带 `message` 的对象/Error、带 `code` 的
 * 结构化 body。desktop 的错误码藏在 message 里的一段 JSON 串
 * （`anyhow!("{}", json!({...}))`），所以字符串路径也要认 `"code":"turn_busy"`。
 */
export function isTurnInProgressRejection(error: unknown): boolean {
  if (typeof error === "string") return matchesTurnBusyText(error)
  if (!error || typeof error !== "object") return false

  const record = error as { code?: unknown; message?: unknown }
  if (typeof record.code === "string" && TURN_BUSY_CODES.has(record.code.trim())) {
    return true
  }
  return typeof record.message === "string" && matchesTurnBusyText(record.message)
}

function matchesTurnBusyText(text: string) {
  const normalized = text.toLowerCase()
  if (normalized.includes(TURN_IN_PROGRESS_MARKER)) return true
  // desktop 把结构化错误塞进 message 的 JSON 串里，逐个码匹配 `"code":"<x>"`，
  // 而不是裸搜码名 —— 后者会把「另一个字段的值恰好等于 turn_busy」也算进来。
  return Array.from(TURN_BUSY_CODES).some((code) =>
    normalized.includes(`"code":"${code}"`)
  )
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
