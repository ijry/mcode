import { sqliteDriver } from "../sqlite"

export interface ConversationRuntimeRecord {
  conversationId: number
  instanceKey: string
  connectionId?: string | null
  liveMessageJson?: string | null
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
        draft_queue_json,
        attachments_json,
        scroll_anchor,
        composer_text,
        last_applied_seq,
        last_snapshot_at,
        is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(instance_key, conversation_id) DO UPDATE SET
        connection_id = excluded.connection_id,
        live_message_json = excluded.live_message_json,
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

/**
 * 只写「断点」列（连接、live message、seq、活跃标记），**草稿三列从当前行原样继承**。
 *
 * 为什么必须与 `saveDraftState` 分开：这一行里有**两个不同组件各自负责的一半**。
 *
 * | 列 | 谁写 | 在哪 |
 * | --- | --- | --- |
 * | `composer_text` / `attachments_json` / `draft_queue_json` | 持有输入框的那个组件 | `ConversationDetailInteractivePane.vue` |
 * | `live_message_json` / `last_applied_seq` / `is_active` | 持有 runtime session 的那个组件 | `pages/conversation-detail/index.vue` |
 *
 * `saveDraftState` 对草稿三列是**无条件覆盖**（它的语义就是「我来写草稿」）。详情页用它写
 * 断点时，会顺带把自己手里那份**永远为空**的 composer 状态写进去 —— 输入框早就抽到 pane
 * 了 —— 于是每次 `onHide` / `onUnload` 都把用户刚打的草稿擦成空串。
 *
 * 这个函数是那个 bug 的收口：调用方只声明自己真正拥有的列，其余的读回来再写回去。
 */
export async function saveRuntimeCheckpoint(input: {
  conversationId: number
  instanceKey: string
  connectionId?: string | null
  liveMessageJson?: string | null
  lastAppliedSeq?: number | null
  isActive?: boolean
}) {
  const current = await getRuntime(input.instanceKey, input.conversationId)
  await saveRuntime({
    conversationId: input.conversationId,
    instanceKey: input.instanceKey || current?.instanceKey || "",
    connectionId: input.connectionId ?? current?.connectionId ?? null,
    liveMessageJson: input.liveMessageJson ?? current?.liveMessageJson ?? null,
    // 草稿三列：只继承，绝不接受入参 —— 签名里根本没有它们，所以「顺手传个空串」
    // 这种写法在类型层面就不可能。
    draftQueueJson: current?.draftQueueJson ?? null,
    attachmentsJson: current?.attachmentsJson ?? null,
    composerText: current?.composerText ?? null,
    scrollAnchor: current?.scrollAnchor ?? null,
    lastAppliedSeq: input.lastAppliedSeq ?? current?.lastAppliedSeq ?? null,
    lastSnapshotAt: current?.lastSnapshotAt ?? null,
    isActive: input.isActive ?? current?.isActive ?? true,
  })
}

/**
 * 只写草稿三列，断点列从当前行继承。与 `saveRuntimeCheckpoint` 互为镜像 ——
 * 见那个函数的注释里的分工表。
 */
export async function saveDraftState(input: {
  conversationId: number
  instanceKey: string
  connectionId?: string | null
  composerText: string
  draftQueueJson: string
  attachmentsJson: string
  scrollAnchor?: string | null
  liveMessageJson?: string | null
  lastAppliedSeq?: number | null
  isActive?: boolean
}) {
  const current = await getRuntime(input.instanceKey, input.conversationId)
  await saveRuntime({
    conversationId: input.conversationId,
    instanceKey: input.instanceKey || current?.instanceKey || "",
    connectionId: input.connectionId ?? current?.connectionId ?? null,
    liveMessageJson: input.liveMessageJson ?? current?.liveMessageJson ?? null,
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

export async function countCachedRuntimeData() {
  const [runtimeRows, cursorRows] = await Promise.all([
    sqliteDriver.query<{ total?: number }>(`SELECT COUNT(*) as total FROM conversation_runtime`),
    sqliteDriver.query<{ total?: number }>(`SELECT COUNT(*) as total FROM sync_cursors`),
  ])
  return {
    runtimes: Number(runtimeRows[0]?.total || 0),
    cursors: Number(cursorRows[0]?.total || 0),
  }
}

export async function clearCachedRuntimeData() {
  await sqliteDriver.transaction(async () => {
    await sqliteDriver.execute(`DELETE FROM conversation_runtime`)
    await sqliteDriver.execute(`DELETE FROM sync_cursors`)
  })
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
