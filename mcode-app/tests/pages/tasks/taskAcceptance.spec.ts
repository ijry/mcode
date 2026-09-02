import {
  canDeleteTask,
  canDeliverToPr,
  canEditTask,
  canRetryCleanup,
  deliveredPrUrl,
  hasNothingToMerge,
  isFolderMerging,
  isMergeQueued,
  isWorktreeGone,
  isWorktreeUsable,
  mergeQueueRanks,
  mustDeliverToPr,
  usesMergeRequests,
  worktreeWasRemoved,
} from "@/pages/tasks/taskAcceptance"
import type { WorkTask } from "@/types/workTask"

function makeTask(overrides: Partial<WorkTask> = {}): WorkTask {
  return {
    id: 1,
    folder_id: 1,
    title: "任务",
    config: null,
    status: "review",
    failure_reason: null,
    last_error: null,
    run_seq: 0,
    sort_order: 0,
    worktree_folder_id: 10,
    conversation_id: null,
    connection_id: null,
    base_branch: "main",
    base_sha: null,
    work_branch: "task/1",
    cleanup_state: null,
    verdict: null,
    result_summary: null,
    files_changed: 3,
    additions: 10,
    deletions: 2,
    merge_commit: null,
    preflight: null,
    archived_at: null,
    scheduled_at: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    started_at: null,
    settled_at: null,
    finished_at: null,
    ...overrides,
  }
}

describe("taskAcceptance", () => {
  /**
   * `files_changed === 0`（确实没改动）与 `null`（引擎读不到统计）是两种语义。
   * 只有 `0` 才把主动作换成「完成」；`null` 时合并仍是安全默认 —— 否则一次读取失败
   * 会让用户把有改动的任务当空任务收掉。
   */
  it("treats files_changed 0 as nothing to merge but null as unknown", () => {
    expect(hasNothingToMerge(makeTask({ files_changed: 0 }))).toBe(true)
    expect(hasNothingToMerge(makeTask({ files_changed: null }))).toBe(false)
  })

  it("only answers hasNothingToMerge for reviewed tasks", () => {
    expect(hasNothingToMerge(makeTask({ status: "running", files_changed: 0 }))).toBe(false)
  })

  /** worktree 没了合并只能失败，那时完成是唯一剩下的验收方式。 */
  it("falls back to complete when the worktree is gone", () => {
    expect(hasNothingToMerge(makeTask({ worktree_missing: true }))).toBe(true)
    expect(hasNothingToMerge(makeTask({ worktree_folder_id: null }))).toBe(true)
  })

  it("detects a gone worktree from either the missing flag or a null folder", () => {
    expect(isWorktreeGone(makeTask({ worktree_missing: true }))).toBe(true)
    expect(isWorktreeGone(makeTask({ worktree_folder_id: null }))).toBe(true)
    expect(isWorktreeGone(makeTask())).toBe(false)
  })

  /**
   * 「被删除」与「没了」差一件事：从未初始化过（没有 work_branch、没有 worktree）的
   * 任务不是「被删」，它只是还没开始 —— 给这种任务画「Worktree 已删除」角标是假消息。
   */
  it("does not call a never-started task's worktree removed", () => {
    const neverStarted = makeTask({
      status: "todo",
      worktree_folder_id: null,
      work_branch: null,
    })
    expect(isWorktreeGone(neverStarted)).toBe(true)
    expect(worktreeWasRemoved(neverStarted)).toBe(false)
  })

  /** `work_branch` 是「曾有 worktree」的证人，它活过清空文件夹指针的解绑。 */
  it("uses work_branch as the witness that a worktree once existed", () => {
    expect(
      worktreeWasRemoved(makeTask({ worktree_folder_id: null, work_branch: "task/7" }))
    ).toBe(true)
  })

  it("reads the merge queue only on reviewed rows", () => {
    const queued = { message: null, delete_worktree: true, queued_at: "2026-09-01T01:00:00Z" }
    expect(isMergeQueued(makeTask({ merge_queued: queued }))).toBe(true)
    expect(isMergeQueued(makeTask({ status: "running", merge_queued: queued }))).toBe(false)
    expect(isMergeQueued(makeTask())).toBe(false)
  })

  it("spots a folder that is currently landing a merge", () => {
    const tasks = [
      makeTask({ id: 1, folder_id: 1, status: "merging" }),
      makeTask({ id: 2, folder_id: 2, status: "review" }),
    ]
    expect(isFolderMerging(tasks, 1)).toBe(true)
    expect(isFolderMerging(tasks, 2)).toBe(false)
  })

  /**
   * 排队名次按**时刻**比而不是字符串比：服务端写的 RFC 3339 小数位数不固定，
   * `"…:00Z"` 在字典序里排在 `"…:00.5Z"` 之后，字符串排序会给出相反的名次。
   */
  it("ranks the merge queue by instant, not by string order", () => {
    const tasks = [
      makeTask({
        id: 1,
        merge_queued: { message: null, delete_worktree: true, queued_at: "2026-09-01T01:00:00Z" },
      }),
      makeTask({
        id: 2,
        merge_queued: {
          message: null,
          delete_worktree: true,
          queued_at: "2026-09-01T00:59:59.500Z",
        },
      }),
    ]
    const ranks = mergeQueueRanks(tasks)
    expect(ranks.get(2)).toBe(1)
    expect(ranks.get(1)).toBe(2)
  })

  /** 名次按项目分桶 —— 队列是项目的，跨项目不该互相排。 */
  it("ranks each folder's queue independently", () => {
    const queuedAt = "2026-09-01T01:00:00Z"
    const tasks = [
      makeTask({ id: 1, folder_id: 1, merge_queued: { message: null, delete_worktree: true, queued_at: queuedAt } }),
      makeTask({ id: 2, folder_id: 2, merge_queued: { message: null, delete_worktree: true, queued_at: queuedAt } }),
    ]
    const ranks = mergeQueueRanks(tasks)
    expect(ranks.get(1)).toBe(1)
    expect(ranks.get(2)).toBe(1)
  })

  it("leaves non-queued tasks out of the rank map", () => {
    expect(mergeQueueRanks([makeTask()]).size).toBe(0)
  })

  /**
   * 来自 PR 的任务只能推回去：服务端**拒绝**本地合并（在本地落地会把 PR 的改动在
   * 作者背后吃进去，评审却还开着），所以界面上不能给合并按钮。
   */
  it("forces a PR-sourced task down the deliver path", () => {
    expect(mustDeliverToPr(makeTask({ source_kind: "forge_pr" }))).toBe(true)
    expect(mustDeliverToPr(makeTask({ source_kind: "forge_issue" }))).toBe(false)
    expect(mustDeliverToPr(makeTask())).toBe(false)
  })

  it("offers deliver for forge-sourced reviewed tasks that have something to land", () => {
    expect(canDeliverToPr(makeTask({ source_kind: "forge_issue" }))).toBe(true)
    expect(canDeliverToPr(makeTask({ source_kind: "forge_pr" }))).toBe(true)
    // 空 PR 会被 GitHub 用 422 拒掉，所以没有可推的东西时不给这个按钮。
    expect(canDeliverToPr(makeTask({ source_kind: "forge_issue", files_changed: 0 }))).toBe(false)
    expect(canDeliverToPr(makeTask())).toBe(false)
  })

  /** 只影响措辞：承诺 PR 却开出 MR，读起来像走错了工具。 */
  it("switches wording for GitLab merge requests", () => {
    expect(usesMergeRequests(makeTask({ source_meta: { provider: "gitlab" } }))).toBe(true)
    expect(usesMergeRequests(makeTask({ source_meta: { provider: "github" } }))).toBe(false)
    expect(usesMergeRequests(makeTask())).toBe(false)
    expect(usesMergeRequests(null)).toBe(false)
  })

  it("returns the delivered PR url only for tasks that ended by delivering", () => {
    expect(
      deliveredPrUrl(
        makeTask({
          status: "done",
          completion_kind: "delivered_pr",
          source_meta: { result_pr: "https://example.com/pr/1" },
        })
      )
    ).toBe("https://example.com/pr/1")
    expect(
      deliveredPrUrl(makeTask({ status: "done", completion_kind: "merged" }))
    ).toBeNull()
  })

  it("allows editing only a task that has not run or has failed", () => {
    expect(canEditTask(makeTask({ status: "todo" }))).toBe(true)
    expect(canEditTask(makeTask({ status: "failed" }))).toBe(true)
    expect(canEditTask(makeTask({ status: "running" }))).toBe(false)
  })

  /** `merging` 不可删 —— 合并在飞行中，删掉会留下半截落地。 */
  it("refuses to delete a task while its merge is in flight", () => {
    expect(canDeleteTask(makeTask({ status: "merging" }))).toBe(false)
    expect(canDeleteTask(makeTask({ status: "running" }))).toBe(true)
  })

  it("offers cleanup retry only when a cleanup actually failed", () => {
    expect(canRetryCleanup(makeTask({ cleanup_state: "failed" }))).toBe(true)
    expect(canRetryCleanup(makeTask({ cleanup_state: null }))).toBe(false)
    expect(canRetryCleanup(makeTask({ worktree_folder_id: null, cleanup_state: "failed" }))).toBe(
      false
    )
  })

  /** diff 只能在「记录里有 worktree 且它还在磁盘上」时读。 */
  it("gates the diff on a worktree that is both recorded and present", () => {
    expect(isWorktreeUsable(makeTask())).toBe(true)
    expect(isWorktreeUsable(makeTask({ worktree_missing: true }))).toBe(false)
    expect(isWorktreeUsable(makeTask({ worktree_folder_id: null }))).toBe(false)
  })
})
