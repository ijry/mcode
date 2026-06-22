import type { LiveMessage, MessageTurn } from "@/types/acp"

export type ConversationTimelineTurnPhase = "completed" | "optimistic" | "streaming"

export interface ConversationTimelineTurn {
  key: string
  turn: MessageTurn
  phase: ConversationTimelineTurnPhase
}

interface BuildConversationTimelineInput {
  conversationId: number
  localTurns: MessageTurn[]
  optimisticTurns: MessageTurn[]
  liveMessage: LiveMessage | null
  inFlightUserTurnId?: string | null
}

export function buildConversationTimeline(
  input: BuildConversationTimelineInput
): ConversationTimelineTurn[] {
  const visibleLocalTurns = suppressCoveredTrailingAssistantPartial(
    input.localTurns,
    input.liveMessage,
    input.inFlightUserTurnId
  )
  const completed = visibleLocalTurns.map((turn, index) => ({
    key: `completed-${input.conversationId}-${turn.id}-${index}`,
    turn,
    phase: "completed" as const,
  }))
  const optimistic = input.optimisticTurns.map((turn, index) => ({
    key: `optimistic-${input.conversationId}-${turn.id}-${index}`,
    turn,
    phase: "optimistic" as const,
  }))
  const streaming = input.liveMessage
    ? [
        {
          key: `streaming-${input.conversationId}-${buildLiveMessageTurnId(
            input.conversationId,
            input.liveMessage
          )}`,
          turn: buildLiveMessageTurn(input.conversationId, input.liveMessage),
          phase: "streaming" as const,
        },
      ]
    : []

  return dedupeEntriesByRoleAndId(
    [...completed, ...optimistic, ...streaming],
    (entry) => entry.turn
  )
}

export function buildLiveMessageTurn(
  conversationId: number,
  liveMessage: LiveMessage
): MessageTurn {
  return {
    id: buildLiveMessageTurnId(conversationId, liveMessage),
    role: "assistant",
    content: liveMessage.content,
    timestamp: liveMessage.timestamp,
    status: liveMessage.isStreaming ? "streaming" : "completed",
  }
}

export function buildLiveMessageTurnId(
  conversationId: number,
  liveMessage: Pick<LiveMessage, "id" | "timestamp">
): string {
  const normalizedLiveId = String(liveMessage.id || "").trim()
  if (normalizedLiveId) {
    return `live-${conversationId}-${normalizedLiveId}`
  }

  const normalizedTimestamp =
    typeof liveMessage.timestamp === "number" && Number.isFinite(liveMessage.timestamp)
      ? Math.trunc(liveMessage.timestamp)
      : 0
  return `live-${conversationId}-ts-${normalizedTimestamp}`
}

export function dedupeTurnsByRoleAndId(turns: MessageTurn[]): MessageTurn[] {
  return dedupeEntriesByRoleAndId(turns, (turn) => turn)
}

function suppressCoveredTrailingAssistantPartial(
  turns: MessageTurn[],
  liveMessage: LiveMessage | null,
  inFlightUserTurnId?: string | null
): MessageTurn[] {
  if (!liveMessage || liveMessage.isPlaceholderThinking) return turns

  const anchored = suppressAnchoredAssistantPartials(
    turns,
    liveMessage,
    inFlightUserTurnId
  )
  if (anchored !== turns) return anchored

  const tail = turns[turns.length - 1]
  if (!tail || tail.role !== "assistant") return turns
  if (!isContentPrefix(tail.content, liveMessage.content)) return turns
  return turns.slice(0, -1)
}

function suppressAnchoredAssistantPartials(
  turns: MessageTurn[],
  liveMessage: LiveMessage,
  inFlightUserTurnId?: string | null
) {
  const normalizedUserId = String(inFlightUserTurnId || "").trim()
  if (!normalizedUserId) return turns

  const userIndex = turns.findIndex(
    (turn) => turn.role === "user" && turn.id === normalizedUserId
  )
  if (userIndex < 0) return turns

  const nextUserIndex = turns.findIndex(
    (turn, index) => index > userIndex && turn.role === "user"
  )
  const endIndex = nextUserIndex < 0 ? turns.length : nextUserIndex
  let changed = false
  const filtered = turns.filter((turn, index) => {
    if (index <= userIndex || index >= endIndex) return true
    if (turn.role !== "assistant") return true
    const covered = isContentPrefix(turn.content, liveMessage.content)
    if (covered) changed = true
    return !covered
  })

  return changed ? filtered : turns
}

function isContentPrefix(prefixParts: MessageTurn["content"], fullParts: MessageTurn["content"]) {
  const prefix = buildContentSignature(prefixParts)
  const full = buildContentSignature(fullParts)
  if (prefix.length > 0 && full.length >= prefix.length && full.startsWith(prefix)) {
    return true
  }
  return isTextProjectionPrefix(prefixParts, fullParts)
}

function buildContentSignature(parts: MessageTurn["content"]) {
  return parts.map(buildPartSignature).filter(Boolean).join("\n")
}

function buildPartSignature(part: MessageTurn["content"][number]) {
  if (part.type === "text") return `text:${part.text || ""}`
  if (part.type === "thinking") return `thinking:${part.thinking || ""}`
  if (part.type === "tool_call") {
    return `tool_call:${stableStringify({
      id: part.tool_call?.id,
      name: part.tool_call?.name,
      input: part.tool_call?.input,
      status: part.tool_call?.status,
      output: part.tool_call?.output,
      error: part.tool_call?.error,
    })}`
  }
  if (part.type === "tool_result") {
    return `tool_result:${stableStringify(part.tool_result || {})}`
  }
  if (part.type === "image") return `image:${part.image?.url || ""}`
  if (part.type === "plan") return `plan:${stableStringify(part.plan || {})}`
  return ""
}

function isTextProjectionPrefix(
  prefixParts: MessageTurn["content"],
  fullParts: MessageTurn["content"]
) {
  if (prefixParts.length === 0) return false
  if (!prefixParts.every(isTextualContentPart)) return false
  const prefixText = buildTextProjection(prefixParts)
  const fullText = buildTextProjection(fullParts)
  return (
    prefixText.length > 0 &&
    fullText.length >= prefixText.length &&
    fullText.startsWith(prefixText)
  )
}

function isTextualContentPart(part: MessageTurn["content"][number]) {
  return part.type === "text" || part.type === "thinking"
}

function buildTextProjection(parts: MessageTurn["content"]) {
  return parts
    .map((part) => {
      if (part.type === "text") return part.text || ""
      if (part.type === "thinking") return part.thinking || ""
      return ""
    })
    .join("")
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? ""
}

function dedupeEntriesByRoleAndId<T>(
  entries: T[],
  getTurn: (entry: T) => MessageTurn
): T[] {
  const retainedIndexByKey = new Map<string, number>()

  entries.forEach((entry, index) => {
    const turn = getTurn(entry)
    const retainKey = JSON.stringify([turn.role, turn.id])
    const existing = retainedIndexByKey.get(retainKey)
    if (existing === undefined || turn.role !== "user") {
      retainedIndexByKey.set(retainKey, index)
    }
  })

  if (retainedIndexByKey.size === entries.length) {
    return entries
  }

  return entries.filter((entry, index) => {
    const turn = getTurn(entry)
    return retainedIndexByKey.get(JSON.stringify([turn.role, turn.id])) === index
  })
}
