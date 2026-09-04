import {
  asyncTaskTypeLabel,
  backgroundBusyStatusLabel,
  buildBackgroundSettledText,
  buildBackgroundTaskRows,
  buildBackgroundTaskSummary,
  formatAsyncTaskDuration,
  shouldShowBackgroundBusyStatus,
} from "@/pages/conversation-detail/detailBackgroundTasks"
import { normalizeAsyncTaskRecord } from "@/services/conversation/asyncTasks"

function task(overrides: Record<string, any>) {
  return normalizeAsyncTaskRecord({ task_id: "t1", ...overrides })!
}

describe("后台任务清单行", () => {
  it("meta 行拼「上一个工具 · tokens · 耗时」，首个进度 tick 之前为空", () => {
    const [bare] = buildBackgroundTaskRows([task({ name: "跑测试" })])
    expect(bare.metaText).toBe("")
    expect(bare.stateLabel).toBe("运行中")
    expect(bare.stateClass).toBe("running")

    const [withMeta] = buildBackgroundTaskRows([
      task({
        name: "跑测试",
        last_tool_name: "Bash",
        usage: { total_tokens: 12000, tool_uses: 3, duration_ms: 95000 },
      }),
    ])
    expect(withMeta.metaText).toBe("Bash · 12K tokens · 1m35s")
  })

  it("终态行不出现在清单里，paused 出现且不转圈", () => {
    const rows = buildBackgroundTaskRows([
      task({ task_id: "done", state: "completed" }),
      task({ task_id: "paused", state: "paused" }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].taskId).toBe("paused")
    expect(rows[0].stateClass).toBe("paused")
    expect(rows[0].stateLabel).toBe("已暂停")
  })

  it("canStop 原样透传 —— 不假定为真", () => {
    const [row] = buildBackgroundTaskRows([task({ can_stop: false })])
    expect(row.canStop).toBe(false)
  })

  it("类型名走词表，未知类型原样显示", () => {
    expect(asyncTaskTypeLabel("shell")).toBe("命令")
    expect(asyncTaskTypeLabel("MONITOR")).toBe("监视器")
    expect(asyncTaskTypeLabel("some_future_kind")).toBe("some_future_kind")
    expect(asyncTaskTypeLabel("")).toBe("任务")
  })

  it("耗时格式化", () => {
    expect(formatAsyncTaskDuration(0)).toBe("")
    expect(formatAsyncTaskDuration(420)).toBe("420ms")
    expect(formatAsyncTaskDuration(2500)).toBe("2.5s")
    expect(formatAsyncTaskDuration(120000)).toBe("2m")
    expect(formatAsyncTaskDuration(95000)).toBe("1m35s")
  })
})

describe("后台任务汇总", () => {
  it("取两个来源的较大者，不相加（同一个后台 shell 会同时出现在两边）", () => {
    const summary = buildBackgroundTaskSummary({
      outstanding: 1,
      tasks: [task({ task_id: "shell-1" })],
    })
    expect(summary.count).toBe(1)
    expect(summary.detaillessCount).toBe(0)
    expect(summary.hint).toBe("")
    expect(summary.chipLabel).toBe("后台 1")
  })

  it("计数大于清单行数是正常情形：子智能体只上报数量", () => {
    const summary = buildBackgroundTaskSummary({
      outstanding: 3,
      tasks: [task({ task_id: "shell-1" })],
    })
    expect(summary.count).toBe(3)
    expect(summary.detaillessCount).toBe(2)
    expect(summary.hint).toContain("另有 2 个")
  })

  it("只有计数、没有任何明细时也要提示", () => {
    const summary = buildBackgroundTaskSummary({ outstanding: 2, tasks: [] })
    expect(summary.visible).toBe(true)
    expect(summary.rows).toHaveLength(0)
    expect(summary.hint).toContain("2 个后台任务")
  })

  it("AIR 表有行但转录计数还没到时仍然显示", () => {
    const summary = buildBackgroundTaskSummary({
      outstanding: null,
      tasks: [task({ task_id: "shell-1" }), task({ task_id: "shell-2" })],
    })
    expect(summary.count).toBe(2)
    expect(summary.visible).toBe(true)
  })

  it("都为空时不显示", () => {
    const summary = buildBackgroundTaskSummary({ outstanding: 0, tasks: [] })
    expect(summary.visible).toBe(false)
    expect(summary.count).toBe(0)
  })

  it("终态行不计入数量", () => {
    const summary = buildBackgroundTaskSummary({
      outstanding: 0,
      tasks: [task({ task_id: "done", state: "stopped" })],
    })
    expect(summary.count).toBe(0)
  })
})

describe("状态胶囊改口", () => {
  it("只在空闲侧改口 —— 不盖掉 thinking / error", () => {
    expect(
      shouldShowBackgroundBusyStatus({ runtimeStatus: "connected", backgroundCount: 2 })
    ).toBe(true)
    expect(shouldShowBackgroundBusyStatus({ runtimeStatus: "idle", backgroundCount: 1 })).toBe(true)
    expect(
      shouldShowBackgroundBusyStatus({ runtimeStatus: "thinking", backgroundCount: 2 })
    ).toBe(false)
    expect(shouldShowBackgroundBusyStatus({ runtimeStatus: "error", backgroundCount: 2 })).toBe(
      false
    )
    expect(
      shouldShowBackgroundBusyStatus({ runtimeStatus: "disconnected", backgroundCount: 2 })
    ).toBe(false)
  })

  it("没有后台任务时不改口", () => {
    expect(shouldShowBackgroundBusyStatus({ runtimeStatus: "connected", backgroundCount: 0 })).toBe(
      false
    )
    expect(backgroundBusyStatusLabel(0)).toBe("")
    expect(backgroundBusyStatusLabel(3)).toBe("后台运行中 3")
  })
})

describe("结算提示文案", () => {
  it("completed 之外一律按未成功措辞", () => {
    expect(buildBackgroundSettledText({ taskId: "t1", status: "completed" })).toBe("后台任务已完成")
    expect(
      buildBackgroundSettledText({ taskId: "t1", status: "completed", summary: "改了 3 个文件" })
    ).toBe("后台任务已完成：改了 3 个文件")
    expect(buildBackgroundSettledText({ taskId: "t1", status: "failed" })).toBe("后台任务未成功")
    expect(buildBackgroundSettledText({ taskId: "t1", status: "unknown" })).toBe("后台任务已结束")
    expect(buildBackgroundSettledText(null)).toBe("")
  })
})
