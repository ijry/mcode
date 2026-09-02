import {
  countTaskEntriesByTab,
  DEFAULT_TASK_LIST_FILTER,
  filterTaskEntries,
  formatDateTime,
  formatRelativeTime,
  resolveTaskListEmptyText,
  taskCardNote,
  taskCardTimestamp,
  taskDiffStat,
  taskEventDetail,
  taskEventLabel,
  taskEventTargetStatus,
  isVisibleTaskEvent,
  type TaskListEntry,
  type TaskListFilter,
} from "@/pages/tasks/taskPresentation"
import type { WorkTask, WorkTaskEvent } from "@/types/workTask"

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

function makeEntry(task: Partial<WorkTask>, extra: Partial<TaskListEntry> = {}): TaskListEntry {
  return {
    task: makeTask(task),
    connectionKey: "conn-a",
    connectionName: "机器 A",
    folderName: "repo",
    ...extra,
  }
}

function makeFilter(overrides: Partial<TaskListFilter> = {}): TaskListFilter {
  return { ...DEFAULT_TASK_LIST_FILTER, ...overrides }
}

describe("taskPresentation", () => {
  describe("filterTaskEntries", () => {
    /** 手机上没有看板列，`updated_at` 倒序是唯一说得通的默认。 */
    it("sorts freshest first regardless of status", () => {
      const entries = [
        makeEntry({ id: 1, updated_at: "2026-09-01T00:00:00Z" }),
        makeEntry({ id: 2, updated_at: "2026-09-02T00:00:00Z" }),
        makeEntry({ id: 3, updated_at: "2026-08-30T00:00:00Z" }),
      ]
      expect(filterTaskEntries(entries, makeFilter()).map((entry) => entry.task.id)).toEqual([
        2, 1, 3,
      ])
    })

    it("narrows to a status group, not to a single status", () => {
      const entries = [
        makeEntry({ id: 1, status: "todo" }),
        makeEntry({ id: 2, status: "queued" }),
        makeEntry({ id: 3, status: "running" }),
      ]
      const ids = filterTaskEntries(entries, makeFilter({ tab: "todo" })).map(
        (entry) => entry.task.id
      )
      // `queued` 与 `todo` 同组，所以两条都在。
      expect(ids.sort()).toEqual([1, 2])
    })

    /** 已取消默认显示（还能重新排队），已归档默认隐藏（用户主动收起来的）。 */
    it("shows canceled by default and hides archived by default", () => {
      expect(DEFAULT_TASK_LIST_FILTER.showCanceled).toBe(true)
      expect(DEFAULT_TASK_LIST_FILTER.showArchived).toBe(false)
      const entries = [
        makeEntry({ id: 1, status: "canceled" }),
        makeEntry({ id: 2, status: "done", archived_at: "2026-09-01T00:00:00Z" }),
      ]
      expect(filterTaskEntries(entries, makeFilter()).map((entry) => entry.task.id)).toEqual([1])
      expect(
        filterTaskEntries(entries, makeFilter({ showCanceled: false })).map(
          (entry) => entry.task.id
        )
      ).toEqual([])
      expect(
        filterTaskEntries(entries, makeFilter({ showArchived: true })).map(
          (entry) => entry.task.id
        ).sort()
      ).toEqual([1, 2])
    })

    it("filters by connection and by project", () => {
      const entries = [
        makeEntry({ id: 1, folder_id: 10 }, { connectionKey: "conn-a" }),
        makeEntry({ id: 2, folder_id: 20 }, { connectionKey: "conn-a" }),
        makeEntry({ id: 3, folder_id: 10 }, { connectionKey: "conn-b" }),
      ]
      expect(
        filterTaskEntries(entries, makeFilter({ connectionKey: "conn-a" })).map(
          (entry) => entry.task.id
        ).sort()
      ).toEqual([1, 2])
      expect(
        filterTaskEntries(entries, makeFilter({ folderId: 10 })).map((entry) => entry.task.id).sort()
      ).toEqual([1, 3])
    })

    /** 搜索覆盖标题、描述、分支、项目名 —— 用户记得住的四种指认方式。 */
    it("searches across title, description, branch and project name", () => {
      const entries = [
        makeEntry({ id: 1, title: "修复登录" }),
        makeEntry({
          id: 2,
          title: "别的",
          config: {
            prompt_blocks: [],
            display_text: "顺手把登录校验补上",
            config_values: {},
          },
        }),
        makeEntry({ id: 3, title: "无关", work_branch: "task/login-fix" }),
        makeEntry({ id: 4, title: "无关" }, { folderName: "login-service" }),
        makeEntry({ id: 5, title: "完全无关" }),
      ]
      expect(
        filterTaskEntries(entries, makeFilter({ keyword: "登录" })).map((entry) => entry.task.id).sort()
      ).toEqual([1, 2])
      expect(
        filterTaskEntries(entries, makeFilter({ keyword: "login" })).map((entry) => entry.task.id).sort()
      ).toEqual([3, 4])
    })

    it("searches case-insensitively", () => {
      const entries = [makeEntry({ id: 1, title: "Fix Login" })]
      expect(filterTaskEntries(entries, makeFilter({ keyword: "fix login" }))).toHaveLength(1)
    })
  })

  describe("countTaskEntriesByTab", () => {
    /** 数量不受 tab 自身影响（否则切到某个 tab 后其它 tab 的数字全变 0），其余筛选照用。 */
    it("counts every group while ignoring the active tab", () => {
      const entries = [
        makeEntry({ id: 1, status: "todo" }),
        makeEntry({ id: 2, status: "running" }),
        makeEntry({ id: 3, status: "review" }),
        makeEntry({ id: 4, status: "merging" }),
        makeEntry({ id: 5, status: "done" }),
      ]
      const counts = countTaskEntriesByTab(entries, makeFilter({ tab: "todo" }))
      expect(counts).toEqual({ all: 5, todo: 1, inProgress: 1, attention: 2, done: 1 })
    })

    it("still respects the visibility toggles", () => {
      const entries = [
        makeEntry({ id: 1, status: "canceled" }),
        makeEntry({ id: 2, status: "done", archived_at: "2026-09-01T00:00:00Z" }),
      ]
      expect(countTaskEntriesByTab(entries, makeFilter({ showCanceled: false })).all).toBe(0)
    })
  })

  describe("resolveTaskListEmptyText", () => {
    /** 「没有任务」与「筛掉了」是两回事，空状态说错会让用户以为数据丢了。 */
    it("distinguishes an empty backend from an over-narrow filter", () => {
      expect(resolveTaskListEmptyText(makeFilter(), false)).toBe("还没有任务")
      expect(resolveTaskListEmptyText(makeFilter({ keyword: "abc" }), true)).toBe("没有匹配的任务")
      expect(resolveTaskListEmptyText(makeFilter({ tab: "review" as never }), true)).toBe(
        "该状态下暂无任务"
      )
      expect(resolveTaskListEmptyText(makeFilter({ connectionKey: "conn-a" }), true)).toBe(
        "当前筛选下暂无任务"
      )
    })

    /** 全部任务都归档时要指路到那个开关，否则用户看到一个无解的空列表。 */
    it("points at the archived toggle when everything is archived", () => {
      expect(resolveTaskListEmptyText(makeFilter(), true)).toContain("显示已归档")
    })
  })

  describe("card presentation", () => {
    /** 时间戳取「这张卡上一次发生事情」：完成 → 落定 → 开始 → 创建。 */
    it("prefers the latest lifecycle timestamp", () => {
      expect(
        taskCardTimestamp(
          makeTask({
            created_at: "2026-09-01T00:00:00Z",
            started_at: "2026-09-01T01:00:00Z",
            settled_at: "2026-09-01T02:00:00Z",
            finished_at: "2026-09-01T03:00:00Z",
          })
        )
      ).toBe("2026-09-01T03:00:00Z")
      expect(
        taskCardTimestamp(makeTask({ created_at: "2026-09-01T00:00:00Z", started_at: null }))
      ).toBe("2026-09-01T00:00:00Z")
    })

    /** 错误优先于一切：它是唯一需要用户立刻做点什么的。 */
    it("puts the error ahead of progress and summary", () => {
      const task = makeTask({
        status: "review",
        last_error: "merge conflict",
        latest_progress: "正在跑测试",
        result_summary: "改了三个文件",
      })
      expect(taskCardNote(task)).toEqual({ text: "merge conflict", tone: "error" })
    })

    it("shows live progress only while the task is live", () => {
      expect(taskCardNote(makeTask({ status: "running", latest_progress: "跑测试" }))).toEqual({
        text: "跑测试",
        tone: "progress",
      })
      // 已结束的任务不再显示进展 —— 那是一句过期的话。
      expect(taskCardNote(makeTask({ status: "done", latest_progress: "跑测试" }))).toBeNull()
    })

    it("shows the result summary on a reviewed task", () => {
      expect(taskCardNote(makeTask({ status: "review", result_summary: "改完了" }))).toEqual({
        text: "改完了",
        tone: "summary",
      })
    })

    /** 没有改动时不画 `+0 -0` 的空壳。 */
    it("omits the diffstat when nothing changed", () => {
      expect(taskDiffStat(makeTask({ files_changed: 0 }))).toBeNull()
      expect(taskDiffStat(makeTask({ files_changed: null }))).toBeNull()
      expect(taskDiffStat(makeTask({ files_changed: 2, additions: 5, deletions: 1 }))).toEqual({
        additions: 5,
        deletions: 1,
      })
    })
  })

  describe("time formatting", () => {
    const now = Date.parse("2026-09-02T12:00:00Z")

    it("formats recent times relatively and old ones as a date", () => {
      expect(formatRelativeTime("2026-09-02T11:59:30Z", now)).toBe("刚刚")
      expect(formatRelativeTime("2026-09-02T11:30:00Z", now)).toBe("30 分钟前")
      expect(formatRelativeTime("2026-09-02T09:00:00Z", now)).toBe("3 小时前")
      expect(formatRelativeTime("2026-08-31T12:00:00Z", now)).toBe("2 天前")
      // 超过 7 天给日期 —— 「23 天前」不如「08-10」有用。
      expect(formatRelativeTime("2026-08-01T12:00:00Z", now)).toMatch(/^\d{2}-\d{2}$/)
    })

    it("returns an empty string for an unusable timestamp", () => {
      expect(formatRelativeTime("", now)).toBe("")
      expect(formatRelativeTime("not-a-date", now)).toBe("")
      expect(formatDateTime("")).toBe("")
    })
  })

  describe("timeline events", () => {
    const makeEvent = (overrides: Partial<WorkTaskEvent> = {}): WorkTaskEvent => ({
      id: 1,
      task_id: 1,
      kind: "created",
      actor: "user",
      payload: null,
      created_at: "2026-09-01T00:00:00Z",
      ...overrides,
    })

    it("labels known kinds and passes unknown ones through", () => {
      expect(taskEventLabel(makeEvent({ kind: "agent_progress" }))).toBe("Agent 进展")
      expect(taskEventLabel(makeEvent({ kind: "brand_new_kind" }))).toBe("brand_new_kind")
    })

    /** `round` 事件喂的是会话回放的阶段分隔，推进记录里没有信息量。 */
    it("filters out round markers", () => {
      expect(isVisibleTaskEvent(makeEvent({ kind: "round" }))).toBe(false)
      expect(isVisibleTaskEvent(makeEvent({ kind: "status_changed" }))).toBe(true)
    })

    it("extracts a one-line detail per kind", () => {
      expect(
        taskEventDetail(makeEvent({ kind: "init_command", payload: { command: "pnpm i", exit_code: 0 } }))
      ).toBe("pnpm i · exit 0")
      expect(
        taskEventDetail(makeEvent({ kind: "agent_verdict", payload: { verdict: "success", summary: "好了" } }))
      ).toBe("success · 好了")
      expect(
        taskEventDetail(makeEvent({ kind: "merge_conflict", payload: { files: ["a.ts", "b.ts"] } }))
      ).toBe("a.ts, b.ts")
      expect(taskEventDetail(makeEvent({ kind: "created", payload: null }))).toBe("")
    })

    /** 状态变更的错误/原因要露出来 —— 那是失败任务上最有用的一句话。 */
    it("surfaces the error or reason on a status change", () => {
      expect(
        taskEventDetail(
          makeEvent({ kind: "status_changed", payload: { to: "failed", error: "boom" } })
        )
      ).toBe("boom")
      expect(
        taskEventDetail(
          makeEvent({ kind: "status_changed", payload: { to: "canceled", reason: "方向不对" } })
        )
      ).toBe("方向不对")
    })

    it("reads the target status only from status_changed events", () => {
      expect(
        taskEventTargetStatus(makeEvent({ kind: "status_changed", payload: { to: "review" } }))
      ).toBe("review")
      expect(
        taskEventTargetStatus(makeEvent({ kind: "agent_progress", payload: { to: "review" } }))
      ).toBe("")
    })
  })
})
