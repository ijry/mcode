# Detail History Pagination

## Architecture

Conversation detail history is paged from local SQLite after the newest turns are hydrated. The durable ordering key for local turns is `COALESCE(seq, created_at)`, with `id` as a stable tie breaker. Pages must be ordered by `sort_key DESC, id DESC`.

The page-level history cursor is now a composite `{ sortKey, id }` boundary that points to the oldest loaded turn. Older queries use:

```sql
WHERE conversation_id = ?
  AND (
    COALESCE(seq, created_at) < ?
    OR (COALESCE(seq, created_at) = ? AND id < ?)
  )
ORDER BY COALESCE(seq, created_at) DESC, id DESC
LIMIT ?
```

This prevents turns with the same `seq` or timestamp from being skipped when the next page is loaded.

## Data Flow

1. Initial detail load reads the newest local turns and maps them into runtime messages in chronological render order.
2. The oldest loaded database row becomes the composite history cursor.
3. Top scroll calls `getOlderTurns(conversationId, cursor, limit)`.
4. Returned rows are reversed for render order and prepended to `runtimeSession.localTurns`.
5. `hasMoreHistory` is recalculated from `countConversationTurns(conversationId) > loadedTurnCount`.

## UI Behavior

The detail page still shows the history status bar at the top. `scrolltoupper` and near-top scrolling trigger the same loader, but the loader no longer treats a short page as authoritative end-of-history. The "没有更多历史了" text appears only when the local total count is no greater than the loaded message count, or when an older query returns zero rows.

## Compatibility

Existing cached `oldestLoadedSeq` values remain readable. During hot runtime restore, the web client builds a best-effort composite cursor from the cached sort key plus the first rendered message id. New cache writes continue storing `oldestLoadedSeq` as a numeric sort key, so older clients are not broken by an object-shaped cache value.

No schema migration is required. The query relies on existing `seq`, `created_at`, and `id` columns.

## Native iOS/Android Guidance

Native clients should use the same composite cursor and SQL ordering. Do not implement offset pagination for detail history; prepends and realtime dedupe can make offsets drift. Do not infer `hasMoreHistory` from `rows.length == pageSize`; compare local total turn count against currently loaded turn count after each successful prepend.
