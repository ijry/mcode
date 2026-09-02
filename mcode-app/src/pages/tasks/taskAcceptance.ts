import type { WorkTask } from "@/types/workTask"

/**
 * 验收判定的纯谓词，逐条对齐 PC 端 `codeg-plus/src/components/tasks/task-acceptance.ts`。
 *
 * 这些判断决定「待验收的任务该给哪个按钮」。**服务端会重新校验每一条** —— 这里只
 * 决定要不要把按钮画出来，所以偏保守：拿不准时给合并（默认路径），而不是给一个
 * 只会失败的操作。
 */

/**
 * worktree 是否已经没了：任务确实在某个 worktree 里跑过（每一代都会），但那个
 * worktree 之后被移除了 —— 整个解绑，或者它的文件夹 / 目录已不存在
 * （`worktree_missing`，由服务端现场标注）。这种状态下合并轮次跑不起来，
 * 待验收的任务应改为「完成」。
 */
export function isWorktreeGone(task: WorkTask): boolean {
  return task.worktree_folder_id == null || task.worktree_missing === true
}

/**
 * 任务**曾有**一个 worktree 而它现在被删了 —— 这是角标的谓词，与 `isWorktreeGone`
 * 只差一件事：刚创建、从未初始化过（从来没有 worktree）的任务不算「被删」，
 * 它只是还没开始。`work_branch` 是「曾经存在过 worktree」的证人：它与 worktree
 * 一同写入，且能活过那次清空文件夹指针的解绑。
 */
export function worktreeWasRemoved(task: WorkTask): boolean {
  const hadWorktree = task.work_branch != null || task.worktree_folder_id != null
  return hadWorktree && isWorktreeGone(task)
}

/**
 * 待验收的任务是否没有可合并的东西，此时「完成」取代「合并」占据主位：
 * - 这一轮相对记录基线是空 diff —— **只有 `0` 算**；`null` 表示引擎读不到统计，
 *   那里合并仍是安全默认。引擎在真正结束任务前会重跑同一个 diff，所以一张过期的
 *   卡片不会丢掉工作；
 * - 或者 worktree 没了（见 `isWorktreeGone`）—— 合并只会失败，完成是唯一剩下的
 *   验收方式。引擎会保留仍有未落地提交的工作分支。
 */
export function hasNothingToMerge(task: WorkTask): boolean {
  if (task.status !== "review") return false
  return task.files_changed === 0 || isWorktreeGone(task)
}

/**
 * 这条任务是否正在项目的合并队列里等 —— 用户在该项目落地另一个任务时点了验收。
 * 它会一直留在待验收，直到引擎的合并泵把它派发出去，所以队列标记是这一行与
 * 「还没人决定」那一行的唯一区别。
 */
export function isMergeQueued(task: WorkTask): boolean {
  return task.status === "review" && task.merge_queued != null
}

/**
 * 该项目现在是否正有一个合并在跑。合并按项目串行（一条基线分支，一次落地），
 * 这就是把合并按钮的「合并」变成「加入队列」的依据。
 */
export function isFolderMerging(tasks: WorkTask[], folderId: number): boolean {
  return tasks.some((task) => task.folder_id === folderId && task.status === "merging")
}

/**
 * 每个排队任务在其项目里的名次（1 起），也就是引擎的泵实际派发的顺序：
 * 请求早的先走，同刻按任务 id 决胜 —— 与服务端 `drain_merge_queue` 的排序一致。
 * 未排队的任务没有条目。
 */
export function mergeQueueRanks(tasks: WorkTask[]): Map<number, number> {
  const byFolder = new Map<number, WorkTask[]>()
  for (const task of tasks) {
    if (!isMergeQueued(task)) continue
    const bucket = byFolder.get(task.folder_id)
    if (bucket) bucket.push(task)
    else byFolder.set(task.folder_id, [task])
  }
  const ranks = new Map<number, number>()
  // 按**时刻**比而不是按字符串比：服务端写的 RFC 3339 小数位数不固定，
  // "…:00Z" 在字典序里排在 "…:00.5Z" 之后。
  const at = (task: WorkTask): number => {
    const ms = Date.parse(task.merge_queued?.queued_at ?? "")
    return Number.isNaN(ms) ? 0 : ms
  }
  for (const bucket of byFolder.values()) {
    bucket.sort((a, b) => at(a) - at(b) || a.id - b.id)
    bucket.forEach((task, index) => ranks.set(task.id, index + 1))
  }
  return ranks
}

/**
 * 待验收任务能否**交付**到 forge —— issue 来源开一个新 PR，PR 来源推回它自己的分支。
 * 三个条件，服务端每一条都会重查；这个谓词只决定要不要给按钮。
 */
export function canDeliverToPr(task: WorkTask): boolean {
  return (
    task.status === "review" &&
    (task.source_kind === "forge_issue" || task.source_kind === "forge_pr") &&
    !hasNothingToMerge(task)
  )
}

/**
 * 这条任务的工作是否只该回到它来的那个 PR，而不是本地基线分支。服务端**拒绝**
 * 这类任务的本地合并（在本地落地会把 PR 的改动在作者背后吃进去，评审却还开着），
 * 所以界面上不能给合并 —— 推回去才是验收。
 */
export function mustDeliverToPr(task: WorkTask): boolean {
  return task.source_kind === "forge_pr"
}

/**
 * 这条任务的 forge 是否把「提议的变更」叫**合并请求**。只影响措辞 —— 一个承诺
 * Pull Request 的按钮却开出 Merge Request，读起来像是走错了工具。
 */
export function usesMergeRequests(task: WorkTask | null | undefined): boolean {
  return task?.source_meta?.provider === "gitlab"
}

/** 已交付任务最终落在哪个 PR（仅当它就是这么结束的）。 */
export function deliveredPrUrl(task: WorkTask): string | null {
  if (task.completion_kind !== "delivered_pr") return null
  return task.source_meta?.result_pr ?? null
}

/** 任务是否可编辑。只有还没跑、或已经失败的任务改标题/描述才有意义。 */
export function canEditTask(task: WorkTask): boolean {
  return task.status === "todo" || task.status === "failed"
}

/** 是否可删除。`merging` 不可删 —— 合并在飞行中，删掉会留下半截落地。 */
export function canDeleteTask(task: WorkTask): boolean {
  return task.status !== "merging"
}

/** 是否可取消。`merging` 是唯一取消不了的活动状态。 */
export function canCancelTask(task: WorkTask): boolean {
  return (
    task.status === "queued" ||
    task.status === "preparing" ||
    task.status === "running" ||
    task.status === "awaiting_input"
  )
}

/** worktree 清理失败、可以重试。 */
export function canRetryCleanup(task: WorkTask): boolean {
  return task.worktree_folder_id != null && task.cleanup_state === "failed"
}

/** 变更文件列表 / diff 是否可读：记录里有 worktree **且**它还在磁盘上。 */
export function isWorktreeUsable(task: WorkTask): boolean {
  return task.worktree_folder_id != null && task.worktree_missing !== true
}
