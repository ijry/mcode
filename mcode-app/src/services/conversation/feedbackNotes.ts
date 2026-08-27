import type { FeedbackNote } from "@/types/acp"

/**
 * 「本轮补充意见」便签的归一化与合并。
 *
 * 抽成纯模块的理由与 `sessionFailureRecords.ts` 相同：**同一套合并规则有两条入口** ——
 * attach 快照里的 `feedback` 整表，和实时的 `feedback_submitted` / `feedback_consumed`
 * 逐条 upsert。服务端两侧行为一致（`session_state.rs:1136` 的 `apply_event` 与
 * 广播走的是同一份状态），写两份实现必然漂移，而漂移的症状是重复行或幽灵便签
 * —— 都不报错。
 *
 * 便签是**轮次级瞬态**，不是历史：服务端明确不持久化，并在下一轮 `UserMessage` 清空。
 * 所以这里没有任何 SQLite 交互，也不参与轮次去重。
 *
 * 通道差异见 `FeedbackNote` 的类型说明 —— mcode 走 native，自己插入的便签**出生即
 * `delivered`**，永远不会收到自己的 `feedback_consumed`。
 */

/** 服务端 `FeedbackStatus` 的全部取值（snake_case 上线）。 */
const KNOWN_STATUSES = new Set<FeedbackNote["status"]>(["pending", "delivered"])

/**
 * 把线上的时间字段（ISO 串，也容忍毫秒数）转成毫秒时间戳。
 *
 * 解析不出来时返回 null 而不是 `Date.now()`：拿「现在」冒充「创建时刻」会让排序
 * 和「多久之前」的文案都错，而且错得看不出来。调用方自己决定兜底 —— `feedback_consumed`
 * 的处理里会退回 `Date.now()`，因为那个事件的语义就是「刚刚读走」。
 */
export function parseFeedbackInstant(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value)
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

/**
 * 归一化一条便签。snake_case 与 camelCase 双写都收（前者是线上形状，后者是本地
 * 乐观构造的形状）。
 *
 * 没有 `id` 或没有正文一律丢弃：`id` 是幂等的唯一依据，缺了它这条便签会在每次重放里
 * 重复 append。
 */
export function normalizeFeedbackNote(raw: unknown): FeedbackNote | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>

  const id = pickString(record.id)
  const text = pickString(record.text)
  if (!id || !text) return null

  // 未知状态退回 pending 而不是丢弃：那条便签确实存在，只是状态读不懂 ——
  // 显示成「等待读取」比让它消失好。
  const rawStatus = pickString(record.status) as FeedbackNote["status"]
  const status = KNOWN_STATUSES.has(rawStatus) ? rawStatus : "pending"

  // `pending` 时一律不采信 delivered_at：**状态才是权威**。服务端在 Pending 时不发
  // 这个字段（skip_serializing_if），万一发了也是协议漂移。
  const deliveredAt =
    status === "delivered"
      ? parseFeedbackInstant(record.delivered_at ?? record.deliveredAt)
      : null

  return {
    id,
    text,
    createdAt: parseFeedbackInstant(record.created_at ?? record.createdAt) ?? 0,
    status,
    deliveredAt,
  }
}

/**
 * 幂等 append 一条便签。
 *
 * **按 `id` 去重**，与服务端 `apply_event` 同语义（`session_state.rs:1141`）。三条路径
 * 都依赖它：事件重放、双 attach、以及「本地乐观 append + 随后到达的同 id 广播」。
 * 已存在时原样返回入参数组（引用相等），让 Vue 少一次无谓的重渲染。
 *
 * `consumedIds` 是**乱序墓碑**：`feedback_consumed` 可能先于 `feedback_submitted`
 * 到达（广播乱序，或快照还没水合）。不查墓碑的话，这条便签会以 `pending` 复活在
 * agent 已经读过之后 —— 界面显示「等待读取」，而它其实早就送到了。
 */
export function appendFeedbackNote(
  current: FeedbackNote[],
  note: FeedbackNote,
  consumedIds: Map<string, number>
): FeedbackNote[] {
  if (current.some((item) => item.id === note.id)) return current

  const consumedAt = consumedIds.get(note.id)
  const settled: FeedbackNote =
    consumedAt == null
      ? note
      : { ...note, status: "delivered", deliveredAt: note.deliveredAt ?? consumedAt }

  return [...current, settled]
}

/**
 * 把命名的 id 翻成 `delivered`。
 *
 * **不覆盖已有的 `deliveredAt`**：服务端的 commit 幂等且只广播真正翻转的 id，但重放
 * 和乱序仍可能让同一条 `consumed` 到两次 —— 覆盖会让「已读取」的时刻往后跳。
 *
 * 没有任何变化时返回入参数组（引用相等）。
 */
export function markFeedbackNotesDelivered(
  current: FeedbackNote[],
  ids: string[],
  deliveredAt: number
): FeedbackNote[] {
  if (ids.length === 0) return current
  const targets = new Set(ids)
  let changed = false
  const next = current.map((item) => {
    if (!targets.has(item.id)) return item
    // 已经有时刻的不动 —— 这一行就是「不覆盖」的全部实现。它同时保证了引用相等：
    // 所有目标都已送达时 `changed` 保持 false，整个数组原样返回。
    if (item.status === "delivered" && item.deliveredAt != null) return item
    changed = true
    return { ...item, status: "delivered" as const, deliveredAt }
  })
  return changed ? next : current
}

/**
 * 用快照补齐便签表。**实时优先** —— 这与 `nativeSteeringAvailable` 的规则相反，
 * 因为两者的「权威方」不同：
 *
 * - 能力位：服务端说了才算，所以单调升级、只认 true。
 * - 便签状态：实时流更新（快照可能停在 `pending`，而 `consumed` 事件已经到了），
 *   所以同 id 时保留实时那条，快照只补实时没有的 id。
 *
 * 快照仍然是**必需的**：冷启动 / 重连进一个进行中的会话时，一次性的
 * `feedback_submitted` 不会为你重放，快照是唯一来源（服务端注释写明了这个用意）。
 *
 * 空快照原样返回入参：服务端在列表为空时**不上线这个字段**
 * （`skip_serializing_if = "Vec::is_empty"`），所以「缺失」是常态，绝不能当成
 * 「服务端说没有便签」而清掉本地的。
 */
export function mergeFeedbackSnapshot(
  live: FeedbackNote[],
  snapshotNotes: FeedbackNote[]
): FeedbackNote[] {
  if (snapshotNotes.length === 0) return live

  const liveById = new Map(live.map((item) => [item.id, item]))
  const merged: FeedbackNote[] = []
  for (const note of snapshotNotes) {
    merged.push(liveById.get(note.id) ?? note)
    liveById.delete(note.id)
  }
  // 快照里没有、只在实时流里出现过的排在后面（保持到达顺序）。
  for (const note of live) {
    if (liveById.has(note.id)) merged.push(note)
  }
  return merged
}
