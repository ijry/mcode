import type { SessionFailureRecord } from "@/types/acp"

/**
 * JetBrains AIR 结构化会话失败记录的归一化与单调合并。
 *
 * 抽成纯模块是因为**同一套合并规则有两条入口**：attach 快照里的 `session_failures`
 * 整张表，和实时的 `SessionFailure` 事件逐条 upsert。服务端明确要求两侧行为一致
 * （`codeg-plus/src-tauri/src/acp/types.rs:330-338`：「stale-revision rejection happens
 * identically in `SessionState::apply_event` (snapshot) and the frontend reducer (live)」）。
 * 写两份实现必然漂移，而漂移的症状是重复行或幽灵记录 —— 都不报错。
 *
 * 为什么值得接这条通道：它是 codex 重试横幅的**唯一**来源（声明 AIR 之后
 * `_meta.codex.error` / `TurnRetrying` 都不再发），而且**在 attach 快照里**，
 * 所以冷启动就能拿到 —— 不像 Claude 的 `api_retry` 那样必须等下一次事件。
 * 它还带 `actions`（`retry|login|new_session`），是「该不该给重连入口」的权威依据，
 * 比从错误文案里猜可靠得多。
 */

/** 目前已知的 category 取值。未知值要退化成兜底文案，不能解析失败。 */
const CATEGORY_LABELS: Record<string, string> = {
  connection: "连接异常",
  access: "访问被拒绝",
  limit: "已达用量上限",
  request: "请求有误",
  service: "服务端异常",
  unknown: "未知错误",
}

export function normalizeSessionFailureRecord(raw: unknown): SessionFailureRecord | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>

  const id = typeof record.id === "string" ? record.id.trim() : ""
  if (!id) return null

  // revision 从 1 开始。0 或缺失说明这条记录不可用于单调合并 —— 宁可丢弃也不要让它
  // 参与比较，否则后续任何一条都会被判成「更新」。
  const revision = Number(record.revision)
  if (!Number.isFinite(revision) || revision < 1) return null

  return {
    id,
    revision: Math.trunc(revision),
    category: typeof record.category === "string" ? record.category.trim() : "unknown",
    severity: typeof record.severity === "string" ? record.severity.trim() : "error",
    title: typeof record.title === "string" ? record.title.trim() : "",
    details:
      typeof record.details === "string" && record.details.trim()
        ? record.details
        : undefined,
    actions: Array.isArray(record.actions)
      ? record.actions
          .map((action) => (typeof action === "string" ? action.trim() : ""))
          .filter(Boolean)
      : [],
    // 线上永远没有这个字段，一律从 false 起算（见类型说明）。
    resolved: false,
  }
}

/**
 * 把一条 upsert 合进现有表，返回是否真的改变了状态。
 *
 * **`revision` 必须严格大于**已存的那条。相等也要拒绝：一条 upsert 只会被原样重播，
 * 不会在同一 revision 上被合法修订。适配器在 `session/load` 时会重播仍然活跃的失败，
 * 不拒绝就会把 `resolved` 抖回 false，让一条已经恢复的警告重新亮起来。
 *
 * 更高 revision 的 upsert 会**重新激活**（`resolved` 回到 false）—— codex 就是靠
 * id 复用把一条重试警告升级成本回合的终止错误。
 */
export function mergeSessionFailure(
  current: SessionFailureRecord[],
  incoming: SessionFailureRecord
): { records: SessionFailureRecord[]; changed: boolean } {
  const index = current.findIndex((item) => item.id === incoming.id)
  if (index < 0) {
    return { records: [...current, incoming], changed: true }
  }
  if (incoming.revision <= current[index].revision) {
    return { records: current, changed: false }
  }
  const records = current.slice()
  records.splice(index, 1, incoming)
  return { records, changed: true }
}

/**
 * 用快照里的整张表替换本地表，但**保留本地推断出的 `resolved`**。
 *
 * `resolved` 不在线上，只能由客户端推断（`warning` 记录在下一次成功回合结束时翻转）。
 * 快照里每条都是 `false`，直接整表替换会让已经恢复的警告在每次 attach 后复活。
 *
 * 仍然逐条走 revision 比较：快照可能比本地更旧（重连时 attach 与实时事件竞争）。
 */
export function mergeSessionFailureSnapshot(
  current: SessionFailureRecord[],
  snapshotRecords: SessionFailureRecord[]
): SessionFailureRecord[] {
  let records = current
  for (const incoming of snapshotRecords) {
    const existing = records.find((item) => item.id === incoming.id)
    if (existing && incoming.revision <= existing.revision) continue
    const merged = mergeSessionFailure(records, incoming)
    records = merged.records
  }
  return records
}

/**
 * 一次成功的回合结束：把 `warning` 记录标记为已解决。
 *
 * **`error` 记录不动** —— 服务端刻意让终止性失败保持活跃（`types.rs:67-69`），
 * 它们要等用户实际处理（重连/重新登录/开新会话）。把它们一起清掉等于把一个还没解决
 * 的问题从界面上抹掉。
 */
export function settleRecoveredSessionFailures(
  records: SessionFailureRecord[]
): SessionFailureRecord[] {
  let changed = false
  const next = records.map((record) => {
    if (record.severity !== "warning" || record.resolved) return record
    changed = true
    return { ...record, resolved: true }
  })
  return changed ? next : records
}

/** 当前仍然活跃（未解决）的记录，最高 revision 优先，用于驱动状态胶囊。 */
export function activeSessionFailures(records: SessionFailureRecord[]) {
  return records.filter((record) => !record.resolved)
}

/**
 * 挑一条最该展示的失败记录。
 *
 * `error` 优先于 `warning`：终止性失败需要用户处理，瞬态重试会自己好。同级里取
 * **最后一条**（数组顺序即到达顺序），最新的信息更可能是当下的真实情况。
 */
export function primarySessionFailure(
  records: SessionFailureRecord[]
): SessionFailureRecord | null {
  const active = activeSessionFailures(records)
  if (active.length === 0) return null
  const terminal = active.filter((record) => record.severity === "error")
  const pool = terminal.length > 0 ? terminal : active
  return pool[pool.length - 1] ?? null
}

/** `title` 可能为空（服务端明说），那时退回 category 标签，绝不显示空白。 */
export function sessionFailureText(record: SessionFailureRecord): string {
  if (record.title) return record.title
  return CATEGORY_LABELS[record.category] || CATEGORY_LABELS.unknown
}

/**
 * 这条失败建议「重试」吗。
 *
 * 用它而不是从错误文案里猜关键字：`actions` 是适配器自己给的建议，服务端的词表是
 * `retry|login|new_session`。`login` / `new_session` 时给重连按钮是误导 ——
 * 重连不会解决登录过期或会话失效。
 */
export function sessionFailureSuggestsRetry(record: SessionFailureRecord): boolean {
  return record.actions.includes("retry")
}
