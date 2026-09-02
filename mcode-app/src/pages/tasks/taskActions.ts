import type { WorkTask } from "@/types/workTask"
import {
  canCancelTask,
  hasNothingToMerge,
  isMergeQueued,
  mustDeliverToPr,
  usesMergeRequests,
} from "./taskAcceptance"

/**
 * 一个任务在当前状态下提供哪些动作 —— 列表卡片与详情页共用**同一份**推导，
 * 两处不会漂移。对齐 PC 端 `codeg-plus/src/components/tasks/task-actions.ts`。
 *
 * 形状：至多一个主动作（`primary`，实心按钮）+ 若干次动作（`secondaries`，图标按钮）。
 * `merging` 没有主动作 —— 它取消不了，也没有别的可做。
 *
 * 这是个**纯模块**（不 import uni / pinia / 组件），所以能裸测；`onClick` 由调用方
 * 以 handlers 传入，动作 id 才是这里的产物。
 */

export type TaskActionId =
  | "start"
  | "schedule"
  | "cancel"
  | "retry"
  | "requeue"
  | "merge"
  | "editQueuedMerge"
  | "unqueueMerge"
  | "complete"
  | "deliverPr"
  | "archive"
  | "unarchive"
  | "edit"
  | "viewSession"
  | "followUp"
  | "abandon"
  | "delete"
  | "retryCleanup"

export interface TaskActionItem {
  id: TaskActionId
  label: string
  /** up-icon 的 name。 */
  icon: string
  /** 破坏性动作（删除 / 放弃）用红色。 */
  danger?: boolean
  /**
   * 该状态唯一的主动作 —— 详情页画成实心按钮。
   *
   * 只在 `buildTaskZoneActions` 里出现，且**可能一个都没有**：`merging` 取消不了，
   * 排队中的合并也没有任何在等用户的决定 —— 那两种情况下画一个实心按钮是在说反话。
   */
  primary?: boolean
}

export interface TaskActionSet {
  primary: TaskActionItem | null
  secondaries: TaskActionItem[]
}

/**
 * 卡片与行的动作集。
 *
 * 已归档的任务短路一切：只给「取消归档」—— 归档就是为了让它不再要求任何决定。
 * 「查看会话」在**每个**状态下都追加（只要有会话），并且总是排在最后。
 */
export function buildTaskActions(task: WorkTask): TaskActionSet {
  const secondaries: TaskActionItem[] = []
  let primary: TaskActionItem | null = null

  if (task.archived_at != null) {
    primary = { id: "unarchive", label: "取消归档", icon: "reload" }
  } else {
    switch (task.status) {
      case "todo":
        primary = { id: "start", label: "开始", icon: "play-right-fill" }
        secondaries.push({ id: "edit", label: "编辑", icon: "edit-pen" })
        // 「现在开始」和「稍后开始」是同一个决定，所以计划就放在开始旁边。
        secondaries.push({ id: "schedule", label: "定时运行", icon: "clock" })
        break
      case "queued":
      case "preparing":
      case "running":
      case "awaiting_input":
        primary = { id: "cancel", label: "取消", icon: "close-circle" }
        break
      case "review":
        if (isMergeQueued(task)) {
          // 已经验收过了，正在等项目的合并槽 —— 剩下的唯一决定是把它撤出队列。
          // 和 `merging` 一样没有主动作：没有任何东西在等用户，实心按钮会说反话。
          secondaries.push({ id: "unqueueMerge", label: "取消排队", icon: "list" })
          break
        }
        if (hasNothingToMerge(task)) {
          // 什么都没改 ⟹ 没得合并：给真正适用的那种验收。
          primary = { id: "complete", label: "完成", icon: "checkmark-circle" }
        } else if (mustDeliverToPr(task)) {
          // 来自 PR 的任务只有这一种验收 —— 它的工作要回到那个 PR 的分支上。
          primary = {
            id: "deliverPr",
            label: usesMergeRequests(task) ? "推回 MR" : "推回 PR",
            icon: "share",
          }
        } else {
          primary = { id: "merge", label: "合并", icon: "checkmark" }
        }
        break
      case "merging":
        break
      case "failed":
        primary = { id: "retry", label: "重试", icon: "reload" }
        secondaries.push({ id: "edit", label: "编辑", icon: "edit-pen" })
        secondaries.push({ id: "archive", label: "归档", icon: "folder" })
        break
      case "done":
        primary = { id: "archive", label: "归档", icon: "folder" }
        break
      case "canceled":
        primary = { id: "requeue", label: "重新排队", icon: "reload" }
        secondaries.push({ id: "archive", label: "归档", icon: "folder" })
        break
      default:
        break
    }
  }

  if (task.conversation_id != null) {
    secondaries.push({ id: "viewSession", label: "查看会话", icon: "chat" })
  }

  return { primary, secondaries }
}

/**
 * 详情页的动作区 —— 卡片动作集的**超集**：多出「继续处理」（对待验收）、
 * 「放弃」（对待验收）、以及排队中合并的「修改排队的合并」。
 *
 * 结构上与卡片刻意不同：详情页有空间把每个动作都配上文字，而列表只能给图标。
 * 但**判定条件必须一致** —— 同一个任务在两处能做的事不能不同，所以这里复用
 * 上面同一批谓词。
 *
 * 不含「删除」「重试清理」「编辑」「查看会话」：那四个不推进任务状态，
 * 归详情页底部的工具栏。
 */
export function buildTaskZoneActions(task: WorkTask): TaskActionItem[] {
  const archived = task.archived_at != null
  const actions: TaskActionItem[] = []

  if (archived) {
    return [{ id: "unarchive", label: "取消归档", icon: "reload", primary: true }]
  }

  if (task.status === "review") {
    if (isMergeQueued(task)) {
      // 已经验收过、在等项目的合并槽：剩下的两个决定都不是"在等用户"，所以两个都不实心。
      actions.push({ id: "editQueuedMerge", label: "修改排队的合并", icon: "checkmark" })
      actions.push({ id: "unqueueMerge", label: "取消排队", icon: "list" })
    } else if (hasNothingToMerge(task)) {
      actions.push({
        id: "complete",
        label: "完成",
        icon: "checkmark-circle",
        primary: true,
      })
    } else if (mustDeliverToPr(task)) {
      actions.push({
        id: "deliverPr",
        label: usesMergeRequests(task) ? "推回 MR" : "推回 PR",
        icon: "share",
        primary: true,
      })
    } else {
      actions.push({ id: "merge", label: "合并", icon: "checkmark", primary: true })
      // 第二种验收方式，不是替代：来自 issue 的任务也可以正当地在本地落地，
      // 所以两个都留着，合并保持主位。
      if (task.source_kind === "forge_issue") {
        actions.push({
          id: "deliverPr",
          label: usesMergeRequests(task) ? "创建 MR" : "创建 PR",
          icon: "share",
        })
      }
    }
    actions.push({ id: "followUp", label: "继续处理", icon: "rewind-left" })
    actions.push({ id: "abandon", label: "放弃", icon: "close-circle", danger: true })
    return actions
  }

  switch (task.status) {
    case "todo":
      actions.push({
        id: "start",
        label: "开始",
        icon: "play-right-fill",
        primary: true,
      })
      actions.push({ id: "schedule", label: "定时运行", icon: "clock" })
      break
    case "queued":
    case "preparing":
    case "running":
    case "awaiting_input":
      actions.push({ id: "cancel", label: "取消", icon: "close-circle", primary: true })
      break
    case "merging":
      // 合并在飞行中，取消不了 —— 一个动作都不给，而不是给一个点了没反应的按钮。
      break
    case "failed":
      actions.push({ id: "retry", label: "重试", icon: "reload", primary: true })
      actions.push({ id: "archive", label: "归档", icon: "folder" })
      break
    case "done":
      actions.push({ id: "archive", label: "归档", icon: "folder", primary: true })
      break
    case "canceled":
      actions.push({ id: "requeue", label: "重新排队", icon: "reload", primary: true })
      actions.push({ id: "archive", label: "归档", icon: "folder" })
      break
    default:
      break
  }
  return actions
}

/** 供测试与 UI 断言：动作 id 是否在当前状态下**允许**（而不只是被画出来）。 */
export function isTaskActionAllowed(task: WorkTask, id: TaskActionId): boolean {
  const archived = task.archived_at != null
  switch (id) {
    case "start":
    case "schedule":
      return !archived && task.status === "todo"
    case "cancel":
      return !archived && canCancelTask(task)
    case "abandon":
      return !archived && task.status === "review"
    case "retry":
      return !archived && task.status === "failed"
    case "requeue":
      return !archived && task.status === "canceled"
    case "merge":
      return (
        !archived &&
        task.status === "review" &&
        !isMergeQueued(task) &&
        !hasNothingToMerge(task) &&
        !mustDeliverToPr(task)
      )
    case "editQueuedMerge":
    case "unqueueMerge":
      return !archived && isMergeQueued(task)
    case "complete":
      return !archived && hasNothingToMerge(task) && !isMergeQueued(task)
    case "deliverPr":
      return (
        !archived &&
        task.status === "review" &&
        !isMergeQueued(task) &&
        !hasNothingToMerge(task) &&
        (task.source_kind === "forge_issue" || task.source_kind === "forge_pr")
      )
    case "followUp":
      return !archived && task.status === "review"
    case "archive":
      return !archived
    case "unarchive":
      return archived
    case "edit":
      return task.status === "todo" || task.status === "failed"
    case "viewSession":
      return task.conversation_id != null
    case "delete":
      return task.status !== "merging"
    case "retryCleanup":
      return task.worktree_folder_id != null && task.cleanup_state === "failed"
    default:
      return false
  }
}
