import type { AsyncTaskDelta, AsyncTaskRecord, AsyncTaskUsage } from "@/types/acp"

/**
 * AIR 异步任务表的客户端半边 —— 与服务端 `SessionState::apply_event` 同一套合并规则。
 *
 * 线上（`async_task` 事件 / 快照的 `async_tasks`）给的是**按 id 的局部增量**：
 *
 * - **只有 `spawned` 的增量能建行。** 一条指向未知 id 的增量意味着它的宣告帧
 *   （唯一携带名字、类型、能否停止的那一帧）被漏掉了，而一个没名字的占位行比没有行更糟。
 * - **其余字段缺省即保持原值。** 进度 tick 只带变化的部分，把缺省当成「清空」会在第一次
 *   进度更新时把任务名擦掉。
 *
 * 行在结算后**保留**而不是删除：adapter 会继续修订已完成的任务 —— 补一个迟到的
 * `outputFilePath`，或把它按存活度猜出来的 `stopped` 纠正成真正的 `completed`/`failed`。
 * 被删掉的行会被它自己的纠正重新创建，而**身份是 `spawned` 携带的**，于是它会以无名状态回来。
 * 「显示什么」由 `liveAsyncTasks` 决定，这张表只负责「什么是真的」。
 *
 * 本模块保持无依赖（不 import store / uni API），便于裸测。
 * 参考实现：`codeg-plus/src/lib/async-tasks.ts`。
 */

/** adapter 不会再从这三个状态往回改。 */
const TERMINAL_STATES = new Set(["completed", "failed", "stopped"])

export function isAsyncTaskTerminal(task: Pick<AsyncTaskRecord, "state">): boolean {
  return TERMINAL_STATES.has(String(task?.state || ""))
}

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

function firstBoolean(...values: unknown[]): boolean | null {
  for (const value of values) {
    if (typeof value === "boolean") return value
  }
  return null
}

function toRecord(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, any>
}

/**
 * `usage` 三个字段在上游要么整体存在要么整个对象缺失，所以这里也**整体判定**：
 * 缺任何一个就返回 null，不拼半份出来（半份会让「0 tokens」看起来像真的测量结果）。
 */
function normalizeUsage(raw: unknown): AsyncTaskUsage | null {
  const source = toRecord(raw)
  if (!source) return null
  const totalTokens = firstNumber(source.total_tokens, source.totalTokens)
  const toolUses = firstNumber(source.tool_uses, source.toolUses)
  const durationMs = firstNumber(source.duration_ms, source.durationMs)
  if (totalTokens == null || toolUses == null || durationMs == null) return null
  return { totalTokens, toolUses, durationMs }
}

/**
 * 归一化一条线上增量。同时吃 snake_case（codeg 直连）与 camelCase（未来若有中间层改写）。
 *
 * **可选字段区分「缺省」与「显式值」**：`undefined` 表示这一帧没提，合并时保持原值；
 * `false` / `""` 是显式值，必须落地。所以这里用 `?? undefined` 而不是 `|| ""`。
 */
export function normalizeAsyncTaskDelta(raw: unknown): AsyncTaskDelta | null {
  const source = toRecord(raw)
  if (!source) return null
  const delta = toRecord(source.delta) || source
  const taskId = firstString(delta.task_id, delta.taskId)
  if (!taskId) return null
  return {
    taskId,
    spawned: firstBoolean(delta.spawned) === true,
    name: firstString(delta.name) ?? undefined,
    taskType: firstString(delta.task_type, delta.taskType) ?? undefined,
    description: firstString(delta.description) ?? undefined,
    showInTranscript:
      firstBoolean(delta.show_in_transcript, delta.showInTranscript) ?? undefined,
    canStop: firstBoolean(delta.can_stop, delta.canStop) ?? undefined,
    state: firstString(delta.state) ?? undefined,
    summary: firstString(delta.summary) ?? undefined,
    lastToolName: firstString(delta.last_tool_name, delta.lastToolName) ?? undefined,
    usage: normalizeUsage(delta.usage) ?? undefined,
    outputFilePath: firstString(delta.output_file_path, delta.outputFilePath) ?? undefined,
    toolCallId: firstString(delta.tool_call_id, delta.toolCallId) ?? undefined,
  }
}

/**
 * 归一化快照里的**整行**（服务端已经合并过），缺省字段在这里可以安全地取默认值 ——
 * 与 `recordFromDelta` 用同一份默认，两条路才会收敛到同一行。
 */
export function normalizeAsyncTaskRecord(raw: unknown): AsyncTaskRecord | null {
  const delta = normalizeAsyncTaskDelta(raw)
  if (!delta) return null
  return recordFromDelta({ ...delta, spawned: true })
}

/**
 * `spawned` 增量建出来的行。默认值存在的原因是线上每个字段各自可选，
 * **不是**因为「半宣告的任务」是预期情形。
 */
function recordFromDelta(delta: AsyncTaskDelta): AsyncTaskRecord {
  return {
    taskId: delta.taskId,
    name: delta.name ?? "后台任务",
    taskType: delta.taskType ?? "task",
    description: delta.description ?? "",
    showInTranscript: delta.showInTranscript ?? true,
    canStop: delta.canStop ?? false,
    state: delta.state ?? "running",
    summary: delta.summary ?? null,
    lastToolName: delta.lastToolName ?? null,
    usage: delta.usage ?? null,
    outputFilePath: delta.outputFilePath ?? null,
    toolCallId: delta.toolCallId ?? null,
  }
}

/** 把一条增量里**出现过的**字段贴到已有行上，返回新对象。 */
function applyDelta(stored: AsyncTaskRecord, delta: AsyncTaskDelta): AsyncTaskRecord {
  const next: AsyncTaskRecord = { ...stored }
  if (delta.name != null) next.name = delta.name
  if (delta.taskType != null) next.taskType = delta.taskType
  if (delta.description != null) next.description = delta.description
  if (delta.showInTranscript != null) next.showInTranscript = delta.showInTranscript
  if (delta.canStop != null) next.canStop = delta.canStop
  if (delta.state != null) next.state = delta.state
  if (delta.summary != null) next.summary = delta.summary
  if (delta.lastToolName != null) next.lastToolName = delta.lastToolName
  if (delta.usage != null) next.usage = delta.usage
  if (delta.outputFilePath != null) next.outputFilePath = delta.outputFilePath
  if (delta.toolCallId != null) next.toolCallId = delta.toolCallId
  return next
}

/**
 * 合并一条实时增量。**没变化时返回同一个数组引用**，让调用方能廉价判空转
 * （store 里据此避免无意义的 reactive 写入 → 无意义的重渲染）。
 */
export function upsertAsyncTask(
  current: AsyncTaskRecord[],
  delta: AsyncTaskDelta | null | undefined
): AsyncTaskRecord[] {
  if (!delta?.taskId) return current
  const index = current.findIndex((task) => task.taskId === delta.taskId)
  if (index < 0) {
    if (!delta.spawned) return current
    return [...current, recordFromDelta(delta)]
  }
  const next = [...current]
  next[index] = applyDelta(current[index], delta)
  return next
}

/**
 * 用快照的整表水合（**按 id 替换** + 追加未见过的 id）。
 *
 * **只能用于比本地游标更新的快照。** 行上没有版本号，「按 id 替换」只有在已知快照更新时
 * 才成立；已经被本地追过的旧快照走 `adoptUnknownAsyncTasks`。
 */
export function mergeAsyncTasks(
  current: AsyncTaskRecord[],
  incoming: AsyncTaskRecord[] | null | undefined
): AsyncTaskRecord[] {
  if (!incoming || incoming.length === 0) return current
  let next: AsyncTaskRecord[] | null = null
  for (const record of incoming) {
    if (!record?.taskId) continue
    const target = next ?? current
    const index = target.findIndex((task) => task.taskId === record.taskId)
    next ??= [...current]
    if (index >= 0) next[index] = record
    else next.push(record)
  }
  return next ?? current
}

/**
 * 把一份**陈旧**快照折进来，但**不允许它覆盖任何东西**。
 *
 * `eventSeq` 已被本地追过的快照是在那些增量**之前**生成的，它的行可能更旧 —— 按 id 替换会
 * 把一个本地已经看到跑完的任务走回 `running`，而那条实时终态事件不会被重放来纠正
 * （它的 seq 早已低于水位）。行上没有版本号，无法逐行判断哪个更新。
 *
 * 但**新增仍然安全且值得做**：中途 attach 的客户端从未见过早已在跑的任务的宣告帧，
 * 快照是它唯一的来源。所以只取我们没有的 id，已有的一律放过。
 */
export function adoptUnknownAsyncTasks(
  current: AsyncTaskRecord[],
  incoming: AsyncTaskRecord[] | null | undefined
): AsyncTaskRecord[] {
  if (!incoming || incoming.length === 0) return current
  let next: AsyncTaskRecord[] | null = null
  for (const record of incoming) {
    if (!record?.taskId) continue
    const target = next ?? current
    if (target.some((task) => task.taskId === record.taskId)) continue
    next ??= [...current]
    next.push(record)
  }
  return next ?? current
}

/**
 * 清单渲染的是「还在跑或暂停」的任务。
 *
 * 结算的行立刻消失。它们不会丢 —— 拥有 tool call 的任务在时间线里仍有卡片，智能体也会
 * 在正文里交代结果 —— 而一份永久增长的「已完成后台任务」清单会在长会话里无边界膨胀。
 * 与 AIR 自己的面板一致：停掉的任务「立即离开」。
 */
export function liveAsyncTasks(tasks: AsyncTaskRecord[] | null | undefined): AsyncTaskRecord[] {
  if (!Array.isArray(tasks)) return []
  return tasks.filter((task) => !isAsyncTaskTerminal(task))
}
