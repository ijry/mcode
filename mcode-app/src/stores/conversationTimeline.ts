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
}

export function buildConversationTimeline(
  input: BuildConversationTimelineInput
): ConversationTimelineTurn[] {
  const completed = input.localTurns.map((turn, index) => ({
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
