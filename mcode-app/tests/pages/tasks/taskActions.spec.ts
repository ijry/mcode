import {
  buildTaskActions,
  buildTaskZoneActions,
  isTaskActionAllowed,
} from "@/pages/tasks/taskActions"
import type { WorkTask, WorkTaskStatus } from "@/types/workTask"
import { WORK_TASK_STATUSES } from "@/types/workTask"

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
    additions: 1,
    deletions: 1,
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

describe("taskActions", () => {
  it("gives a to-do task start plus edit and schedule", () => {
    const { primary, secondaries } = buildTaskActions(makeTask({ status: "todo" }))
    expect(primary?.id).toBe("start")
    expect(secondaries.map((item) => item.id)).toEqual(["edit", "schedule"])
  })

  it("gives every live status a cancel as its primary", () => {
    const live: WorkTaskStatus[] = ["queued", "preparing", "running", "awaiting_input"]
    live.forEach((status) => {
      expect(buildTaskActions(makeTask({ status })).primary?.id).toBe("cancel")
    })
  })

  /**
   * `merging` 一个动作都不给：它取消不了，给一个点了没反应的按钮比不给更糟。
   * （会话入口仍然会追加 —— 那是唯一一件此时还能做的事。）
   */
  it("offers no state-advancing action while a merge is in flight", () => {
    const { primary, secondaries } = buildTaskActions(makeTask({ status: "merging" }))
    expect(primary).toBeNull()
    expect(secondaries).toEqual([])
  })

  /**
   * 已排队的合并也没有主动作：没有任何东西在等用户，实心按钮会说反话 ——
   * 只留一个「取消排队」。
   */
  it("drops the primary once a merge is queued", () => {
    const task = makeTask({
      status: "review",
      merge_queued: { message: null, delete_worktree: true, queued_at: "2026-09-01T01:00:00Z" },
    })
    const { primary, secondaries } = buildTaskActions(task)
    expect(primary).toBeNull()
    expect(secondaries.map((item) => item.id)).toEqual(["unqueueMerge"])
  })

  it("swaps merge for complete when there is nothing to land", () => {
    expect(buildTaskActions(makeTask({ status: "review", files_changed: 0 })).primary?.id).toBe(
      "complete"
    )
  })

  it("swaps merge for deliver on a PR-sourced task", () => {
    const primary = buildTaskActions(
      makeTask({ status: "review", source_kind: "forge_pr" })
    ).primary
    expect(primary?.id).toBe("deliverPr")
    expect(primary?.label).toBe("推回 PR")
  })

  it("says MR instead of PR for GitLab", () => {
    const primary = buildTaskActions(
      makeTask({
        status: "review",
        source_kind: "forge_pr",
        source_meta: { provider: "gitlab" },
      })
    ).primary
    expect(primary?.label).toBe("推回 MR")
  })

  /** 归档过的任务短路一切：只给一条回来的路。 */
  it("short-circuits an archived task to unarchive", () => {
    const { primary, secondaries } = buildTaskActions(
      makeTask({ status: "done", archived_at: "2026-09-01T00:00:00Z" })
    )
    expect(primary?.id).toBe("unarchive")
    expect(secondaries).toEqual([])
  })

  /** 「查看会话」在每个状态下都追加（只要有会话），并且总是排最后。 */
  it("appends the session entry last in every status once a session exists", () => {
    WORK_TASK_STATUSES.forEach((status) => {
      const { secondaries } = buildTaskActions(makeTask({ status, conversation_id: 42 }))
      expect(secondaries[secondaries.length - 1].id).toBe("viewSession")
    })
  })

  it("omits the session entry when the task never ran", () => {
    const { secondaries } = buildTaskActions(makeTask({ status: "todo", conversation_id: null }))
    expect(secondaries.some((item) => item.id === "viewSession")).toBe(false)
  })

  describe("buildTaskZoneActions", () => {
    /** 详情页动作区是超集：多出「继续处理」与「放弃」。 */
    it("adds follow-up and abandon on a reviewed task", () => {
      const ids = buildTaskZoneActions(makeTask({ status: "review" })).map((item) => item.id)
      expect(ids).toEqual(["merge", "followUp", "abandon"])
    })

    /** issue 来源的任务两种验收都给，合并保持主位。 */
    it("offers deliver alongside merge for an issue-sourced task", () => {
      const actions = buildTaskZoneActions(
        makeTask({ status: "review", source_kind: "forge_issue" })
      )
      expect(actions.map((item) => item.id)).toEqual([
        "merge",
        "deliverPr",
        "followUp",
        "abandon",
      ])
      expect(actions[0].primary).toBe(true)
      expect(actions[1].primary).toBeUndefined()
    })

    /** 每个状态至多一个 primary —— 详情页据此画实心按钮。 */
    it("marks at most one primary per status", () => {
      WORK_TASK_STATUSES.forEach((status) => {
        const primaries = buildTaskZoneActions(makeTask({ status })).filter(
          (item) => item.primary
        )
        expect(primaries.length).toBeLessThanOrEqual(1)
      })
    })

    it("marks no primary while merging or while a merge is queued", () => {
      expect(
        buildTaskZoneActions(makeTask({ status: "merging" })).some((item) => item.primary)
      ).toBe(false)
      const queued = buildTaskZoneActions(
        makeTask({
          status: "review",
          merge_queued: { message: null, delete_worktree: true, queued_at: "2026-09-01T01:00:00Z" },
        })
      )
      expect(queued.some((item) => item.primary)).toBe(false)
      expect(queued.map((item) => item.id)).toEqual([
        "editQueuedMerge",
        "unqueueMerge",
        "followUp",
        "abandon",
      ])
    })
  })

  describe("isTaskActionAllowed", () => {
    /**
     * 页面在每次点击前用它对着**实时**那一行再校验一次：卡片可能已经过期，
     * 而服务端的 CAS 拒绝会以一条错误 toast 的形式砸到用户脸上 —— 那次点击本身
     * 是合理的。
     */
    it("refuses a start on a task that already left todo", () => {
      expect(isTaskActionAllowed(makeTask({ status: "todo" }), "start")).toBe(true)
      expect(isTaskActionAllowed(makeTask({ status: "running" }), "start")).toBe(false)
    })

    it("refuses a merge on a queued, empty, or PR-sourced task", () => {
      expect(isTaskActionAllowed(makeTask({ status: "review" }), "merge")).toBe(true)
      expect(
        isTaskActionAllowed(
          makeTask({
            status: "review",
            merge_queued: { message: null, delete_worktree: true, queued_at: "x" },
          }),
          "merge"
        )
      ).toBe(false)
      expect(
        isTaskActionAllowed(makeTask({ status: "review", files_changed: 0 }), "merge")
      ).toBe(false)
      expect(
        isTaskActionAllowed(makeTask({ status: "review", source_kind: "forge_pr" }), "merge")
      ).toBe(false)
    })

    it("refuses everything state-advancing on an archived task except unarchive", () => {
      const archived = makeTask({ status: "review", archived_at: "2026-09-01T00:00:00Z" })
      expect(isTaskActionAllowed(archived, "unarchive")).toBe(true)
      expect(isTaskActionAllowed(archived, "merge")).toBe(false)
      expect(isTaskActionAllowed(archived, "followUp")).toBe(false)
      expect(isTaskActionAllowed(archived, "archive")).toBe(false)
    })

    it("keeps delete available in every status but merging", () => {
      expect(isTaskActionAllowed(makeTask({ status: "merging" }), "delete")).toBe(false)
      expect(isTaskActionAllowed(makeTask({ status: "running" }), "delete")).toBe(true)
    })

    /** 每个卡片/动作区画出来的动作都必须是允许的 —— 否则界面在骗人。 */
    it("agrees with every action the builders actually render", () => {
      const samples: WorkTask[] = [
        ...WORK_TASK_STATUSES.map((status) => makeTask({ status, conversation_id: 7 })),
        makeTask({ status: "review", files_changed: 0 }),
        makeTask({ status: "review", source_kind: "forge_pr" }),
        makeTask({ status: "review", source_kind: "forge_issue" }),
        makeTask({
          status: "review",
          merge_queued: { message: null, delete_worktree: true, queued_at: "2026-09-01T01:00:00Z" },
        }),
        makeTask({ status: "done", archived_at: "2026-09-01T00:00:00Z" }),
      ]
      samples.forEach((task) => {
        const { primary, secondaries } = buildTaskActions(task)
        const rendered = [
          ...(primary ? [primary] : []),
          ...secondaries,
          ...buildTaskZoneActions(task),
        ]
        rendered.forEach((action) => {
          expect(isTaskActionAllowed(task, action.id)).toBe(true)
        })
      })
    })
  })
})
