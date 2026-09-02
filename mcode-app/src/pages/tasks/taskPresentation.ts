import type { WorkTask, WorkTaskEvent } from "@/types/workTask"
import { groupForStatus, type TaskTabId } from "./taskStatus"

/**
 * 任务列表的**全部可见派生**：过滤、排序、卡片文案、推进记录标签。
 *
 * 与 `pages/conversations/conversationOverviewPresentation.ts` 同一条约定：页面留着
 * 响应式与路由，派生逻辑放在这个纯模块里（不 import uni / pinia / 组件），
 * 于是它能裸测，而页面只剩「把 ref 喂进来、把结果渲染出去」。
 */

export interface TaskListFilter {
  /** 当前 tab。`all` 不按状态过滤。 */
  tab: TaskTabId
  keyword: string
  /** 只看某个连接（连接键）；空串 = 全部连接。 */
  connectionKey: string
  /** 只看某个项目（folder_id）；0 = 该连接下全部项目。 */
  folderId: number
  /** 显示已取消（默认显示，与 PC 端一致）。 */
  showCanceled: boolean
  /** 显示已归档（默认隐藏）。 */
  showArchived: boolean
}

export const DEFAULT_TASK_LIST_FILTER: TaskListFilter = {
  tab: "all",
  keyword: "",
  connectionKey: "",
  folderId: 0,
  showCanceled: true,
  showArchived: false,
}

/** 列表里的一条任务，连同它属于哪个连接 —— 一个列表要能同时装下多台连接的任务。 */
export interface TaskListEntry {
  task: WorkTask
  /** 所属连接键（`buildConnectionKey` 的结果）。 */
  connectionKey: string
  /** 连接显示名。 */
  connectionName: string
  /** 项目（文件夹）显示名；解析不到时为空串。 */
  folderName: string
}

/**
 * 过滤 + 排序。
 *
 * 排序一律 **`updated_at` 倒序**（刚动过的在最上面），与 PC 端每一列的顺序一致。
 * 这是列表页唯一合理的默认：手机上没有看板列，用户滑到顶就想看到最新变化。
 *
 * 可见性两道闸与 PC 端同源：`canceled` 默认显示、`archived` 默认隐藏。归档是终态
 * 专属，所以两者不会同时命中同一行的不同判断。
 */
export function filterTaskEntries(
  entries: TaskListEntry[],
  filter: TaskListFilter
): TaskListEntry[] {
  const needle = filter.keyword.trim().toLowerCase()
  return entries
    .filter((entry) => {
      const task = entry.task
      if (task.status === "canceled" && !filter.showCanceled) return false
      if (task.archived_at != null && !filter.showArchived) return false
      if (filter.tab !== "all" && groupForStatus(task.status) !== filter.tab) {
        return false
      }
      if (filter.connectionKey && entry.connectionKey !== filter.connectionKey) {
        return false
      }
      if (filter.folderId > 0 && task.folder_id !== filter.folderId) return false
      if (!needle) return true
      // 搜索覆盖标题、描述、分支、项目名 —— 用户记得住的四种指认方式。
      const haystack = [
        task.title,
        task.config?.display_text || "",
        task.work_branch || "",
        entry.folderName,
      ]
        .join("\n")
        .toLowerCase()
      return haystack.includes(needle)
    })
    .sort((left, right) => parseTimestamp(right.task.updated_at) - parseTimestamp(left.task.updated_at))
}

/** 每个 tab 的数量（不受 tab 本身影响，其余过滤条件照用）—— tab 上的角标。 */
export function countTaskEntriesByTab(
  entries: TaskListEntry[],
  filter: TaskListFilter
): Record<TaskTabId, number> {
  const base = filterTaskEntries(entries, { ...filter, tab: "all" })
  const counts: Record<TaskTabId, number> = {
    all: base.length,
    todo: 0,
    inProgress: 0,
    attention: 0,
    done: 0,
  }
  base.forEach((entry) => {
    counts[groupForStatus(entry.task.status)] += 1
  })
  return counts
}

/** 空列表时该说什么 —— 「没有任务」和「筛掉了」是两回事。 */
export function resolveTaskListEmptyText(filter: TaskListFilter, hasAnyTask: boolean): string {
  if (!hasAnyTask) return "还没有任务"
  if (filter.keyword.trim()) return "没有匹配的任务"
  if (filter.tab !== "all") return "该状态下暂无任务"
  if (filter.connectionKey || filter.folderId > 0) return "当前筛选下暂无任务"
  if (!filter.showArchived) return "任务都已归档，可在筛选里打开「显示已归档」"
  return "暂无任务"
}

/**
 * 卡片时间戳取哪个字段：完成 → 落定 → 开始 → 创建。
 * 与 PC 端卡片一致 —— 它回答的是「这张卡片上一次发生事情是什么时候」。
 */
export function taskCardTimestamp(task: WorkTask): string {
  return task.finished_at || task.settled_at || task.started_at || task.created_at || ""
}

/** 相对时间。超过 7 天就给日期 —— 「23 天前」不如「08-10」有用。 */
export function formatRelativeTime(value: string, now = Date.now()): string {
  const timestamp = parseTimestamp(value)
  if (!timestamp) return ""
  const diff = now - timestamp
  if (diff < 0) return formatDateTime(value)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return "刚刚"
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`
  return formatDay(value)
}

export function formatDay(value: string): string {
  const timestamp = parseTimestamp(value)
  if (!timestamp) return ""
  const date = new Date(timestamp)
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${month}-${day}`
}

export function formatDateTime(value: string): string {
  const timestamp = parseTimestamp(value)
  if (!timestamp) return ""
  const date = new Date(timestamp)
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  const hours = `${date.getHours()}`.padStart(2, "0")
  const minutes = `${date.getMinutes()}`.padStart(2, "0")
  return `${month}-${day} ${hours}:${minutes}`
}

/** 只要时刻的 HH:mm —— 推进记录的时间沟。 */
export function formatClock(value: string): string {
  const timestamp = parseTimestamp(value)
  if (!timestamp) return ""
  const date = new Date(timestamp)
  const hours = `${date.getHours()}`.padStart(2, "0")
  const minutes = `${date.getMinutes()}`.padStart(2, "0")
  return `${hours}:${minutes}`
}

/**
 * 卡片副行：任务此刻最值得说的一句话。
 *
 * 优先级：错误 → 实时进展 → 结果摘要。三者都是「一句话说明这张卡为什么长这样」，
 * 但错误必须最先出现 —— 它是唯一需要用户立刻做点什么的。
 */
export function taskCardNote(task: WorkTask): { text: string; tone: "error" | "progress" | "summary" } | null {
  const showError =
    task.last_error && (task.status === "failed" || task.status === "review")
  if (showError) return { text: task.last_error as string, tone: "error" }
  const live =
    task.status === "running" ||
    task.status === "awaiting_input" ||
    task.status === "merging"
  if (live && task.latest_progress) {
    return { text: task.latest_progress, tone: "progress" }
  }
  if (task.status === "review" && task.result_summary) {
    return { text: task.result_summary, tone: "summary" }
  }
  return null
}

/** 变更规模，没有改动时返回 null（不画一个 `+0 -0` 的空壳）。 */
export function taskDiffStat(
  task: WorkTask
): { additions: number; deletions: number } | null {
  if (task.files_changed == null || task.files_changed <= 0) return null
  return { additions: task.additions ?? 0, deletions: task.deletions ?? 0 }
}

const EVENT_KIND_LABELS: Record<string, string> = {
  created: "已创建",
  status_changed: "状态变更",
  config_effective: "启动配置",
  init_command: "初始化命令",
  agent_progress: "Agent 进展",
  agent_verdict: "Agent 结论",
  merge_attempt: "开始合并",
  merge_queued: "加入合并队列",
  merge_conflict: "合并冲突",
  preflight_result: "预检",
  cleanup_failed: "worktree 清理失败",
  resume_fallback: "会话恢复失败，已改用新会话",
  user_action: "用户操作",
  diff_stat: "变更快照",
  forge_writeback: "已回写评论",
  forge_writeback_failed: "回写评论失败",
}

export function taskEventLabel(event: WorkTaskEvent): string {
  return EVENT_KIND_LABELS[event.kind] || event.kind
}

/**
 * 推进记录的一行细节（尽力而为，schema 宽松 —— 服务端会加字段，缺了就不显示）。
 */
export function taskEventDetail(event: WorkTaskEvent): string {
  const payload = event.payload
  if (!payload) return ""
  const str = (key: string) =>
    typeof payload[key] === "string" ? (payload[key] as string) : ""
  switch (event.kind) {
    case "status_changed": {
      const note = str("error") || str("reason")
      return note
    }
    case "init_command": {
      const exit =
        typeof payload.exit_code === "number" ? `exit ${payload.exit_code}` : ""
      return [str("command"), exit].filter(Boolean).join(" · ")
    }
    case "config_effective":
      return [str("agent"), str("model")].filter(Boolean).join(" · ")
    case "agent_progress":
      return str("message")
    case "agent_verdict":
      return [str("verdict"), str("summary")].filter(Boolean).join(" · ")
    case "merge_attempt":
      return str("strategy")
    case "merge_conflict": {
      const files = Array.isArray(payload.files) ? (payload.files as string[]) : []
      return files.join(", ")
    }
    case "preflight_result":
      return [str("command"), str("status")].filter(Boolean).join(" · ")
    case "cleanup_failed":
      return str("error")
    case "user_action":
      return [str("action"), str("intent"), str("note")].filter(Boolean).join(" · ")
    default:
      return str("message") || str("detail") || ""
  }
}

/**
 * `status_changed` 事件里迁移到了哪个状态 —— 详情页把它渲染成分段标题。
 * 空串表示 payload 里没有可用的 `to`。
 */
export function taskEventTargetStatus(event: WorkTaskEvent): string {
  if (event.kind !== "status_changed") return ""
  const payload = event.payload
  if (!payload) return ""
  return typeof payload.to === "string" ? payload.to : ""
}

/**
 * 推进记录里要不要显示这一条。`round` 被过滤掉：它是给会话回放做阶段分隔的，
 * 在推进记录里没有信息量（状态变更已经分好段了）。
 */
export function isVisibleTaskEvent(event: WorkTaskEvent): boolean {
  return event.kind !== "round"
}

export function parseTimestamp(value?: string | null): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}
