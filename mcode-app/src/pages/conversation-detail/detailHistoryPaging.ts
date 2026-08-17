import type {
  ConversationHistoryWindow,
  ConversationTurnsPage,
  MessageTurn,
} from "@/types/acp"

export const DEFAULT_CONVERSATION_HISTORY_PAGE_SIZE = 30

const PAGING_UPGRADE_MESSAGE =
  "当前 CodeG 服务端不支持会话历史分页，请升级 CodeG 后重试。"

function invalidPagingMetadata(): Error {
  return new Error(PAGING_UPGRADE_MESSAGE)
}

function readNonNegativeInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim())
    return Number.isSafeInteger(parsed) ? parsed : null
  }
  return null
}

function readRequiredHash(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function readOptionalTimestamp(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? undefined : parsed
  }
  return undefined
}

function parseWindow(raw: any): ConversationHistoryWindow {
  const turnsOffset = readNonNegativeInteger(raw?.turns_offset)
  const turnsTotal = readNonNegativeInteger(raw?.turns_total)
  const assistantTurnsBeforeOffset = readNonNegativeInteger(
    raw?.assistant_turns_before_offset,
  )
  const prefixHash = readRequiredHash(raw?.prefix_hash)
  if (
    turnsOffset == null ||
    turnsTotal == null ||
    assistantTurnsBeforeOffset == null ||
    prefixHash == null ||
    turnsOffset > turnsTotal ||
    assistantTurnsBeforeOffset > turnsOffset
  ) {
    throw invalidPagingMetadata()
  }

  const timestamp = readOptionalTimestamp(
    raw?.uncovered_prefix_max_ts ?? raw?.uncoveredPrefixMaxTimestamp,
  )
  const hasTimestamp =
    Object.prototype.hasOwnProperty.call(raw ?? {}, "uncovered_prefix_max_ts") ||
    Object.prototype.hasOwnProperty.call(raw ?? {}, "uncoveredPrefixMaxTimestamp")
  if (hasTimestamp && timestamp === undefined) throw invalidPagingMetadata()

  return {
    turns_offset: turnsOffset,
    turns_total: turnsTotal,
    assistant_turns_before_offset: assistantTurnsBeforeOffset,
    prefix_hash: prefixHash,
    ...(timestamp !== undefined ? { uncovered_prefix_max_ts: timestamp } : {}),
  }
}

export function requireConversationHistoryWindow(raw: unknown): ConversationHistoryWindow {
  return parseWindow(raw)
}

export function requireConversationTurnsPage(raw: unknown): ConversationTurnsPage {
  const window = parseWindow(raw)
  const prefixHashBeforeIndex = readRequiredHash((raw as any)?.prefix_hash_before_index)
  const turns = (raw as any)?.turns
  if (prefixHashBeforeIndex == null || !Array.isArray(turns)) {
    throw invalidPagingMetadata()
  }
  return {
    ...window,
    turns,
    prefix_hash_before_index: prefixHashBeforeIndex,
  }
}

export function buildTailHistoryRequest(conversationId: number) {
  return {
    conversationId,
    tailTurns: DEFAULT_CONVERSATION_HISTORY_PAGE_SIZE,
  }
}

export function buildOlderHistoryRequest(conversationId: number, beforeIndex: number) {
  return {
    conversationId,
    beforeIndex,
    limit: DEFAULT_CONVERSATION_HISTORY_PAGE_SIZE,
  }
}

export function hasOlderConversationHistory(window: ConversationHistoryWindow | null | undefined) {
  return Boolean(window && window.turns_offset > 0)
}

export function canApplyOlderHistoryPage(
  current: ConversationHistoryWindow,
  page: ConversationTurnsPage,
) {
  return (
    page.prefix_hash_before_index === current.prefix_hash &&
    page.turns_offset < current.turns_offset &&
    page.turns_offset + page.turns.length === current.turns_offset &&
    // The already loaded tail cannot disappear underneath a page response.
    // A larger total is allowed because a newer turn may arrive concurrently.
    page.turns_total >= current.turns_total
  )
}

export function advanceConversationHistoryWindow(
  current: ConversationHistoryWindow,
  page: ConversationTurnsPage,
): ConversationHistoryWindow {
  return {
    turns_offset: page.turns_offset,
    // A newer turn may arrive between page requests. Preserve the total that
    // describes the currently loaded tail instead of moving its boundary.
    turns_total: current.turns_total,
    assistant_turns_before_offset: page.assistant_turns_before_offset,
    prefix_hash: page.prefix_hash,
    ...(page.uncovered_prefix_max_ts !== undefined
      ? { uncovered_prefix_max_ts: page.uncovered_prefix_max_ts }
      : {}),
  }
}

function turnId(turn: MessageTurn): string {
  return typeof turn?.id === "string" ? turn.id.trim() : ""
}

export function prependHistoryPageTurns(
  currentTurns: MessageTurn[],
  olderTurns: MessageTurn[],
): MessageTurn[] {
  const result: MessageTurn[] = []
  const seen = new Set<string>()
  for (const turn of [...olderTurns, ...currentTurns]) {
    const id = turnId(turn)
    if (id && seen.has(id)) continue
    if (id) seen.add(id)
    result.push(turn)
  }
  return result
}
