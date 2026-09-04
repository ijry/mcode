import type { AsyncTaskRecord, BackgroundSettledEntry } from "@/types/acp"
import { liveAsyncTasks } from "@/services/conversation/asyncTasks"
import { formatTokenCountK } from "./detailRuntimePresentation"

/**
 * 详情页「后台任务」呈现层：纯函数，不碰 store / uni API。
 *
 * 两条数据来源在这里汇合，**它们的覆盖面不同，必须都要**：
 *
 * | 来源 | 覆盖 | 拿得到详情吗 |
 * | --- | --- | --- |
 * | `asyncTasks`（AIR 通道 `async_task` + 快照 `async_tasks`） | `run_in_background` 的 shell、workflow、monitor | 能：名字、上一个工具、tokens、能否停止 |
 * | `backgroundOutstanding`（转录派生 `background_activity.outstanding`） | **异步子智能体也算在内** | 不能：只有一个数字 |
 *
 * 所以「计数 > 清单行数」是**正常情形**而不是 bug：子智能体走 subagent 通道，adapter 明确在
 * AIR 通道忽略 `taskType: "local_agent"`。UI 必须能表达「还有 N 个后台任务，但没有详情」，
 * 否则用户会以为清单是全部，然后在真正还有活的时候合上电脑。
 */

/** adapter 的 `taskType` 词表（已是友好名）。未知的新类型原样显示，不吞掉。 */
const TASK_TYPE_LABELS: Record<string, string> = {
  shell: "命令",
  workflow: "工作流",
  monitor: "监视器",
  task: "任务",
}

export function asyncTaskTypeLabel(taskType: string): string {
  const key = String(taskType || "").trim().toLowerCase()
  return TASK_TYPE_LABELS[key] || (key ? key : "任务")
}

export function formatAsyncTaskDuration(ms?: number | null): string {
  const value = Number(ms || 0)
  if (!Number.isFinite(value) || value <= 0) return ""
  if (value < 1000) return `${Math.round(value)}ms`
  const seconds = value / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds - minutes * 60)
  if (rest === 0) return `${minutes}m`
  return `${minutes}m${rest}s`
}

export interface BackgroundTaskRow {
  taskId: string
  name: string
  typeLabel: string
  /** `running` / `paused` / 未知活跃态，决定圆点样式与是否转圈。 */
  stateClass: "running" | "paused"
  stateLabel: string
  /** 「还在推进吗」的证据行：上一个工具 · tokens · 耗时。首次进度 tick 之前全为空。 */
  metaText: string
  canStop: boolean
}

/**
 * 清单行。**只列非终态**（`liveAsyncTasks`）：结算的任务立即离开，它的结果归时间线。
 *
 * `paused` 不转圈也不算「跑」，但仍要列出来 —— 它没结束，用户可能想停掉它。
 */
export function buildBackgroundTaskRows(
  tasks: AsyncTaskRecord[] | null | undefined
): BackgroundTaskRow[] {
  return liveAsyncTasks(tasks).map((task) => {
    const paused = task.state === "paused"
    const meta: string[] = []
    if (task.lastToolName) meta.push(task.lastToolName)
    if (task.usage) {
      if (task.usage.totalTokens > 0) meta.push(`${formatTokenCountK(task.usage.totalTokens)} tokens`)
      const duration = formatAsyncTaskDuration(task.usage.durationMs)
      if (duration) meta.push(duration)
    }
    return {
      taskId: task.taskId,
      name: task.name || "后台任务",
      typeLabel: asyncTaskTypeLabel(task.taskType),
      stateClass: paused ? "paused" : "running",
      stateLabel: paused ? "已暂停" : "运行中",
      metaText: meta.join(" · "),
      canStop: task.canStop === true,
    }
  })
}

export interface BackgroundTaskSummary {
  /** 胶囊要不要出现。 */
  visible: boolean
  /** 展示用的数量：取「转录计数」与「清单行数」的较大者，见下方说明。 */
  count: number
  /** 胶囊文案，如 `后台 2`。 */
  chipLabel: string
  rows: BackgroundTaskRow[]
  /** 有计数但清单覆盖不到的条数（子智能体一类），0 表示清单是全的。 */
  detaillessCount: number
  /** 抽屉里的解释行；没有缺口时为空串。 */
  hint: string
}

/**
 * 汇总胶囊与抽屉内容。
 *
 * **取两个来源的较大者**，因为它们各有各的盲区：转录记账看得见子智能体但看不见
 * AIR 任务的细节；AIR 表看得见细节但**完全不含**子智能体。取 max 而不是相加 ——
 * 一个 `run_in_background` 的 shell 会同时出现在两边（转录里有它的
 * `backgroundTaskId` 回执，AIR 通道也宣告它），相加会翻倍。服务端
 * `has_active_background_work` 出于同一个理由用 OR 而不是求和
 * （`codeg-plus/src-tauri/src/acp/session_state.rs:1316-1346`）。
 */
export function buildBackgroundTaskSummary(input: {
  outstanding?: number | null
  tasks?: AsyncTaskRecord[] | null
}): BackgroundTaskSummary {
  const rows = buildBackgroundTaskRows(input.tasks)
  const outstanding = Number.isFinite(Number(input.outstanding))
    ? Math.max(0, Math.trunc(Number(input.outstanding)))
    : 0
  const count = Math.max(outstanding, rows.length)
  const detaillessCount = Math.max(0, count - rows.length)
  return {
    visible: count > 0,
    count,
    chipLabel: `后台 ${count}`,
    rows,
    detaillessCount,
    hint:
      detaillessCount > 0
        ? rows.length > 0
          ? `另有 ${detaillessCount} 个后台任务（异步子智能体）只上报数量，没有明细。`
          : `${detaillessCount} 个后台任务（异步子智能体）只上报数量，没有明细。`
        : "",
  }
}

/**
 * 「轮次结束但后台还有活」—— 状态胶囊要不要改口。
 *
 * 判据故意只认**空闲侧**的状态：`connected` / `idle` 才需要改口，`thinking` /
 * `running_tool` 本来就在说「在跑」，覆盖它反而丢掉了「模型正在写」这个更强的信息；
 * `error` / `disconnected` 更不能被一句「后台运行中」盖住。
 */
export function shouldShowBackgroundBusyStatus(input: {
  runtimeStatus: string
  backgroundCount: number
}): boolean {
  if (input.backgroundCount <= 0) return false
  return input.runtimeStatus === "connected" || input.runtimeStatus === "idle"
}

export function backgroundBusyStatusLabel(count: number): string {
  return count > 0 ? `后台运行中 ${count}` : ""
}

/** 结算提示文案。`completed` 之外一律按失败措辞 —— `status` 是通知原文，不做白名单猜测。 */
export function buildBackgroundSettledText(entry: BackgroundSettledEntry | null | undefined): string {
  if (!entry) return ""
  const succeeded = entry.status === "completed"
  const head = succeeded ? "后台任务已完成" : `后台任务${entry.status === "unknown" ? "已结束" : "未成功"}`
  const summary = (entry.summary || "").trim()
  return summary ? `${head}：${summary}` : head
}
