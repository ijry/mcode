import type { ContentPart } from "@/types/acp"
import type { QueuedDraft, UploadedAttachment } from "./detailDataNormalization"

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

export function buildLiveActivitySignature(parts: ContentPart[]): string {
  return JSON.stringify((parts || []).map((part) => {
    if (part.type === "text") return ["text", part.text || ""]
    if (part.type === "thinking") return ["thinking", part.thinking || ""]
    if (part.type === "tool_call") {
      const toolCall = part.tool_call
      return [
        "tool_call",
        toolCall?.id || "",
        toolCall?.name || "",
        toolCall?.status || "",
        JSON.stringify(toolCall?.input || {}),
        toolCall?.output || "",
        toolCall?.error || "",
      ]
    }
    if (part.type === "tool_result") {
      const toolResult = part.tool_result
      return [
        "tool_result",
        toolResult?.tool_call_id || "",
        toolResult?.output || "",
        toolResult?.is_error ? "1" : "0",
      ]
    }
    if (part.type === "plan") return ["plan", JSON.stringify(part.plan || {})]
    return [part.type]
  }))
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

export function buildOptimisticText(text: string, files: UploadedAttachment[]): string {
  if (files.length === 0) return text
  const filesLine = files.map((item) => item.name).join("、")
  const prefix = text.trim()
  if (!prefix) return `已附文件：${filesLine}`
  return `${prefix}\n\n已附文件：${filesLine}`
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
