# Profile Cache Clear

## Architecture

The `我的 -> 清除缓存` entry is now a targeted cache-management flow instead of a global storage wipe. `mcode-app/src/services/cache/cacheManager.ts` owns cache inspection, active-task blocking, and deletion. The profile page only shows loading states, blocked-state modals, and the final confirmation modal.

## Cache Inventory And Data Flow

On tap, the app calls `inspectClearableCache()` and builds a user-visible inventory from:

- SQLite conversation cache: `folders`, `conversations`, `conversation_turns`, `conversation_parts`.
- SQLite runtime cache: `conversation_runtime`, `sync_cursors`.
- In-memory detail hot cache: `conversationCache.byConversationId`.
- Short-lived `uni` storage caches: `mcode_create_agent_list_cache_v1`, `mcode_create_agent_config_cache_v1`, and keys prefixed with `mcode_conversation_draft_snapshot:`.

If no active task is found, the confirmation explains that these caches are safe to clear because conversation data will be pulled again from the current remote connection. The clear operation deletes only the listed cache buckets and preserves login state, theme preference, direct/relay connection configuration, todos, and pet data.

After persistent cache deletion, the client also clears inactive in-memory runtime buffers (`localTurns`, optimistic/live buffers, transient errors, pending prompts, and last sequence state) while preserving connection identity. This prevents stale memory-only messages from remaining visible after SQLite has been cleared.

## Active-Task Guard

Clearing is blocked when any runtime session is active. A session is active when its status is `thinking`, `running_tool`, `waiting_permission`, or `waiting_question`, or when it still has optimistic turns or a live message. In that case the user sees a modal explaining that a task is in progress and cache clearing must wait until the task ends.

## Compatibility

The flow is compatible with existing H5 and App SQLite storage because it uses repository-level `DELETE` statements after `ensureConversationSchema()`. It does not remove the database file or IndexedDB object store, so schema migration state remains intact and the cache can be repopulated normally. Legacy global `uni.clearStorageSync()` behavior is intentionally removed to avoid deleting user configuration.

## Native iOS/Android Replication Guidance

Native clients should implement the same four-phase flow:

1. Inspect runtime sessions in memory and block if any session is streaming, running a tool, waiting for permission/question input, has an optimistic user turn, or has a live assistant message.
2. Count local cache buckets and show them before confirmation: conversation summaries/folders, turn rows/parts, runtime restore rows, sync cursors, detail hot cache entries, and short-lived composer/agent config caches.
3. On confirmation, delete only those cache buckets. Do not delete auth tokens, theme settings, connection records, pet data, or other user-owned preferences.
4. After deletion, clear any in-memory detail cache and inactive runtime message buffers, then let the conversation list/detail screens fetch from the remote instance on next entry.
