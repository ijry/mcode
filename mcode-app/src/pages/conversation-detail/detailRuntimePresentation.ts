import type { LiveMessage, MessageTurn } from "@/types/acp"
import type { QueuedDraft } from "./detailDataNormalization"

export interface TimelineTailSignatureInput {
  localTurns: Array<Pick<MessageTurn, "id" | "role" | "status">>
  liveMessage: Pick<LiveMessage, "id" | "content"> | null | undefined
}

/**
 * 「时间线尾项变了没有」的**常数长度**签名，`role` 编在第一段。
 *
 * 详情页外壳与 pane 各有一个 watch 想知道这件事，原先两边的 getter 都长这样：
 *
 * ```ts
 * () => renderMessageItems.value.map((item) => ({
 *   id: item.anchorId, role: ..., status: ...,
 *   content: JSON.stringify(item.message.content || []),   // ← 每一条消息全量序列化
 * }))
 * ```
 *
 * 两层放大：一是把**整个会话**每条消息的 content 都序列化了一遍（回调其实只用尾项），
 * 二是 getter 返回新数组、`hasChanged` 恒为真，于是回调每个 flush 必然执行一次。
 *
 * 这里改成从 store 的廉价字段直接拼，不做任何投影、不碰历史消息：
 *
 * - 有 live 时尾项就是那条实时气泡（合并后 role 必为 assistant），内容变化用
 *   「part 数 + 尾 part 类型 + 尾部文本长度 + 尾 tool_call 的 id/status/输出长度」代表；
 * - 没有 live 时尾项是最后一条已落盘轮次，而已完成轮次不会再变，`id + status` 足够。
 *
 * 返回字符串（而不是对象/数组）是关键：Vue 的 `hasChanged` 才能在真的没变时短路，
 * 让回调不再每 flush 都跑。
 */
export function buildTimelineTailSignature(input: TimelineTailSignatureInput): string {
  const live = input.liveMessage
  if (live) {
    const parts = live.content || []
    const tail = parts[parts.length - 1]
    const toolCall = tail?.type === "tool_call" ? tail.tool_call : null
    return [
      "assistant",
      live.id || "",
      parts.length,
      tail?.type || "",
      (tail?.text || tail?.thinking || "").length,
      toolCall?.id || "",
      toolCall?.status || "",
      (toolCall?.output || "").length,
    ].join("|")
  }

  const turns = input.localTurns || []
  const tailTurn = turns[turns.length - 1]
  if (!tailTurn) return ""
  return [tailTurn.role || "", tailTurn.id || "", turns.length, tailTurn.status || ""].join("|")
}

/** 尾项是不是 assistant —— 与 `buildTimelineTailSignature` 的编码约定配套。 */
export function isAssistantTailSignature(signature: string): boolean {
  return signature.startsWith("assistant|")
}

export function formatTokenCountK(value: number) {
  const normalized = Number(value || 0)
  if (!Number.isFinite(normalized) || normalized <= 0) return "0"
  if (normalized < 1000) return "<1K"
  const kiloValue = normalized / 1000
  if (kiloValue >= 100) return `${Math.round(kiloValue)}K`
  if (kiloValue >= 10) return `${kiloValue.toFixed(1).replace(/\.0$/, "")}K`
  return `${kiloValue.toFixed(2).replace(/\.?0+$/, "")}K`
}

export function isStoppableRuntimeStatus(status: string) {
  return (
    status === "thinking" ||
    status === "running_tool" ||
    status === "waiting_permission" ||
    status === "waiting_question"
  )
}

export function draftSummary(item: QueuedDraft): string {
  const text = item.text.trim()
  if (text) {
    if (item.attachments.length > 0) {
      return `${text}（${item.attachments.length} 个附件）`
    }
    return text
  }
  return `附件消息（${item.attachments.length} 个）`
}

export function queueStatusText(status: QueuedDraft["status"]): string {
  if (status === "sending") return "发送中"
  if (status === "failed") return "失败"
  return "待发送"
}

export interface SharedPromptQueueViewItem {
  queueItemId?: string | null
  sessionId?: string | null
  queuePosition?: number | null
  priorityTier?: string | null
  sourceClientId?: string | null
  sourceDeviceName?: string | null
  promptPreview?: string | null
  createdAtMs?: number | null
}

export interface SharedPromptQueueViewState {
  count?: number | null
  items?: SharedPromptQueueViewItem[] | null
}

export function hasSharedPromptQueue(
  queue: SharedPromptQueueViewState | null | undefined
) {
  return Number(queue?.count || 0) > 0 || Number(queue?.items?.length || 0) > 0
}

export function sharedPromptQueueTitle(
  queue: SharedPromptQueueViewState | null | undefined
) {
  const count = Math.max(0, Math.trunc(Number(queue?.count || queue?.items?.length || 0)))
  return `Desktop 队列 ${count}`
}

export function sharedPromptQueueSummary(
  queue: SharedPromptQueueViewState | null | undefined
) {
  const first = queue?.items?.[0]
  const preview = String(first?.promptPreview || "").trim()
  return preview || "等待当前任务完成后执行"
}

export function sharedPromptQueueItemPreview(
  item: SharedPromptQueueViewItem | null | undefined
) {
  const preview = String(item?.promptPreview || "").trim()
  return preview || "队列任务"
}

export function sharedPromptQueueItemSource(
  item: SharedPromptQueueViewItem | null | undefined,
  localClientId?: string | null
) {
  const sourceClientId = String(item?.sourceClientId || "").trim()
  const normalizedLocalClientId = String(localClientId || "").trim()
  if (sourceClientId && normalizedLocalClientId && sourceClientId === normalizedLocalClientId) {
    return "当前设备"
  }
  const deviceName = String(item?.sourceDeviceName || "").trim()
  return deviceName || "其他设备"
}

export function sharedPromptQueuePositionLabel(
  item: SharedPromptQueueViewItem | null | undefined,
  fallbackIndex = 0
) {
  const position = Number(item?.queuePosition)
  if (Number.isFinite(position) && position > 0) {
    return `#${Math.trunc(position)}`
  }
  return `#${Math.max(1, Math.trunc(fallbackIndex) + 1)}`
}

export function sharedPromptQueuePriorityLabel(
  item: SharedPromptQueueViewItem | null | undefined
) {
  const priority = String(item?.priorityTier || "").trim().toLowerCase()
  if (priority === "high") return "高优先级"
  if (priority === "low") return "低优先级"
  return "普通"
}

export function canEditSharedPromptQueue(
  queue: SharedPromptQueueViewState | null | undefined,
  capabilities: string[] | null | undefined
) {
  if (!hasSharedPromptQueue(queue)) return false
  const enabledCapabilities = new Set((capabilities || []).map((item) => String(item || "").trim()))
  return enabledCapabilities.has("desktop.queue.reorder") || enabledCapabilities.has("desktop.queue.priority")
}

export function isSharedPromptQueueCancelDisabled(
  queueItemId: string | null | undefined,
  cancellingIds: Set<string> | string[]
) {
  const normalized = String(queueItemId || "").trim()
  if (!normalized) return true
  if (Array.isArray(cancellingIds)) return cancellingIds.includes(normalized)
  return cancellingIds.has(normalized)
}

export function isSharedPromptQueueClearDisabled(
  queue: SharedPromptQueueViewState | null | undefined,
  connectionId: string | null | undefined,
  clearing: boolean
) {
  if (clearing) return true
  if (!String(connectionId || "").trim()) return true
  return !hasSharedPromptQueue(queue)
}

export function formatQueueTime(ts: number): string {
  const date = new Date(ts)
  const hh = String(date.getHours()).padStart(2, "0")
  const mm = String(date.getMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}


export function looksLikeNetworkFailure(message: string) {
  const text = message.toLowerCase()
  return [
    "network",
    "timeout",
    "timed out",
    "connect",
    "connection",
    "socket",
    "websocket",
    "fetch",
    "request",
    "econn",
    "unreachable",
    "refused",
    "断开",
    "连接",
    "超时",
    "网络",
    "不可达",
    "重试",
  ].some((keyword) => text.includes(keyword))
}
