import { sqliteDriver } from "../sqlite"

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
      input.id,
      input.instanceKey,
      input.folderId,
      input.title,
      input.agentType,
      input.externalId ?? null,
      input.connectionId ?? null,
      input.status,
      input.lastTurnId ?? null,
      input.lastMessageAt,
      input.unreadCount,
      input.isPinned ? 1 : 0,
      input.deletedAt ?? null,
      input.updatedAt,
    ]
  )
}

export async function insertCompletedTurn(input: PersistedTurnRecord) {
  await sqliteDriver.transaction(async () => {
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
  })
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
