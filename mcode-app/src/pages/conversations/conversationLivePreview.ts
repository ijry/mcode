import type { ContentPart, LiveMessage } from "@/types/acp"

export const CONVERSATION_LIST_LIVE_PREVIEW_LIMIT = 5

const LIVE_PREVIEW_STATUSES = new Set([
  "in_progress",
  "thinking",
  "running_tool",
  "waiting_permission",
  "waiting_question",
])

export interface ConversationLivePreviewCard {
  conversationId?: number
  displayStatus?: string | null
}

export interface ConversationLivePreviewSession {
  status?: string | null
  liveMessage?: LiveMessage | null
  pendingPermission?: unknown | null
  pendingQuestion?: unknown | null
}

export function isConversationLivePreviewStatus(status?: string | null) {
  return LIVE_PREVIEW_STATUSES.has(String(status || "").trim().toLowerCase())
}

export function selectConversationLivePreviewIds(input: {
  cards: ConversationLivePreviewCard[]
  limit?: number
}) {
  const limit = Math.max(0, Math.floor(input.limit ?? CONVERSATION_LIST_LIVE_PREVIEW_LIMIT))
  const selected: number[] = []
  const seen = new Set<number>()

  for (const card of input.cards) {
    const conversationId = Number(card.conversationId || 0)
    if (!Number.isFinite(conversationId) || conversationId <= 0) continue
    if (seen.has(conversationId)) continue
    if (!isConversationLivePreviewStatus(card.displayStatus)) continue

    seen.add(conversationId)
    selected.push(conversationId)
    if (selected.length >= limit) break
  }

  return selected
}

export function resolveConversationLivePreviewText(
  session: ConversationLivePreviewSession | null | undefined
) {
  if (!session) return ""
  if (session.pendingPermission || session.status === "waiting_permission") return "等待确认"
  if (session.pendingQuestion || session.status === "waiting_question") return "等待回答"

  const liveMessage = session.liveMessage
  const parts = liveMessage?.content || []
  const runningTool = findRunningTool(parts)
  if (runningTool) return `正在调用工具：${runningTool}`

  const text = buildTextProjection(parts)
  if (text) return text

  const thinking = buildThinkingProjection(parts)
  if (thinking) return `思考：${thinking}`

  if (liveMessage?.isPlaceholderThinking || session.status === "thinking") {
    return "思考中..."
  }

  return ""
}

function findRunningTool(parts: ContentPart[]) {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index]
    if (part.type !== "tool_call") continue
    if (part.tool_call?.status && part.tool_call.status !== "running") continue
    const name = String(part.tool_call?.name || "").trim()
    if (name) return name
  }
  return ""
}

function buildTextProjection(parts: ContentPart[]) {
  return parts
    .map((part) => (part.type === "text" ? part.text || "" : ""))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
}

function buildThinkingProjection(parts: ContentPart[]) {
  return parts
    .map((part) => (part.type === "thinking" ? part.thinking || "" : ""))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
}
