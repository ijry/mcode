import { sqliteDriver } from "../sqlite"

export interface ConversationRuntimeRecord {
  conversationId: number
  instanceKey: string
  connectionId?: string | null
  liveMessageJson?: string | null
  optimisticJson?: string | null
  draftQueueJson?: string | null
  attachmentsJson?: string | null
  scrollAnchor?: string | null
  composerText?: string | null
  lastAppliedSeq?: number | null
  lastSnapshotAt?: number | null
  isActive: boolean
}

export interface SyncCursorRecord {
  instanceKey: string
  connectionId: string
  subscriptionId?: string | null
  lastSeq?: number | null
  lastSyncAt: number
}

export async function getRuntime(instanceKey: string, conversationId: number) {
  if (!instanceKey) return null
  const rows = await sqliteDriver.query<ConversationRuntimeRecord>(
    `
      SELECT
        conversation_id as conversationId,
        instance_key as instanceKey,
        connection_id as connectionId,
        live_message_json as liveMessageJson,
        optimistic_json as optimisticJson,
        draft_queue_json as draftQueueJson,
        attachments_json as attachmentsJson,
        scroll_anchor as scrollAnchor,
        composer_text as composerText,
        last_applied_seq as lastAppliedSeq,
        last_snapshot_at as lastSnapshotAt,
        is_active as isActive
      FROM conversation_runtime
      WHERE instance_key = ? AND conversation_id = ?
      LIMIT 1
    `,
    [instanceKey, conversationId]
  )
  return rows[0] ?? null
}

export async function saveRuntime(input: ConversationRuntimeRecord) {
  await sqliteDriver.execute(
    `
      INSERT INTO conversation_runtime (
        conversation_id,
        instance_key,
        connection_id,
        live_message_json,
        optimistic_json,
        draft_queue_json,
        attachments_json,
        scroll_anchor,
        composer_text,
        last_applied_seq,
        last_snapshot_at,
        is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(instance_key, conversation_id) DO UPDATE SET
        connection_id = excluded.connection_id,
        live_message_json = excluded.live_message_json,
        optimistic_json = excluded.optimistic_json,
        draft_queue_json = excluded.draft_queue_json,
        attachments_json = excluded.attachments_json,
        scroll_anchor = excluded.scroll_anchor,
        composer_text = excluded.composer_text,
        last_applied_seq = excluded.last_applied_seq,
        last_snapshot_at = excluded.last_snapshot_at,
        is_active = excluded.is_active
    `,
    [
      input.conversationId,
      input.instanceKey,
      input.connectionId ?? null,
      input.liveMessageJson ?? null,
      input.optimisticJson ?? null,
      input.draftQueueJson ?? null,
      input.attachmentsJson ?? null,
      input.scrollAnchor ?? null,
      input.composerText ?? null,
      input.lastAppliedSeq ?? null,
      input.lastSnapshotAt ?? null,
      input.isActive ? 1 : 0,
    ]
  )
}

export async function saveDraftState(input: {
  conversationId: number
  instanceKey: string
  connectionId?: string | null
  composerText: string
  draftQueueJson: string
  attachmentsJson: string
  scrollAnchor?: string | null
  liveMessageJson?: string | null
  optimisticJson?: string | null
  lastAppliedSeq?: number | null
  isActive?: boolean
}) {
  const current = await getRuntime(input.instanceKey, input.conversationId)
  await saveRuntime({
    conversationId: input.conversationId,
    instanceKey: input.instanceKey || current?.instanceKey || "",
    connectionId: input.connectionId ?? current?.connectionId ?? null,
    liveMessageJson: input.liveMessageJson ?? current?.liveMessageJson ?? null,
    optimisticJson: input.optimisticJson ?? current?.optimisticJson ?? null,
    draftQueueJson: input.draftQueueJson,
    attachmentsJson: input.attachmentsJson,
    scrollAnchor: input.scrollAnchor ?? current?.scrollAnchor ?? null,
    composerText: input.composerText,
    lastAppliedSeq: input.lastAppliedSeq ?? current?.lastAppliedSeq ?? null,
    lastSnapshotAt: current?.lastSnapshotAt ?? null,
    isActive: input.isActive ?? current?.isActive ?? true,
  })
}

export async function clearRuntime(instanceKey: string, conversationId: number) {
  await sqliteDriver.execute(
    `DELETE FROM conversation_runtime WHERE instance_key = ? AND conversation_id = ?`,
    [instanceKey, conversationId]
  )
}

export async function saveCursor(input: SyncCursorRecord) {
  await sqliteDriver.execute(
    `
      INSERT INTO sync_cursors (
        instance_key,
        connection_id,
        subscription_id,
        last_seq,
        last_sync_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(instance_key, connection_id) DO UPDATE SET
        subscription_id = excluded.subscription_id,
        last_seq = excluded.last_seq,
        last_sync_at = excluded.last_sync_at
    `,
    [
      input.instanceKey,
      input.connectionId,
      input.subscriptionId ?? null,
      input.lastSeq ?? null,
      input.lastSyncAt,
    ]
  )
}
