export const SCHEMA_VERSION = 1

export const TABLE_SQL = {
  remoteInstances: `
    CREATE TABLE IF NOT EXISTS remote_instances (
      instance_key TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      base_url TEXT NOT NULL,
      auth_meta TEXT,
      last_seen_at INTEGER NOT NULL DEFAULT 0
    )
  `,
  folders: `
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER NOT NULL,
      instance_key TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (instance_key, id)
    )
  `,
  conversations: `
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER NOT NULL,
      instance_key TEXT NOT NULL,
      folder_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      agent_type TEXT NOT NULL,
      external_id TEXT,
      connection_id TEXT,
      status TEXT NOT NULL DEFAULT 'idle',
      last_turn_id TEXT,
      last_message_at INTEGER NOT NULL DEFAULT 0,
      unread_count INTEGER NOT NULL DEFAULT 0,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      deleted_at INTEGER,
      updated_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (instance_key, id)
    )
  `,
  conversationTurns: `
    CREATE TABLE IF NOT EXISTS conversation_turns (
      id TEXT PRIMARY KEY,
      conversation_id INTEGER NOT NULL,
      instance_key TEXT NOT NULL,
      dedupe_key TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      seq INTEGER,
      status TEXT,
      version INTEGER NOT NULL DEFAULT 1
    )
  `,
  conversationParts: `
    CREATE TABLE IF NOT EXISTS conversation_parts (
      id TEXT PRIMARY KEY,
      turn_id TEXT NOT NULL,
      conversation_id INTEGER NOT NULL,
      part_index INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT 0
    )
  `,
  conversationRuntime: `
    CREATE TABLE IF NOT EXISTS conversation_runtime (
      conversation_id INTEGER NOT NULL,
      instance_key TEXT NOT NULL,
      connection_id TEXT,
      live_message_json TEXT,
      optimistic_json TEXT,
      draft_queue_json TEXT,
      attachments_json TEXT,
      scroll_anchor TEXT,
      composer_text TEXT,
      last_applied_seq INTEGER,
      last_snapshot_at INTEGER,
      is_active INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (instance_key, conversation_id)
    )
  `,
  syncCursors: `
    CREATE TABLE IF NOT EXISTS sync_cursors (
      instance_key TEXT NOT NULL,
      connection_id TEXT NOT NULL,
      subscription_id TEXT,
      last_seq INTEGER,
      last_sync_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (instance_key, connection_id)
    )
  `,
  indexes: [
    `CREATE INDEX IF NOT EXISTS idx_conversations_folder_updated ON conversations(instance_key, folder_id, last_message_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(instance_key, updated_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_turns_conversation_created ON conversation_turns(conversation_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_turns_conversation_seq ON conversation_turns(conversation_id, seq DESC)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_turns_conversation_dedupe ON conversation_turns(conversation_id, dedupe_key)`,
    `CREATE INDEX IF NOT EXISTS idx_parts_turn_index ON conversation_parts(turn_id, part_index ASC)`,
  ],
} as const
