import type { WorkTask, WorkTaskStatus } from "@/types/workTask"

/**
 * 任务状态 → 展示分组的**唯一**映射，以及任务页顶部 up-tabs 的分组定义。
 *
 * 为什么是「分组」而不是十个状态各一个 tab：手机屏放不下十个 tab，而且十个状态里
 * 用户真正要区分的只有四件事 —— 还没开始 / 正在跑 / 等你处理 / 已经结束。这与 PC 端
 * 看板的四列是同一套词汇（`codeg-plus/src/components/tasks/board-columns.ts`），
 * 两端说的必须是同一件事，否则同一个任务在手机上叫「进行中」在电脑上叫「等你处理」。
 *
 * `STATUSES_BY_GROUP` 是规格表，`groupForStatus` 是被执行的那一份。测试断言两者一致
 * **且**每个 `WorkTaskStatus` 恰好出现一次 —— 这样新增状态却忘了归组会是测试失败，
 * 而不是任务从列表里静默消失。
 */

export type TaskStatusGroup = "todo" | "inProgress" | "attention" | "done"

/** 任务页 tab 的 id：`all` 是第一个 tab（全部），其余是四个分组。 */
export type TaskTabId = "all" | TaskStatusGroup

export const TASK_STATUS_GROUPS: TaskStatusGroup[] = [
  "todo",
  "inProgress",
  "attention",
  "done",
]

export const TASK_TAB_IDS: TaskTabId[] = ["all", ...TASK_STATUS_GROUPS]

export const STATUSES_BY_GROUP: Record<TaskStatusGroup, WorkTaskStatus[]> = {
  todo: ["todo", "queued"],
  inProgress: ["preparing", "running"],
  attention: ["awaiting_input", "review", "merging", "failed"],
  done: ["done", "canceled"],
}

/**
 * 状态 → 分组。
 *
 * 两个刻意的归类，与 PC 端逐字一致：
 * - `queued`（等并发槽）归「待办」而不是「进行中」—— 什么都还没发生。
 * - `merging` 归「等你处理」而不是「已完成」—— 合并本身是一次 agent 轮次，但卡片
 *   不能在用户点了合并之后就跳到另一个分组；它留在原处，落地后直接进「已完成」。
 *
 * 未知状态（服务端新增）归到「等你处理」：那是唯一一个「有人得看一眼」的分组，
 * 比塞进「已完成」安全 —— 后者会让一个还活着的任务看起来已经结束。
 */
export function groupForStatus(status: WorkTaskStatus | string): TaskStatusGroup {
  switch (status) {
    case "todo":
    case "queued":
      return "todo"
    case "preparing":
    case "running":
      return "inProgress"
    case "awaiting_input":
    case "review":
    case "merging":
    case "failed":
      return "attention"
    case "done":
    case "canceled":
      return "done"
    default:
      return "attention"
  }
}

const GROUP_LABELS: Record<TaskStatusGroup, string> = {
  todo: "待办",
  inProgress: "进行中",
  attention: "等你处理",
  done: "已完成",
}

const TAB_LABELS: Record<TaskTabId, string> = {
  all: "全部",
  ...GROUP_LABELS,
}

export function taskGroupLabel(group: TaskStatusGroup): string {
  return GROUP_LABELS[group]
}

export function taskTabLabel(tab: TaskTabId): string {
  return TAB_LABELS[tab] || tab
}

const STATUS_LABELS: Record<WorkTaskStatus, string> = {
  todo: "待办",
  queued: "排队中",
  preparing: "初始化中",
  running: "进行中",
  awaiting_input: "等待输入",
  review: "待验收",
  merging: "合并中",
  done: "已完成",
  failed: "失败",
  canceled: "已取消",
}

/**
 * 状态文案。被中断的失败（重启导致）与 agent 自己失败读起来是两回事，所以
 * `failure_reason === "interrupted"` 单独说。未知状态原样显示 —— 让用户看到
 * 一个陌生词，比看到一个错的词好。
 *
 * `status` 收宽到 `string`：推进记录里的 `status_changed.to` 是服务端写的裸字符串，
 * 详情页要用同一份文案把它渲染成分段标题，不能为此再抄一份映射表。
 */
export function taskStatusLabel(task: {
  status: WorkTaskStatus | string
  failure_reason?: string | null
}): string {
  if (task.status === "failed" && task.failure_reason === "interrupted") {
    return "已中断"
  }
  return STATUS_LABELS[task.status as WorkTaskStatus] || String(task.status || "未知")
}

/** 状态胶囊的色调类名后缀。列表卡片与详情页共用，两处不能各自定义。 */
export type TaskStatusTone = "idle" | "running" | "attention" | "success" | "error"

export function taskStatusTone(task: Pick<WorkTask, "status">): TaskStatusTone {
  switch (task.status) {
    case "queued":
    case "preparing":
    case "running":
    case "merging":
      return "running"
    case "awaiting_input":
    case "review":
      return "attention"
    case "done":
      return "success"
    case "failed":
      return "error"
    case "todo":
    case "canceled":
      return "idle"
    default:
      return "idle"
  }
}

/**
 * 是否显示转圈。`merging` 也算 —— 它确实有东西在跑，且是用户最想知道「还在走」的
 * 那一刻。
 */
export function isTaskSpinning(task: Pick<WorkTask, "status">): boolean {
  return (
    task.status === "queued" ||
    task.status === "preparing" ||
    task.status === "running" ||
    task.status === "merging"
  )
}

/**
 * 任务是否有活着的会话可以实时看。**与「进行中」分组不同**：`preparing` 还没有
 * 会话可看，而 `awaiting_input` / `merging` 有 —— 分组管的是"看板放哪列"，
 * 这个管的是"能不能附着上去看流式输出"。
 */
export function isTaskLive(task: Pick<WorkTask, "status">): boolean {
  return (
    task.status === "running" ||
    task.status === "awaiting_input" ||
    task.status === "merging"
  )
}

/** 需要用户处理的状态 —— 驱动 tab 上的数字角标。 */
const ATTENTION_STATUSES = new Set<string>(["awaiting_input", "review", "failed"])

/**
 * 「等你处理」的任务数。
 *
 * 刻意**不含 `merging`**，与 PC 端侧边栏角标一致：合并中的任务正在自己往前走，
 * 没有任何等着用户做的决定，把它算进角标会催用户去看一个看了也没事可做的任务。
 * （`attention` 分组包含它，那是为了卡片不在合并途中跳列 —— 两者服务于不同目的。）
 */
export function countAttentionTasks(tasks: WorkTask[]): number {
  return tasks.filter(
    (task) => ATTENTION_STATUSES.has(task.status) && task.archived_at == null
  ).length
}
