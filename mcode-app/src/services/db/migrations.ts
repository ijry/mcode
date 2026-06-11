import { TABLE_SQL } from "./schema"
import { sqliteDriver } from "./sqlite"

let schemaReady = false
let schemaPromise: Promise<void> | null = null

export async function ensureConversationSchema() {
  if (schemaReady) return
  if (!schemaPromise) {
    schemaPromise = ensureConversationSchemaInternal()
      .then(() => {
        schemaReady = true
      })
      .finally(() => {
        if (!schemaReady) {
          schemaPromise = null
        }
      })
  }
  await schemaPromise
}

async function ensureConversationSchemaInternal() {
  await sqliteDriver.open()
  await sqliteDriver.execute(TABLE_SQL.remoteInstances)
  await sqliteDriver.execute(TABLE_SQL.folders)
  await sqliteDriver.execute(TABLE_SQL.conversations)
  await sqliteDriver.execute(TABLE_SQL.conversationTurns)
  await ensureConversationTurnDedupeColumn()
  await sqliteDriver.execute(TABLE_SQL.conversationParts)
  await sqliteDriver.execute(TABLE_SQL.conversationRuntime)
  await ensureConversationRuntimeCompositeKey()
  await sqliteDriver.execute(TABLE_SQL.syncCursors)
  for (const sql of TABLE_SQL.indexes) {
    await sqliteDriver.execute(sql)
  }
}

async function ensureConversationTurnDedupeColumn() {
  const columns = await sqliteDriver.query<{ name?: string }>(
    `PRAGMA table_info(conversation_turns)`
  )
  const hasDedupeKey = columns.some((column) => column.name === "dedupe_key")
  if (!hasDedupeKey) {
    await sqliteDriver.execute(
      `ALTER TABLE conversation_turns ADD COLUMN dedupe_key TEXT`
    )
    await sqliteDriver.execute(
      `
        UPDATE conversation_turns
        SET dedupe_key = COALESCE(dedupe_key, 'legacy:' || id)
        WHERE dedupe_key IS NULL OR dedupe_key = ''
      `
    )
  }
}

async function ensureConversationRuntimeCompositeKey() {
  const columns = await sqliteDriver.query<{ name?: string; pk?: number }>(
    `PRAGMA table_info(conversation_runtime)`
  )
  const conversationPk = columns.find((column) => column.name === "conversation_id")?.pk ?? 0
  const instancePk = columns.find((column) => column.name === "instance_key")?.pk ?? 0
  if (conversationPk > 0 && instancePk > 0) return

  await sqliteDriver.transaction(async () => {
    await sqliteDriver.execute(`ALTER TABLE conversation_runtime RENAME TO conversation_runtime_legacy`)
    await sqliteDriver.execute(TABLE_SQL.conversationRuntime)
    await sqliteDriver.execute(
      `
        INSERT OR REPLACE INTO conversation_runtime (
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
        )
        SELECT
          conversation_id,
          COALESCE(NULLIF(instance_key, ''), 'legacy:unknown') AS instance_key,
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
        FROM conversation_runtime_legacy
      `
    )
    await sqliteDriver.execute(`DROP TABLE conversation_runtime_legacy`)
  })
}
