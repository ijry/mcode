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
