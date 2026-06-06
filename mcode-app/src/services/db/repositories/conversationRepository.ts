import { sqliteDriver } from "../sqlite"
import {
  mergeConversationSummaryStatus,
  normalizeConversationSummaryStatus,
} from "@/services/conversation/conversationSummaryStatus"

export interface ConversationSummaryRecord {
  id: number
  instanceKey: string
  folderId: number
  title: string
  agentType: string
  externalId?: string | null
  connectionId?: string | null
  status: string
  lastTurnId?: string | null
  lastMessageAt: number
  unreadCount: number
  isPinned: boolean
  deletedAt?: number | null
  updatedAt: number
}

export interface PersistedTurnPartRecord {
  id: string
  partIndex: number
  type: string
  payloadJson: string
  updatedAt: number
}

export interface PersistedTurnRecord {
  id: string
  conversationId: number
  instanceKey: string
  dedupeKey: string
  role: "user" | "assistant"
  createdAt: number
  seq?: number | null
  status?: string | null
  version: number
  parts: PersistedTurnPartRecord[]
}

export interface PersistedTurnRow {
  id: string
  conversationId: number
  instanceKey: string
  dedupeKey: string
  role: string
  createdAt: number
  seq?: number | null
  status?: string | null
  version: number
}

export interface PersistedTurnPartRow {
  id: string
  turnId: string
  conversationId: number
  partIndex: number
  type: string
  payloadJson: string
  updatedAt: number
}

export interface PersistedTurnWithParts extends PersistedTurnRow {
  parts: PersistedTurnPartRow[]
}

export async function listConversationSummaries(
  instanceKey: string,
  folderId: number
) {
  return await sqliteDriver.query<ConversationSummaryRecord>(
    `
      SELECT
        id,
        instance_key as instanceKey,
        folder_id as folderId,
        title,
        agent_type as agentType,
        external_id as externalId,
        connection_id as connectionId,
        status,
        last_turn_id as lastTurnId,
        last_message_at as lastMessageAt,
        unread_count as unreadCount,
        is_pinned as isPinned,
        deleted_at as deletedAt,
        updated_at as updatedAt
      FROM conversations
      WHERE instance_key = ? AND folder_id = ? AND deleted_at IS NULL
      ORDER BY last_message_at DESC, updated_at DESC
    `,
    [instanceKey, folderId]
  )
}

export async function getConversationSummaryById(
  instanceKey: string,
  conversationId: number
) {
  const rows = await sqliteDriver.query<ConversationSummaryRecord>(
    `
      SELECT
        id,
        instance_key as instanceKey,
        folder_id as folderId,
        title,
        agent_type as agentType,
        external_id as externalId,
        connection_id as connectionId,
        status,
        last_turn_id as lastTurnId,
        last_message_at as lastMessageAt,
        unread_count as unreadCount,
        is_pinned as isPinned,
        deleted_at as deletedAt,
        updated_at as updatedAt
      FROM conversations
      WHERE instance_key = ? AND id = ? AND deleted_at IS NULL
      LIMIT 1
    `,
    [instanceKey, conversationId]
  )
  return rows[0] ?? null
}

export async function getNewestTurns(conversationId: number, limit: number) {
  const turns = await sqliteDriver.query<PersistedTurnRow>(
    `
      SELECT
        id,
        conversation_id as conversationId,
        instance_key as instanceKey,
        dedupe_key as dedupeKey,
        role,
        created_at as createdAt,
        seq,
        status,
        version
      FROM conversation_turns
      WHERE conversation_id = ?
      ORDER BY COALESCE(seq, created_at) DESC
      LIMIT ?
    `,
    [conversationId, limit]
  )
  return await hydrateTurnsWithParts(turns)
}

export async function countConversationTurns(conversationId: number) {
  const rows = await sqliteDriver.query<{ total?: number }>(
    `
      SELECT COUNT(*) as total
      FROM conversation_turns
      WHERE conversation_id = ?
    `,
    [conversationId]
  )
  return Number(rows[0]?.total || 0)
}

export async function getOlderTurns(
  conversationId: number,
  beforeSeq: number,
  limit = 20
) {
  const turns = await sqliteDriver.query<PersistedTurnRow>(
    `
      SELECT
        id,
        conversation_id as conversationId,
        instance_key as instanceKey,
        dedupe_key as dedupeKey,
        role,
        created_at as createdAt,
        seq,
        status,
        version
      FROM conversation_turns
      WHERE conversation_id = ? AND COALESCE(seq, created_at) < ?
      ORDER BY COALESCE(seq, created_at) DESC
      LIMIT ?
    `,
    [conversationId, beforeSeq, limit]
  )
  return await hydrateTurnsWithParts(turns)
}

export async function upsertConversationSummary(input: ConversationSummaryRecord) {
  const current = await getConversationSummaryById(input.instanceKey, input.id)
  const next = current
    ? mergeConversationSummaryRecord(current, input)
    : normalizeConversationSummaryRecord(input)

  await sqliteDriver.execute(
    `
      INSERT INTO conversations (
        id,
        instance_key,
        folder_id,
        title,
        agent_type,
        external_id,
        connection_id,
        status,
        last_turn_id,
        last_message_at,
        unread_count,
        is_pinned,
        deleted_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(instance_key, id) DO UPDATE SET
        folder_id = excluded.folder_id,
        title = excluded.title,
        agent_type = excluded.agent_type,
        external_id = excluded.external_id,
        connection_id = excluded.connection_id,
        status = excluded.status,
        last_turn_id = excluded.last_turn_id,
        last_message_at = excluded.last_message_at,
        unread_count = excluded.unread_count,
        is_pinned = excluded.is_pinned,
        deleted_at = excluded.deleted_at,
        updated_at = excluded.updated_at
    `,
    [
      next.id,
      next.instanceKey,
      next.folderId,
      next.title,
      next.agentType,
      next.externalId ?? null,
      next.connectionId ?? null,
      next.status,
      next.lastTurnId ?? null,
      next.lastMessageAt,
      next.unreadCount,
      next.isPinned ? 1 : 0,
      next.deletedAt ?? null,
      next.updatedAt,
    ]
  )
}

export async function patchConversationSummaryStatus(input: {
  instanceKey: string
  conversationId: number
  status: string
  updatedAt?: number
}) {
  const current = await getConversationSummaryById(input.instanceKey, input.conversationId)
  if (!current) return false

  const nextUpdatedAt = normalizeTimestamp(input.updatedAt, Date.now())
  const nextStatus = mergeConversationSummaryStatus({
    currentStatus: current.status,
    currentUpdatedAt: current.updatedAt,
    incomingStatus: input.status,
    incomingUpdatedAt: nextUpdatedAt,
  })

  await sqliteDriver.execute(
    `
      UPDATE conversations
      SET status = ?, updated_at = ?
      WHERE instance_key = ? AND id = ? AND deleted_at IS NULL
    `,
    [nextStatus, nextUpdatedAt, input.instanceKey, input.conversationId]
  )

  return true
}

export async function markConversationSummaryDeleted(input: {
  instanceKey: string
  conversationId: number
  deletedAt?: number
}) {
  const deletedAt = normalizeTimestamp(input.deletedAt, Date.now())
  await sqliteDriver.execute(
    `
      UPDATE conversations
      SET deleted_at = ?, updated_at = ?
      WHERE instance_key = ? AND id = ?
    `,
    [deletedAt, deletedAt, input.instanceKey, input.conversationId]
  )
}

function mergeConversationSummaryRecord(
  currentInput: ConversationSummaryRecord,
  incomingInput: ConversationSummaryRecord
): ConversationSummaryRecord {
  const current = normalizeConversationSummaryRecord(currentInput)
  const incoming = normalizeConversationSummaryRecord(incomingInput)
  const incomingIsNewer = incoming.updatedAt >= current.updatedAt

  return {
    id: current.id,
    instanceKey: current.instanceKey,
    folderId: incomingIsNewer
      ? pickFolderId(incoming.folderId, current.folderId)
      : pickFolderId(current.folderId, incoming.folderId),
    title: incomingIsNewer
      ? pickString(incoming.title, current.title) || `会话 #${current.id}`
      : pickString(current.title, incoming.title) || `会话 #${current.id}`,
    agentType: incomingIsNewer
      ? pickString(incoming.agentType, current.agentType) || "claude_code"
      : pickString(current.agentType, incoming.agentType) || "claude_code",
    externalId: incomingIsNewer
      ? pickOptionalString(incoming.externalId, current.externalId)
      : pickOptionalString(current.externalId, incoming.externalId),
    connectionId: incomingIsNewer
      ? pickOptionalString(incoming.connectionId, current.connectionId)
      : pickOptionalString(current.connectionId, incoming.connectionId),
    status: mergeConversationSummaryStatus({
      currentStatus: current.status,
      currentUpdatedAt: current.updatedAt,
      incomingStatus: incoming.status,
      incomingUpdatedAt: incoming.updatedAt,
    }),
    lastTurnId: incomingIsNewer
      ? pickOptionalString(incoming.lastTurnId, current.lastTurnId)
      : pickOptionalString(current.lastTurnId, incoming.lastTurnId),
    lastMessageAt: Math.max(current.lastMessageAt, incoming.lastMessageAt),
    unreadCount: incomingIsNewer ? incoming.unreadCount : current.unreadCount,
    isPinned: incomingIsNewer ? incoming.isPinned : current.isPinned,
    deletedAt: incomingIsNewer ? incoming.deletedAt ?? null : current.deletedAt ?? null,
    updatedAt: Math.max(current.updatedAt, incoming.updatedAt),
  }
}

function normalizeConversationSummaryRecord(
  input: ConversationSummaryRecord
): ConversationSummaryRecord {
  const lastMessageAt = normalizeTimestamp(input.lastMessageAt, Date.now())
  const updatedAt = normalizeTimestamp(input.updatedAt, lastMessageAt)
  return {
    ...input,
    folderId: pickFolderId(input.folderId, 0),
    title: pickString(input.title) || `会话 #${input.id}`,
    agentType: pickString(input.agentType) || "claude_code",
    externalId: pickOptionalString(input.externalId),
    connectionId: pickOptionalString(input.connectionId),
    status: normalizeConversationSummaryStatus(input.status),
    lastTurnId: pickOptionalString(input.lastTurnId),
    lastMessageAt,
    unreadCount: normalizeCount(input.unreadCount),
    isPinned: Boolean(input.isPinned),
    deletedAt: normalizeOptionalTimestamp(input.deletedAt),
    updatedAt,
  }
}

function pickString(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }
  return ""
}

function pickOptionalString(...values: Array<string | null | undefined>) {
  const next = pickString(...values)
  return next || null
}

function pickFolderId(...values: Array<number | null | undefined>) {
  for (const value of values) {
    const next = Number(value || 0)
    if (Number.isFinite(next) && next > 0) {
      return next
    }
  }
  return 0
}

function normalizeCount(value: number | null | undefined) {
  const next = Number(value || 0)
  if (!Number.isFinite(next) || next < 0) return 0
  return Math.floor(next)
}

function normalizeTimestamp(value: number | null | undefined, fallback: number) {
  const next = Number(value || 0)
  if (Number.isFinite(next) && next > 0) {
    return next
  }
  return fallback
}

function normalizeOptionalTimestamp(value: number | null | undefined) {
  const next = Number(value || 0)
  if (Number.isFinite(next) && next > 0) {
    return next
  }
  return null
}

export async function insertCompletedTurn(input: PersistedTurnRecord) {
  await sqliteDriver.transaction(async () => {
    await upsertCompletedTurn(input)
  })
}

export async function insertCompletedTurns(inputs: PersistedTurnRecord[]) {
  if (inputs.length === 0) return
  await sqliteDriver.transaction(async () => {
    for (const input of inputs) {
      await upsertCompletedTurn(input)
    }
  })
}

async function upsertCompletedTurn(input: PersistedTurnRecord) {
  const existing = await sqliteDriver.query<{ id: string }>(
    `
      SELECT id
      FROM conversation_turns
      WHERE conversation_id = ? AND dedupe_key = ?
      LIMIT 1
    `,
    [input.conversationId, input.dedupeKey]
  )
  const persistedTurnId = existing[0]?.id || input.id

  await sqliteDriver.execute(
    `
      INSERT INTO conversation_turns (
        id,
        conversation_id,
        instance_key,
        dedupe_key,
        role,
        created_at,
        seq,
        status,
        version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(conversation_id, dedupe_key) DO UPDATE SET
        instance_key = excluded.instance_key,
        role = excluded.role,
        created_at = excluded.created_at,
        seq = excluded.seq,
        status = excluded.status,
        version = excluded.version
    `,
    [
      persistedTurnId,
      input.conversationId,
      input.instanceKey,
      input.dedupeKey,
      input.role,
      input.createdAt,
      input.seq ?? null,
      input.status ?? null,
      input.version,
    ]
  )

  await sqliteDriver.execute(
    `DELETE FROM conversation_parts WHERE turn_id = ?`,
    [persistedTurnId]
  )

  for (const part of input.parts) {
    await sqliteDriver.execute(
      `
        INSERT OR REPLACE INTO conversation_parts (
          id,
          turn_id,
          conversation_id,
          part_index,
          type,
          payload_json,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        `${persistedTurnId}:${part.partIndex}`,
        persistedTurnId,
        input.conversationId,
        part.partIndex,
        part.type,
        part.payloadJson,
        part.updatedAt,
      ]
    )
  }
}

async function hydrateTurnsWithParts(
  turns: PersistedTurnRow[]
): Promise<PersistedTurnWithParts[]> {
  if (turns.length === 0) return []
  const placeholders = turns.map(() => "?").join(", ")
  const parts = await sqliteDriver.query<PersistedTurnPartRow>(
    `
      SELECT
        id,
        turn_id as turnId,
        conversation_id as conversationId,
        part_index as partIndex,
        type,
        payload_json as payloadJson,
        updated_at as updatedAt
      FROM conversation_parts
      WHERE turn_id IN (${placeholders})
      ORDER BY part_index ASC
    `,
    turns.map((turn) => turn.id)
  )
  const partsByTurnId = new Map<string, PersistedTurnPartRow[]>()
  for (const part of parts) {
    const bucket = partsByTurnId.get(part.turnId) || []
    bucket.push(part)
    partsByTurnId.set(part.turnId, bucket)
  }
  return turns.map((turn) => ({
    ...turn,
    parts: partsByTurnId.get(turn.id) || [],
  }))
}
