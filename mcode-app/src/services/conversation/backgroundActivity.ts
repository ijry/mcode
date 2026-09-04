import type { BackgroundActivityUpdate, BackgroundSettledEntry } from "@/types/acp"

/**
 * `background_activity` 的客户端归一化 —— 「轮次结束 ≠ 活干完」这件事的唯一来源。
 *
 * 服务端不是从 ACP 线上拿到这些的：Claude Code 的**出轮次活动**（异步子智能体的
 * `<task-notification>` 结算、后台 shell、cron//loop 自主轮次）在线上没有可靠表示，
 * codeg 只能 tail Claude 自己的 JSONL 转录（`codeg-plus/src-tauri/src/acp/background_watch.rs`），
 * 从 record 级 `toolUseResult` 的 `status:"async_launched"` / `backgroundTaskId` 记账 ——
 * **那两个字段只存在于磁盘，从不上线**。
 *
 * 载荷四个字段里 mcode 目前消费三个：
 *
 * | 字段 | 用途 |
 * | --- | --- |
 * | `outstanding` | 已启动未结算的后台任务数。轮次结束后它 > 0 就说明活还没干完 |
 * | `settled[]` | 本批结算掉的任务。桌面端**每条弹一次 OS 通知**；mcode 没有通知通道，只做页内提示 |
 * | `watermark` | 解析到的转录字节偏移，本期只记不用（`turns[]` 落地时才需要它退休 overlay） |
 *
 * **`turns[]` 刻意不消费。** 那是从转录尾解析出来的出轮次轮次，按 `MessageTurn.id`
 * （`bg-<episode-offset>-<idx>`）**upsert**、靠 `watermark` 与详情拉取对账退休。要正确落地它，
 * 得同时解决「与历史分页共存」「upsert 而非 append」「与 SQLite 缓存对账」三件事，
 * 属于独立一期。本期只做「有多少后台任务在跑」这一件事 —— 它才是会让用户误判
 * 「可以合电脑了」的那个信息缺口。
 *
 * 无依赖纯模块，便于裸测。
 */

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}

function toRecord(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, any>
}

export function normalizeBackgroundSettledEntry(raw: unknown): BackgroundSettledEntry | null {
  const source = toRecord(raw)
  if (!source) return null
  const taskId = firstString(source.task_id, source.taskId)
  if (!taskId) return null
  return {
    taskId,
    // `status` 是通知里的 `<status>` 原样透传，成功是 `"completed"`。缺失时不猜成功。
    status: firstString(source.status) || "unknown",
    summary: firstString(source.summary) ?? null,
    toolUseId: firstString(source.tool_use_id, source.toolUseId) ?? null,
    result: firstString(source.result) ?? null,
  }
}

/**
 * `outstanding` **缺失时留 `null` 而不是 0**：这两者语义完全不同 —— 0 是「后台已经空了」
 * （权威结论，会让 UI 收起胶囊），`null` 是「这一帧没说」。把缺失当 0 会让一条畸形帧
 * 把正在跑的后台任务从界面上抹掉。
 *
 * 两者都没有内容（既没报计数、也没有结算）时返回 null，调用方直接跳过。
 */
export function normalizeBackgroundActivity(raw: unknown): BackgroundActivityUpdate | null {
  const source = toRecord(raw)
  if (!source) return null
  const outstanding = firstNumber(source.outstanding)
  const settledRaw = Array.isArray(source.settled) ? source.settled : []
  const settled = settledRaw
    .map((entry: unknown) => normalizeBackgroundSettledEntry(entry))
    .filter(Boolean) as BackgroundSettledEntry[]
  if (outstanding == null && settled.length === 0) return null
  return {
    sessionId: firstString(source.session_id, source.sessionId) ?? null,
    outstanding: outstanding == null ? null : Math.max(0, Math.trunc(outstanding)),
    settled,
    watermark: firstNumber(source.watermark),
  }
}

/** `outstanding` 是不是这一帧真的报了。 */
export function hasOutstandingCount(update: BackgroundActivityUpdate | null | undefined): boolean {
  return Boolean(update && update.outstanding != null)
}

/**
 * 结算记录的滚动日志上限。
 *
 * 留 5 条：够覆盖「一批子智能体同时收工」的常见情形，又不至于让一个跑了几百个后台任务的
 * 长会话把 session 撑大。这张日志是**页内提示**用的，不是账本 —— 权威结果在时间线里。
 */
export const BACKGROUND_SETTLED_LOG_LIMIT = 5

/**
 * 追加结算记录，保留最新的若干条。**同一个 taskId 可以出现多次**（已完成的子智能体被
 * `SendMessage` 唤醒后会再通知一次），所以这里按到达顺序追加而不是按 id 去重。
 */
export function appendBackgroundSettled(
  current: BackgroundSettledEntry[] | null | undefined,
  incoming: BackgroundSettledEntry[] | null | undefined,
  limit = BACKGROUND_SETTLED_LOG_LIMIT
): BackgroundSettledEntry[] {
  const base = Array.isArray(current) ? current : []
  if (!incoming || incoming.length === 0) return base
  const merged = [...base, ...incoming]
  return limit > 0 ? merged.slice(-limit) : []
}
