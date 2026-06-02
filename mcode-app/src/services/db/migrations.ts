import { TABLE_SQL } from "./schema"
import { sqliteDriver } from "./sqlite"

export async function ensureConversationSchema() {
  await sqliteDriver.open()
  await sqliteDriver.execute(TABLE_SQL.remoteInstances)
  await sqliteDriver.execute(TABLE_SQL.folders)
  await sqliteDriver.execute(TABLE_SQL.conversations)
  await sqliteDriver.execute(TABLE_SQL.conversationTurns)
  await sqliteDriver.execute(TABLE_SQL.conversationParts)
  await sqliteDriver.execute(TABLE_SQL.conversationRuntime)
  await sqliteDriver.execute(TABLE_SQL.syncCursors)
  for (const sql of TABLE_SQL.indexes) {
    await sqliteDriver.execute(sql)
  }
}

