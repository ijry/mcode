import type { LiveMessage, MessageTurn } from "@/types/acp"

export type ConversationTimelineTurnPhase = "completed" | "streaming"

export interface ConversationTimelineTurn {
  key: string
  turn: MessageTurn
  phase: ConversationTimelineTurnPhase
}

interface BuildConversationTimelineInput {
  conversationId: number
  localTurns: MessageTurn[]
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
    [...completed, ...streaming],
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

  return suppressLiveOwnedTrailingAssistantRun(turns, liveMessage)
}

// live_message 是「整轮累加器」：codeg-plus 只在 TurnComplete 时把它清空，期间所有
// 文本段与 tool_call 都往同一条上追加；而解析器落盘时会在每条 assistant 记录处断开，
// 把同一条逻辑回复拆成 **多条连续 assistant 轮次**。于是「已落盘的前半段」会同时出现在
// localTurns 和实时气泡里 —— 这就是用户看到的从中途开始的重复。
//
// 服务端在有 ≥2 条尾随 assistant 轮次时会把 in_flight_user_turn_id 返回 None
// （conversations.rs 的 does_not_stamp_with_two_trailing_assistant_turns），正好是多段
// 场景，所以不能依赖它来定位当前轮次。这里改为直接看尾部这一串 assistant 轮次，
// 取「拼起来仍是 live 内容前缀」的最长**后缀**抹掉。
// 只抹后缀（而不是整串）是因为这串里可能混着上一轮的回答：外部客户端发来的新用户
// 轮次可能还没落盘（见 maybeBackfillExternalUserTurn），此时上一轮的 assistant 轮次
// 会紧贴在本轮前面。前缀校验保证它不会被误删。
const MAX_LIVE_OWNED_TRAILING_ASSISTANT_TURNS = 32

function suppressLiveOwnedTrailingAssistantRun(
  turns: MessageTurn[],
  liveMessage: LiveMessage
): MessageTurn[] {
  const runLength = trailingAssistantRunLength(turns)
  if (runLength <= 0) return turns

  const coveredCount = countCoveredTrailingAssistantTurns(
    turns,
    runLength,
    liveMessage
  )
  if (coveredCount <= 0) return turns

  return turns.slice(0, turns.length - coveredCount)
}

function trailingAssistantRunLength(turns: MessageTurn[]): number {
  let length = 0
  while (
    length < turns.length &&
    turns[turns.length - 1 - length]?.role === "assistant"
  ) {
    length += 1
  }
  return length
}

function countCoveredTrailingAssistantTurns(
  turns: MessageTurn[],
  runLength: number,
  liveMessage: LiveMessage
): number {
  const maxCount = Math.min(runLength, MAX_LIVE_OWNED_TRAILING_ASSISTANT_TURNS)
  // 从最长的后缀往回试：命中的段数越多，说明这一整串确实属于当前 live 轮次。
  for (let count = maxCount; count >= 1; count -= 1) {
    const combined = turns
      .slice(turns.length - count)
      .flatMap((turn) => turn.content || [])
    if (isContentPrefix(combined, liveMessage.content)) return count
  }
  return 0
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
  if (isSignaturePrefix(prefixParts, fullParts, buildPartSignature)) return true
  // 同一个 tool_call 在「已落盘轮次」和「实时累加器」里的 status/output/input 常常不一致：
  // 落盘的是 JSONL 里 tool_use 记录的初始态，实时的是 active_tool_calls 的当前态
  // （codeg-plus session_state.rs 的 push_tool_call_ref_if_absent 只追加引用，
  // 快照时才解析成实体）。所以退一步只按 id+name 认这次调用。
  if (isSignaturePrefix(prefixParts, fullParts, buildStablePartSignature)) return true
  return isTextProjectionPrefix(prefixParts, fullParts)
}

function isSignaturePrefix(
  prefixParts: MessageTurn["content"],
  fullParts: MessageTurn["content"],
  toSignature: (part: MessageTurn["content"][number]) => string
) {
  const prefix = buildContentSignature(prefixParts, toSignature)
  const full = buildContentSignature(fullParts, toSignature)
  return prefix.length > 0 && full.length >= prefix.length && full.startsWith(prefix)
}

function buildContentSignature(
  parts: MessageTurn["content"],
  toSignature: (part: MessageTurn["content"][number]) => string = buildPartSignature
) {
  return parts.map(toSignature).filter(Boolean).join("\n")
}

function buildStablePartSignature(part: MessageTurn["content"][number]) {
  if (part.type === "tool_call") {
    return `tool_call:${stableStringify({
      id: part.tool_call?.id,
      name: part.tool_call?.name,
    })}`
  }
  return buildPartSignature(part)
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
  // dedupeKey → 最终保留的 [role, id] 键。把「同一条逻辑轮次的不同来源 id」折叠到
  // 先出现的那一个身份上，避免本地缓存 id 与服务端 id 各占一行。
  const identityByDedupeKey = new Map<string, string>()

  const resolveRetainKey = (turn: MessageTurn) => {
    const ownKey = JSON.stringify([turn.role, turn.id])
    const dedupeKey = normalizeDedupeKey(turn)
    if (!dedupeKey) return ownKey

    const groupKey = JSON.stringify([turn.role, dedupeKey])
    const existing = identityByDedupeKey.get(groupKey)
    if (existing !== undefined) return existing
    identityByDedupeKey.set(groupKey, ownKey)
    return ownKey
  }

  const retainKeys = entries.map((entry) => resolveRetainKey(getTurn(entry)))

  entries.forEach((entry, index) => {
    const turn = getTurn(entry)
    const retainKey = retainKeys[index]
    const existing = retainedIndexByKey.get(retainKey)
    if (existing === undefined || turn.role !== "user") {
      retainedIndexByKey.set(retainKey, index)
    }
  })

  if (retainedIndexByKey.size === entries.length) {
    return entries
  }

  return entries.filter(
    (_entry, index) => retainedIndexByKey.get(retainKeys[index]) === index
  )
}

function normalizeDedupeKey(turn: MessageTurn): string {
  return typeof turn.dedupeKey === "string" ? turn.dedupeKey.trim() : ""
}
