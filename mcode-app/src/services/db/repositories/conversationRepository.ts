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
  role: string
  createdAt: number
  seq?: number | null
  status?: string | null
  version: number
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

export async function getNewestTurns(conversationId: number, limit: number) {
  return await sqliteDriver.query<PersistedTurnRow>(
    `
      SELECT
        id,
        conversation_id as conversationId,
        instance_key as instanceKey,
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
}

export async function getOlderTurns(
  conversationId: number,
  beforeSeq: number,
  limit = 20
) {
  return await sqliteDriver.query<PersistedTurnRow>(
    `
      SELECT
        id,
        conversation_id as conversationId,
        instance_key as instanceKey,
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
    await sqliteDriver.execute(
      `
        INSERT OR REPLACE INTO conversation_turns (
          id,
          conversation_id,
          instance_key,
          role,
          created_at,
          seq,
          status,
          version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        input.id,
        input.conversationId,
        input.instanceKey,
        input.role,
        input.createdAt,
        input.seq ?? null,
        input.status ?? null,
        input.version,
      ]
    )

    await sqliteDriver.execute(
      `DELETE FROM conversation_parts WHERE turn_id = ?`,
      [input.id]
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
          part.id,
          input.id,
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

