import {
  countAttentionTasks,
  groupForStatus,
  isTaskLive,
  isTaskSpinning,
  STATUSES_BY_GROUP,
  TASK_STATUS_GROUPS,
  TASK_TAB_IDS,
  taskStatusLabel,
  taskStatusTone,
} from "@/pages/tasks/taskStatus"
import { WORK_TASK_STATUSES } from "@/types/workTask"
import type { WorkTask, WorkTaskStatus } from "@/types/workTask"

function makeTask(overrides: Partial<WorkTask> = {}): WorkTask {
  return {
    id: 1,
    folder_id: 1,
    title: "任务",
    config: null,
    status: "todo",
    failure_reason: null,
    last_error: null,
    run_seq: 0,
    sort_order: 0,
    worktree_folder_id: null,
    conversation_id: null,
    connection_id: null,
    base_branch: null,
    base_sha: null,
    work_branch: null,
    cleanup_state: null,
    verdict: null,
    result_summary: null,
    files_changed: null,
    additions: null,
    deletions: null,
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

describe("taskStatus", () => {
  /**
   * 规格表（`STATUSES_BY_GROUP`）与被执行的那一份（`groupForStatus`）必须一致，
   * 且每个状态恰好归一组。这条断言是「新增状态却忘了归组」的唯一防线 ——
   * 否则那个状态的任务会从 tab 过滤里静默消失（`filterTaskEntries` 按分组比对）。
   */
  it("keeps the spec table and groupForStatus in agreement, covering every status once", () => {
    const seen = new Set<WorkTaskStatus>()
    TASK_STATUS_GROUPS.forEach((group) => {
      STATUSES_BY_GROUP[group].forEach((status) => {
        expect(groupForStatus(status)).toBe(group)
        expect(seen.has(status)).toBe(false)
        seen.add(status)
      })
    })
    expect(Array.from(seen).sort()).toEqual([...WORK_TASK_STATUSES].sort())
  })

  it("exposes 'all' as the first tab followed by the four groups", () => {
    expect(TASK_TAB_IDS).toEqual(["all", "todo", "inProgress", "attention", "done"])
  })

  /**
   * `queued` 归「待办」而不是「进行中」：它还在等并发槽，什么都没发生。
   * 这一条与 PC 端看板逐字一致，改了会让两端对同一个任务给出不同的位置。
   */
  it("files queued under todo, not inProgress", () => {
    expect(groupForStatus("queued")).toBe("todo")
    expect(groupForStatus("preparing")).toBe("inProgress")
  })

  /**
   * `merging` 归「等你处理」而不是「已完成」：卡片不能在用户点了合并之后就跳组，
   * 它留在原处、落地后直接进「已完成」。
   */
  it("keeps merging in the attention group so a card does not jump mid-merge", () => {
    expect(groupForStatus("merging")).toBe("attention")
  })

  /** 未知状态（服务端新增）归「等你处理」—— 唯一一个「有人得看一眼」的分组。 */
  it("routes an unknown status to attention rather than dropping it", () => {
    expect(groupForStatus("some_future_status")).toBe("attention")
  })

  /** 被中断的失败与 agent 自己失败读起来是两回事。 */
  it("names an interrupted failure differently from an agent failure", () => {
    expect(taskStatusLabel(makeTask({ status: "failed", failure_reason: "interrupted" }))).toBe(
      "已中断"
    )
    expect(taskStatusLabel(makeTask({ status: "failed", failure_reason: "agent_error" }))).toBe(
      "失败"
    )
  })

  /** 未知状态原样显示 —— 让用户看到陌生词，好过看到一个错的词。 */
  it("passes an unknown status through instead of guessing a label", () => {
    expect(taskStatusLabel({ status: "brand_new", failure_reason: null })).toBe("brand_new")
  })

  it("maps statuses onto chip tones", () => {
    expect(taskStatusTone(makeTask({ status: "running" }))).toBe("running")
    expect(taskStatusTone(makeTask({ status: "review" }))).toBe("attention")
    expect(taskStatusTone(makeTask({ status: "done" }))).toBe("success")
    expect(taskStatusTone(makeTask({ status: "failed" }))).toBe("error")
    expect(taskStatusTone(makeTask({ status: "todo" }))).toBe("idle")
  })

  /**
   * `isTaskLive`（能不能附着上去看流式输出）**不等于**「进行中」分组：
   * `preparing` 还没有会话可看，`awaiting_input` / `merging` 有。
   */
  it("separates 'has a live session' from the inProgress group", () => {
    expect(isTaskLive(makeTask({ status: "preparing" }))).toBe(false)
    expect(groupForStatus("preparing")).toBe("inProgress")
    expect(isTaskLive(makeTask({ status: "awaiting_input" }))).toBe(true)
    expect(isTaskLive(makeTask({ status: "merging" }))).toBe(true)
  })

  it("spins for every status that is actually moving, merging included", () => {
    expect(isTaskSpinning(makeTask({ status: "queued" }))).toBe(true)
    expect(isTaskSpinning(makeTask({ status: "merging" }))).toBe(true)
    expect(isTaskSpinning(makeTask({ status: "review" }))).toBe(false)
  })

  /**
   * 角标计数刻意**不含 `merging`**：合并中的任务正在自己往前走，没有等着用户做的
   * 决定，算进角标会催用户去看一个看了也没事可做的任务。
   */
  it("counts only the statuses that actually wait on the user", () => {
    const tasks = [
      makeTask({ id: 1, status: "awaiting_input" }),
      makeTask({ id: 2, status: "review" }),
      makeTask({ id: 3, status: "failed" }),
      makeTask({ id: 4, status: "merging" }),
      makeTask({ id: 5, status: "running" }),
    ]
    expect(countAttentionTasks(tasks)).toBe(3)
  })

  /** 归档过的任务不再要求任何决定，所以不进角标。 */
  it("excludes archived tasks from the attention count", () => {
    const tasks = [
      makeTask({ id: 1, status: "review" }),
      makeTask({ id: 2, status: "review", archived_at: "2026-09-01T00:00:00Z" }),
    ]
    expect(countAttentionTasks(tasks)).toBe(1)
  })
})
