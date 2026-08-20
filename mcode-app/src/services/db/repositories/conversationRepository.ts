import { sqliteDriver } from "../sqlite"
import {
  mergeConversationSummaryStatus,
  normalizeConversationSummaryStatus,
} from "@/services/conversation/conversationSummaryStatus"

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
  // 与服务端 TurnRole 对齐的三种角色。`system` 是上下文压缩摘要等注入的系统上下文，
  // 必须能落库并原样读回，否则重载后会被当成 agent 回复渲染。
  role: "user" | "assistant" | "system"
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
  sortKey: number
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
        COALESCE(seq, created_at) as sortKey,
        status,
        version
      FROM conversation_turns
      WHERE conversation_id = ?
      ORDER BY COALESCE(seq, created_at) DESC, id DESC
      LIMIT ?
    `,
    [conversationId, limit]
  )
  return await hydrateTurnsWithParts(turns)
}

export async function replaceCompletedTurns(
  conversationId: number,
  inputs: PersistedTurnRecord[]
) {
  await sqliteDriver.transaction(async () => {
    await sqliteDriver.execute(
      "DELETE FROM conversation_parts WHERE conversation_id = ?",
      [conversationId]
    )
    await sqliteDriver.execute(
      "DELETE FROM conversation_turns WHERE conversation_id = ?",
      [conversationId]
    )
    for (const input of inputs) {
      await upsertCompletedTurn(input)
    }
    // 远端一页实际可能返回 30~230 条（服务端把窗口起点向前对齐到 user 轮次边界，
    // `ROUND_ALIGN_CAP = 200` 兜底）。读取侧一律只取 30，多出来的行永远读不到，
    // 所以在同一个事务里直接裁掉，别让它们落盘。
    await pruneTurnsInsideTransaction(
      conversationId,
      CONVERSATION_TURN_CACHE_KEEP
    )
  })
}

/**
 * 缓存保留的轮次条数 —— 缓存的语义是「只存最新一页」，这就是那一页。
 *
 * 刻意与读取侧的 `DEFAULT_CONVERSATION_HISTORY_PAGE_SIZE` 同值，但**不 import 它**：
 * 这一层是 `services/db`，import `services/conversation` 会形成
 * `conversationRepository → conversationHistoryWindowContract` 的反向依赖
 * （contract 那侧已经被 `api/` 和 `stores/` 依赖）。两者必须一致，靠测试锁住。
 */
export const CONVERSATION_TURN_CACHE_KEEP = 30

/**
 * 把一个会话的缓存裁剪到最新 `keep` 条轮次，删掉更早的。
 *
 * **为什么必须有这个函数**：缓存的语义是「只存最新一页」，而两条写入路径里只有一条
 * 天然收敛：
 *
 * - `replaceCompletedTurns`（远端 detail 落库）先 DELETE 整个会话再插；
 * - `insertCompletedTurn`（`turn_complete` 时逐条追加）只 upsert，**从不删** ——
 *   会话开着一直聊，缓存就单调增长，聊到 300 轮缓存里就躺着 300 轮。
 *
 * 读取侧的 `getNewestTurns(..., 30)` 带 LIMIT，所以多出来的行**永远读不到**，
 * 表现上看不出任何问题；它们只是长期占着手机存储、并被「清除缓存」页面算进条数。
 * 这个函数让「只存最新一页」从读取侧的巧合变成落盘事实。
 *
 * 排序键与 `getNewestTurns` **必须逐字一致**（`COALESCE(seq, created_at) DESC, id DESC`）。
 * 不一致的话「读取侧认为的最新 30 条」与「裁剪侧保留的 30 条」会是两个不同集合，
 * 刚写进去的轮次可能当场被裁掉 —— 用户看到刚说完的话消失。
 *
 * 返回删掉的条数（0 是常态，表示无需裁剪）。
 */
export async function pruneConversationTurnsToNewest(
  conversationId: number,
  keep: number = CONVERSATION_TURN_CACHE_KEEP
) {
  return await sqliteDriver.transaction(
    async () => await pruneTurnsInsideTransaction(conversationId, keep)
  )
}

/**
 * 裁剪的实现体，**不自己开事务**。
 *
 * `sqliteDriver.transaction` 无条件发 `BEGIN IMMEDIATE`（没有 SAVEPOINT 嵌套支持），
 * 在事务里再调一次导出版会直接报 "cannot start a transaction within a transaction"。
 * 所以 `replaceCompletedTurns` 复用这个内部版，独立调用点走导出的包装。
 */
async function pruneTurnsInsideTransaction(
  conversationId: number,
  keep: number
) {
  // 任何非正 / 非有限的入参都退回默认一页，而**不是**钳到 1。两者都是编程错误，
  // 但「只保留 1 条」几乎等于静默清空这个会话的缓存，而调用方想表达的从来不是
  // 这个。钳到 1 还会与 `keep=0` 走 falsy 分支的行为不一致 —— 同样荒谬的入参
  // 给出两个不同答案，是下一个 bug 的温床。
  const requested = Math.floor(Number(keep))
  const limit =
    Number.isFinite(requested) && requested > 0
      ? requested
      : CONVERSATION_TURN_CACHE_KEEP
  const stale = await sqliteDriver.query<{ id: string }>(
    `
      SELECT id
      FROM conversation_turns
      WHERE conversation_id = ?
      ORDER BY COALESCE(seq, created_at) DESC, id DESC
      LIMIT -1 OFFSET ?
    `,
    [conversationId, limit]
  )
  if (stale.length === 0) return 0

  const placeholders = stale.map(() => "?").join(", ")
  const staleIds = stale.map((row) => row.id)
  // 先删 parts。schema 里 conversation_parts 是普通表、**没有外键 CASCADE**
  // （见 `schema.ts`），反序执行会留下一批查不到宿主轮次的孤儿 part 行 ——
  // 那比不裁剪更糟：占着存储且没有任何路径会再清理它们。
  await sqliteDriver.execute(
    `DELETE FROM conversation_parts WHERE turn_id IN (${placeholders})`,
    staleIds
  )
  await sqliteDriver.execute(
    `DELETE FROM conversation_turns WHERE id IN (${placeholders})`,
    staleIds
  )
  return stale.length
}

export async function countCachedConversationData() {
  const [folderRows, summaryRows, turnRows, partRows] = await Promise.all([
    sqliteDriver.query<{ total?: number }>(`SELECT COUNT(*) as total FROM folders`),
    sqliteDriver.query<{ total?: number }>(`SELECT COUNT(*) as total FROM conversations`),
    sqliteDriver.query<{ total?: number }>(`SELECT COUNT(*) as total FROM conversation_turns`),
    sqliteDriver.query<{ total?: number }>(`SELECT COUNT(*) as total FROM conversation_parts`),
  ])
  return {
    folders: Number(folderRows[0]?.total || 0),
    conversations: Number(summaryRows[0]?.total || 0),
    turns: Number(turnRows[0]?.total || 0),
    parts: Number(partRows[0]?.total || 0),
  }
}

export async function clearCachedConversationData() {
  await sqliteDriver.transaction(async () => {
    await sqliteDriver.execute(`DELETE FROM conversation_parts`)
    await sqliteDriver.execute(`DELETE FROM conversation_turns`)
    await sqliteDriver.execute(`DELETE FROM conversations`)
    await sqliteDriver.execute(`DELETE FROM folders`)
  })
}

/**
 * 只清轮次与 part，**保留会话摘要与文件夹**。
 *
 * 供「本地缓存最新页消息」开关关闭时调用：读写两侧都关了之后，残留的轮次行谁都不会
 * 再碰，但仍占存储、还会被清除缓存页算进条数，成为一个删不掉又说不清来源的数字。
 *
 * 摘要（`conversations`）不能一起删 —— 会话列表的标题、状态、未读都在那张表上，
 * 删了会让列表在离线时整个空白，那与这个开关的语义无关。
 */
export async function clearCachedConversationTurns() {
  await sqliteDriver.transaction(async () => {
    await sqliteDriver.execute(`DELETE FROM conversation_parts`)
    await sqliteDriver.execute(`DELETE FROM conversation_turns`)
  })
}

export async function upsertConversationSummary(input: ConversationSummaryRecord) {
  await upsertConversationSummaryInternal(input)
}

export async function upsertConversationSummaries(inputs: ConversationSummaryRecord[]) {
  if (inputs.length === 0) return

  await sqliteDriver.transaction(async () => {
    for (const input of inputs) {
      await upsertConversationSummaryInternal(input)
    }
  })
}

async function upsertConversationSummaryInternal(input: ConversationSummaryRecord) {
  const current = await getConversationSummaryById(input.instanceKey, input.id)
  const next = current
    ? mergeConversationSummaryRecord(current, input)
    : normalizeConversationSummaryRecord(input)

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
      next.id,
      next.instanceKey,
      next.folderId,
      next.title,
      next.agentType,
      next.externalId ?? null,
      next.connectionId ?? null,
      next.status,
      next.lastTurnId ?? null,
      next.lastMessageAt,
      next.unreadCount,
      next.isPinned ? 1 : 0,
      next.deletedAt ?? null,
      next.updatedAt,
    ]
  )
}

export async function patchConversationSummaryStatus(input: {
  instanceKey: string
  conversationId: number
  status: string
  updatedAt?: number
}) {
  const current = await getConversationSummaryById(input.instanceKey, input.conversationId)
  if (!current) return false

  const nextUpdatedAt = normalizeTimestamp(input.updatedAt, Date.now())
  const nextStatus = mergeConversationSummaryStatus({
    currentStatus: current.status,
    currentUpdatedAt: current.updatedAt,
    incomingStatus: input.status,
    incomingUpdatedAt: nextUpdatedAt,
  })

  await sqliteDriver.execute(
    `
      UPDATE conversations
      SET status = ?, updated_at = ?
      WHERE instance_key = ? AND id = ? AND deleted_at IS NULL
    `,
    [nextStatus, nextUpdatedAt, input.instanceKey, input.conversationId]
  )

  return true
}

export async function markConversationSummaryDeleted(input: {
  instanceKey: string
  conversationId: number
  deletedAt?: number
}) {
  const deletedAt = normalizeTimestamp(input.deletedAt, Date.now())
  await sqliteDriver.execute(
    `
      UPDATE conversations
      SET deleted_at = ?, updated_at = ?
      WHERE instance_key = ? AND id = ?
    `,
    [deletedAt, deletedAt, input.instanceKey, input.conversationId]
  )
}

/**
 * 把某个 folder 下**远端没有返回**的会话打上墓碑，返回受影响的行数。
 *
 * 为什么需要它：摘要缓存原先只有 upsert（`upsertConversationSummaryInternal`）和
 * 单条墓碑（`markConversationSummaryDeleted`，唯一调用点是 `conversation://changed`
 * 的 `deleted` 分支）。服务端在没有订阅者时根本不入队事件，所以断线期间被删掉的会话
 * **永远**收不到那条 `deleted` —— 纯 upsert 清不掉本地那行，它会一直显示成一张点进去
 * 404 的卡。重连后必须靠「远端全集」反向对账。
 *
 * ⚠️ `presentIds` 为空时**一行都不动**。空数组会让 `NOT IN ()` 退化成「删掉该 folder
 * 的全部会话」，而空响应最可能的原因是请求失败或该 folder 确实为空 —— 两者都绝不该
 * 触发全清。这是这个函数里唯一能造成数据损坏的分支。
 *
 * 调用方必须把范围限定在**刚刚查询过的** folder 上：`list_all_conversations` 按
 * `folderIds` 过滤，响应只对这些 folder 权威；而且 `include_children` 服务端默认 false，
 * 子会话不在响应里，不能被对账掉。
 */
export async function markMissingConversationSummariesDeleted(input: {
  instanceKey: string
  folderId: number
  presentIds: number[]
  deletedAt?: number
}): Promise<number> {
  const instanceKey = String(input.instanceKey || "").trim()
  if (!instanceKey) return 0

  const folderId = Number(input.folderId)
  if (!Number.isFinite(folderId)) return 0

  // 去重 + 取整：id 要直接拼进 SQL，必须先证明它们都是整数。
  const presentIds = Array.from(
    new Set(
      (Array.isArray(input.presentIds) ? input.presentIds : [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => Math.trunc(value))
    )
  )
  // 见上：空集合意味着「无从判断谁该留下」，不是「全都该删」。
  if (presentIds.length === 0) return 0

  const deletedAt = normalizeTimestamp(input.deletedAt, Date.now())
  const normalizedFolderId = Math.trunc(folderId)

  // 先查出将被打墓碑的 id 再 UPDATE：`SqliteDriver.execute` 返回 `Promise<void>`
  // （`services/db/sqlite.ts:8`），拿不到 rowsAffected。多一次 SELECT 换来一个真实的
  // 返回值 —— 调用方要靠它写日志，测试也要靠它断言「空集合时一行都没动」。
  const doomed = await sqliteDriver.query<{ id: number }>(
    `
      SELECT id
      FROM conversations
      WHERE instance_key = ?
        AND folder_id = ?
        AND deleted_at IS NULL
        AND id NOT IN (${presentIds.join(",")})
    `,
    [instanceKey, normalizedFolderId]
  )
  if (doomed.length === 0) return 0

  await sqliteDriver.execute(
    `
      UPDATE conversations
      SET deleted_at = ?, updated_at = ?
      WHERE instance_key = ?
        AND folder_id = ?
        AND deleted_at IS NULL
        AND id NOT IN (${presentIds.join(",")})
    `,
    [deletedAt, deletedAt, instanceKey, normalizedFolderId]
  )

  return doomed.length
}

function mergeConversationSummaryRecord(
  currentInput: ConversationSummaryRecord,
  incomingInput: ConversationSummaryRecord
): ConversationSummaryRecord {
  const current = normalizeConversationSummaryRecord(currentInput)
  const incoming = normalizeConversationSummaryRecord(incomingInput)
  const incomingIsNewer = incoming.updatedAt >= current.updatedAt

  return {
    id: current.id,
    instanceKey: current.instanceKey,
    folderId: incomingIsNewer
      ? pickFolderId(incoming.folderId, current.folderId)
      : pickFolderId(current.folderId, incoming.folderId),
    title: incomingIsNewer
      ? pickString(incoming.title, current.title) || `会话 #${current.id}`
      : pickString(current.title, incoming.title) || `会话 #${current.id}`,
    agentType: incomingIsNewer
      ? pickString(incoming.agentType, current.agentType) || "claude_code"
      : pickString(current.agentType, incoming.agentType) || "claude_code",
    externalId: incomingIsNewer
      ? pickOptionalString(incoming.externalId, current.externalId)
      : pickOptionalString(current.externalId, incoming.externalId),
    connectionId: incomingIsNewer
      ? pickOptionalString(incoming.connectionId, current.connectionId)
      : pickOptionalString(current.connectionId, incoming.connectionId),
    status: mergeConversationSummaryStatus({
      currentStatus: current.status,
      currentUpdatedAt: current.updatedAt,
      incomingStatus: incoming.status,
      incomingUpdatedAt: incoming.updatedAt,
    }),
    lastTurnId: incomingIsNewer
      ? pickOptionalString(incoming.lastTurnId, current.lastTurnId)
      : pickOptionalString(current.lastTurnId, incoming.lastTurnId),
    lastMessageAt: Math.max(current.lastMessageAt, incoming.lastMessageAt),
    unreadCount: incomingIsNewer ? incoming.unreadCount : current.unreadCount,
    isPinned: incomingIsNewer ? incoming.isPinned : current.isPinned,
    deletedAt: incomingIsNewer ? incoming.deletedAt ?? null : current.deletedAt ?? null,
    updatedAt: Math.max(current.updatedAt, incoming.updatedAt),
  }
}

function normalizeConversationSummaryRecord(
  input: ConversationSummaryRecord
): ConversationSummaryRecord {
  const lastMessageAt = normalizeTimestamp(input.lastMessageAt, Date.now())
  const updatedAt = normalizeTimestamp(input.updatedAt, lastMessageAt)
  return {
    ...input,
    folderId: pickFolderId(input.folderId, 0),
    title: pickString(input.title) || `会话 #${input.id}`,
    agentType: pickString(input.agentType) || "claude_code",
    externalId: pickOptionalString(input.externalId),
    connectionId: pickOptionalString(input.connectionId),
    status: normalizeConversationSummaryStatus(input.status),
    lastTurnId: pickOptionalString(input.lastTurnId),
    lastMessageAt,
    unreadCount: normalizeCount(input.unreadCount),
    isPinned: Boolean(input.isPinned),
    deletedAt: normalizeOptionalTimestamp(input.deletedAt),
    updatedAt,
  }
}

function pickString(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }
  return ""
}

function pickOptionalString(...values: Array<string | null | undefined>) {
  const next = pickString(...values)
  return next || null
}

function pickFolderId(...values: Array<number | null | undefined>) {
  for (const value of values) {
    const next = Number(value || 0)
    if (Number.isFinite(next) && next > 0) {
      return next
    }
  }
  return 0
}

function normalizeCount(value: number | null | undefined) {
  const next = Number(value || 0)
  if (!Number.isFinite(next) || next < 0) return 0
  return Math.floor(next)
}

function normalizeTimestamp(value: number | null | undefined, fallback: number) {
  const next = Number(value || 0)
  if (Number.isFinite(next) && next > 0) {
    return next
  }
  return fallback
}

function normalizeOptionalTimestamp(value: number | null | undefined) {
  const next = Number(value || 0)
  if (Number.isFinite(next) && next > 0) {
    return next
  }
  return null
}

export async function insertCompletedTurn(input: PersistedTurnRecord) {
  await sqliteDriver.transaction(async () => {
    await upsertCompletedTurn(input)
  })
}

async function upsertCompletedTurn(input: PersistedTurnRecord) {
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
