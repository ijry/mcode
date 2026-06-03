import type { ContentPart, MessageTurn } from "@/types/acp"
import { ensureConversationSchema } from "@/services/db/migrations"
import {
  getConversationSummaryById,
  insertCompletedTurns,
  upsertConversationSummary,
  type ConversationSummaryRecord,
  type PersistedTurnRecord,
} from "@/services/db/repositories/conversationRepository"

interface PersistConversationDetailInput {
  instanceKey: string
  conversationId: number
  detail: any
  fallbackFolderId?: number
  fallbackConnectionId?: string | null
  persistTurns?: boolean
}

export interface PersistConversationDetailResult {
  persistedTurnCount: number
  summary: ConversationSummaryRecord | null
}

interface NormalizedTurn extends MessageTurn {
  seq?: number | null
}

interface BuildPersistedTurnInput {
  turn: Pick<MessageTurn, "id" | "role" | "content" | "timestamp" | "status">
  conversationId: number
  instanceKey: string
  seq?: number | null
  dedupeId?: string | null
}

export async function persistConversationDetailSnapshot(
  input: PersistConversationDetailInput
): Promise<PersistConversationDetailResult> {
  await ensureConversationSchema()

  const currentSummary = input.instanceKey
    ? await getConversationSummaryById(input.instanceKey, input.conversationId)
    : null
  const normalizedTurns = normalizeTurns(input.detail?.turns)
  const summary = buildSummaryRecord(input, currentSummary, normalizedTurns)

  if (summary) {
    await upsertConversationSummary(summary)
  }

  if (input.persistTurns !== false) {
    await insertCompletedTurns(
      normalizedTurns.map((turn) =>
        buildPersistedTurnRecord({
          turn,
          conversationId: input.conversationId,
          instanceKey: input.instanceKey,
          seq: turn.seq ?? turn.timestamp,
          dedupeId: turn.id,
        })
      )
    )
  }

  return {
    persistedTurnCount: input.persistTurns === false ? 0 : normalizedTurns.length,
    summary,
  }
}

function buildSummaryRecord(
  input: PersistConversationDetailInput,
  currentSummary: ConversationSummaryRecord | null,
  turns: NormalizedTurn[]
): ConversationSummaryRecord | null {
  if (!input.instanceKey) return null

  const rawDetail = input.detail && typeof input.detail === "object" ? input.detail : {}
  const summary = rawDetail.summary && typeof rawDetail.summary === "object" ? rawDetail.summary : {}
  const newestTurn = turns.reduce<NormalizedTurn | null>((latest, turn) => {
    if (!latest) return turn
    return turn.timestamp >= latest.timestamp ? turn : latest
  }, null)
  const lastMessageAt =
    newestTurn?.timestamp ??
    parseTimestamp(rawDetail.updatedAt, rawDetail.updated_at, summary.updated_at) ??
    currentSummary?.lastMessageAt ??
    Date.now()

  return {
    id: input.conversationId,
    instanceKey: input.instanceKey,
    folderId:
      firstNumber(
        rawDetail.folderId,
        rawDetail.folder_id,
        summary.folderId,
        summary.folder_id,
        currentSummary?.folderId,
        input.fallbackFolderId
      ) ?? 0,
    title:
      firstString(
        rawDetail.title,
        rawDetail.conversationTitle,
        summary.title,
        currentSummary?.title
      ) || `会话 #${input.conversationId}`,
    agentType:
      normalizeAgentType(
        firstString(
          rawDetail.agentType,
          rawDetail.agent_type,
          summary.agentType,
          summary.agent_type,
          currentSummary?.agentType
        ) || "claude_code"
      ),
    externalId:
      firstString(
        rawDetail.sessionId,
        rawDetail.session_id,
        summary.externalId,
        summary.external_id,
        currentSummary?.externalId
      ) || null,
    connectionId:
      firstString(
        input.fallbackConnectionId,
        rawDetail.connectionId,
        rawDetail.connection_id,
        summary.connectionId,
        summary.connection_id,
        currentSummary?.connectionId
      ) || null,
    status:
      firstString(rawDetail.status, summary.status, currentSummary?.status) || "idle",
    lastTurnId: newestTurn?.id || currentSummary?.lastTurnId || null,
    lastMessageAt,
    unreadCount: currentSummary?.unreadCount ?? 0,
    isPinned: currentSummary?.isPinned ?? false,
    deletedAt: currentSummary?.deletedAt ?? null,
    updatedAt:
      parseTimestamp(rawDetail.updatedAt, rawDetail.updated_at, summary.updated_at) ??
      lastMessageAt,
  }
}

export function buildPersistedTurnRecord(
  input: BuildPersistedTurnInput
): PersistedTurnRecord {
  const turn = input.turn
  const dedupeKey = buildTurnDedupeKey({
    turnId: input.dedupeId || turn.id,
    role: turn.role,
    content: turn.content,
    timestamp: turn.timestamp,
  })
  const persistedTurnId = buildPersistedTurnStorageId(
    input.instanceKey,
    input.conversationId,
    dedupeKey
  )
  return {
    id: persistedTurnId,
    conversationId: input.conversationId,
    instanceKey: input.instanceKey,
    dedupeKey,
    role: turn.role,
    createdAt: turn.timestamp,
    seq: input.seq ?? turn.timestamp,
    status: turn.status ?? "completed",
    version: 1,
    parts: turn.content.map((part, index) => ({
      id: `${persistedTurnId}:${index}`,
      partIndex: index,
      type: part.type,
      payloadJson: JSON.stringify(toPersistedPartPayload(part)),
      updatedAt: turn.timestamp,
    })),
  }
}

export function buildTurnDedupeKey(input: {
  turnId?: string | null
  role: string
  content: ContentPart[]
  timestamp: number
}) {
  const turnId = firstString(input.turnId)
  if (turnId) {
    if (turnId.startsWith("turn-") || turnId.startsWith("optimistic-")) {
      return buildFallbackTurnFingerprint(input.role, input.content, input.timestamp)
    }
    return `remote:${turnId}`
  }
  return buildFallbackTurnFingerprint(input.role, input.content, input.timestamp)
}

function buildFallbackTurnFingerprint(
  role: string,
  content: ContentPart[],
  timestamp: number
) {
  const contentHash = stableHashString(stableSerializeContent(content))
  const timeBucket = Math.floor(Number(timestamp || 0) / 1000)
  return `fp:${role}:${contentHash}:${timeBucket}`
}

function buildPersistedTurnStorageId(
  instanceKey: string,
  conversationId: number,
  dedupeKey: string
) {
  return `turn:${stableHashString(`${instanceKey}:${conversationId}:${dedupeKey}`)}`
}

function toPersistedPartPayload(part: ContentPart): Record<string, any> {
  if (part.type === "text") return { text: part.text || "" }
  if (part.type === "thinking") return { thinking: part.thinking || "" }
  if (part.type === "tool_call") return { tool_call: part.tool_call || {} }
  if (part.type === "tool_result") return { tool_result: part.tool_result || {} }
  if (part.type === "image") return { image: part.image || {} }
  if (part.type === "plan") return { plan: part.plan || {} }
  return { ...part }
}

function normalizeTurns(rawTurns: unknown): NormalizedTurn[] {
  if (!Array.isArray(rawTurns)) return []
  return rawTurns
    .map((raw, index) => normalizeTurn(raw, index))
    .filter(Boolean) as NormalizedTurn[]
}

function normalizeTurn(raw: any, index: number): NormalizedTurn | null {
  if (!raw || typeof raw !== "object") return null
  const rawRole = String(raw.role || "").toLowerCase()
  const role = rawRole === "user" ? "user" : "assistant"
  const content = normalizeContentParts(raw.content, raw.blocks)
  const id = firstString(raw.id) || `turn-${index}-${Date.now()}`
  const timestamp =
    parseTimestamp(raw.timestamp, raw.createdAt, raw.created_at) ?? Date.now()

  return {
    id,
    role,
    content,
    timestamp,
    status: raw.status,
    error: firstString(raw.error) || undefined,
    seq: firstNumber(raw.seq, raw.sequence, raw.index) ?? timestamp,
  }
}

function normalizeContentParts(rawContent: unknown, rawBlocks?: unknown): ContentPart[] {
  if (Array.isArray(rawBlocks) && rawBlocks.length > 0) {
    const parts = normalizeBlocks(rawBlocks)
    if (parts.length > 0) return parts
  }

  if (Array.isArray(rawContent)) {
    const hasCodegToolBlocks = rawContent.some((part: any) => {
      const type = firstString(part?.type)
      return type === "tool_use" || type === "tool_result"
    })
    if (hasCodegToolBlocks) {
      const parts = normalizeBlocks(rawContent)
      if (parts.length > 0) return parts
    }
    return rawContent
      .map((part) => normalizeContentPart(part))
      .filter(Boolean) as ContentPart[]
  }

  const text = firstString(rawContent)
  if (text) return [{ type: "text", text }]
  return []
}

function normalizeContentPart(raw: any): ContentPart | null {
  if (!raw || typeof raw !== "object") {
    const text = firstString(raw)
    return text ? { type: "text", text } : null
  }

  const type = firstString(raw.type)
  if (type === "text") return { type: "text", text: firstString(raw.text) || "" }
  if (type === "thinking") {
    return { type: "thinking", thinking: firstString(raw.thinking, raw.text) || "" }
  }
  if (type === "tool_call" && raw.tool_call && typeof raw.tool_call === "object") {
    return {
      type: "tool_call",
      tool_call: {
        id: firstString(raw.tool_call.id) || `tool-${Date.now()}`,
        name: firstString(raw.tool_call.name) || "unknown",
        input:
          raw.tool_call.input && typeof raw.tool_call.input === "object"
            ? raw.tool_call.input
            : {},
        status: raw.tool_call.status,
        output: firstString(raw.tool_call.output) || undefined,
        error: firstString(raw.tool_call.error) || undefined,
      },
    }
  }
  if (type === "image" && raw.image && typeof raw.image === "object") {
    return {
      type: "image",
      image: {
        url: firstString(raw.image.url) || "",
        alt: firstString(raw.image.alt) || undefined,
      },
    }
  }
  if (type === "plan" && raw.plan && typeof raw.plan === "object") {
    const steps = Array.isArray(raw.plan.steps) ? raw.plan.steps : []
    return {
      type: "plan",
      plan: {
        steps: steps
          .map((step: any) => ({
            description: firstString(step?.description, step?.title, step?.content) || "",
            completed: Boolean(step?.completed),
          }))
          .filter((step: any) => step.description),
        status: raw.plan.status,
      },
    }
  }

  const text = firstString(raw.text, raw.content, raw.description)
  return text ? { type: "text", text } : null
}

function normalizeBlocks(rawBlocks: unknown[]): ContentPart[] {
  const parts: ContentPart[] = []
  const consumedResultIndexes = new Set<number>()

  for (let index = 0; index < rawBlocks.length; index++) {
    if (consumedResultIndexes.has(index)) continue
    const block = rawBlocks[index] as any
    if (!block || typeof block !== "object") continue
    const type = firstString(block.type)
    if (type === "text") {
      parts.push({ type: "text", text: firstString(block.text) || "" })
      continue
    }
    if (type === "thinking") {
      parts.push({ type: "thinking", thinking: firstString(block.text) || "" })
      continue
    }
    if (type === "image") {
      const uri = firstString(block.uri)
      const data = firstString(block.data)
      const mime = firstString(block.mime_type) || "image/png"
      parts.push({
        type: "image",
        image: {
          url: uri || (data ? `data:${mime};base64,${data}` : ""),
          alt: "image",
        },
      })
      continue
    }
    if (type === "tool_use") {
      const toolUseId = firstString(block.tool_use_id)
      const inputPreview = firstString(block.input_preview)
      const nextBlock = rawBlocks[index + 1] as any
      const canPairByPosition =
        !toolUseId &&
        nextBlock &&
        typeof nextBlock === "object" &&
        firstString(nextBlock.type) === "tool_result" &&
        !firstString(nextBlock.tool_use_id)
      const matchedResult = toolUseId
        ? rawBlocks.find((candidate: any) =>
            candidate &&
            typeof candidate === "object" &&
            firstString(candidate.type) === "tool_result" &&
            firstString(candidate.tool_use_id) === toolUseId
          )
        : canPairByPosition
          ? nextBlock
          : null

      if (canPairByPosition) {
        consumedResultIndexes.add(index + 1)
      }

      const output = matchedResult ? firstString(matchedResult.output_preview) || "" : undefined
      const isError = Boolean(matchedResult?.is_error)
      parts.push({
        type: "tool_call",
        tool_call: {
          id: toolUseId || `tool-${index}-${Date.now()}`,
          name: firstString(block.tool_name) || "tool",
          input: toObject(inputPreview) || {},
          output,
          status: matchedResult ? (isError ? "error" : "completed") : "running",
          error: isError ? output : undefined,
        },
      })
      continue
    }
    if (type === "tool_result") {
      const toolUseId = firstString(block.tool_use_id)
      const output = firstString(block.output_preview) || ""
      if (toolUseId) {
        const matched = [...parts].reverse().find(
          (part) => part.type === "tool_call" && part.tool_call?.id === toolUseId
        )
        if (matched?.tool_call) {
          matched.tool_call.output = output
          matched.tool_call.status = block.is_error ? "error" : "completed"
          if (block.is_error) matched.tool_call.error = output
          continue
        }
      }
      parts.push({
        type: "tool_call",
        tool_call: {
          id: toolUseId || `tool-${index}-${Date.now()}`,
          name: "tool_result",
          input: {},
          output,
          status: block.is_error ? "error" : "completed",
          error: block.is_error ? output : undefined,
        },
      })
    }
  }

  return parts
}

function toObject(text: string): Record<string, any> | null {
  if (!text) return null
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}

function stableSerializeContent(content: ContentPart[]) {
  return JSON.stringify(content.map(stableNormalizePart))
}

function stableNormalizePart(part: ContentPart): Record<string, any> {
  if (part.type === "text") {
    return { type: "text", text: part.text || "" }
  }
  if (part.type === "thinking") {
    return { type: "thinking", thinking: part.thinking || "" }
  }
  if (part.type === "tool_call") {
    return {
      type: "tool_call",
      tool_call: sortUnknown(part.tool_call || {}),
    }
  }
  if (part.type === "tool_result") {
    return {
      type: "tool_result",
      tool_result: sortUnknown(part.tool_result || {}),
    }
  }
  if (part.type === "image") {
    return {
      type: "image",
      image: sortUnknown(part.image || {}),
    }
  }
  if (part.type === "plan") {
    return {
      type: "plan",
      plan: sortUnknown(part.plan || {}),
    }
  }
  return sortUnknown(part as unknown as Record<string, unknown>) as Record<string, any>
}

function sortUnknown(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortUnknown)
  }
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sortUnknown((value as Record<string, unknown>)[key])
        return result
      }, {})
  }
  return value
}

function stableHashString(input: string) {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

function normalizeAgentType(raw?: string): string {
  const value = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]/g, "_")
  if (!value) return "claude_code"
  if (value === "claudecode") return "claude_code"
  if (value === "codex_cli") return "codex"
  if (value === "gemini_cli" || value === "google_gemini" || value === "gemini_code") {
    return "gemini"
  }
  if (value === "cline_cli") return "cline"
  if (value === "opencode") return "open_code"
  if (value === "open_code_cli") return "open_code"
  if (value === "openclaw") return "open_claw"
  if (value === "open_claw_cli") return "open_claw"
  return value
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }
  return ""
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }
  return null
}

function parseTimestamp(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value
    }
    if (typeof value === "string" && value.trim()) {
      const timestamp = new Date(value).getTime()
      if (Number.isFinite(timestamp)) {
        return timestamp
      }
    }
  }
  return null
}
