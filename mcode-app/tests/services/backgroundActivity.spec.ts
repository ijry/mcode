import {
  appendBackgroundSettled,
  BACKGROUND_SETTLED_LOG_LIMIT,
  hasOutstandingCount,
  normalizeBackgroundActivity,
  normalizeBackgroundSettledEntry,
} from "@/services/conversation/backgroundActivity"

describe("backgroundActivity 归一化", () => {
  it("区分「没报计数」与「报了 0」", () => {
    const missing = normalizeBackgroundActivity({
      session_id: "s1",
      settled: [{ task_id: "t1", status: "completed" }],
    })
    expect(missing?.outstanding).toBeNull()
    expect(hasOutstandingCount(missing)).toBe(false)

    const zero = normalizeBackgroundActivity({ session_id: "s1", outstanding: 0 })
    expect(zero?.outstanding).toBe(0)
    expect(hasOutstandingCount(zero)).toBe(true)
  })

  it("既没有计数也没有结算时返回 null", () => {
    expect(normalizeBackgroundActivity({ session_id: "s1" })).toBeNull()
    expect(normalizeBackgroundActivity({ session_id: "s1", settled: [] })).toBeNull()
    expect(normalizeBackgroundActivity(null)).toBeNull()
  })

  it("负数与小数被夹到非负整数", () => {
    expect(normalizeBackgroundActivity({ outstanding: -3 })?.outstanding).toBe(0)
    expect(normalizeBackgroundActivity({ outstanding: 2.7 })?.outstanding).toBe(2)
  })

  it("结算条目缺 taskId 时被丢弃，status 缺失不猜成功", () => {
    const update = normalizeBackgroundActivity({
      outstanding: 1,
      settled: [
        { task_id: "t1", status: "completed", summary: "跑完了" },
        { status: "completed" },
        { taskId: "t2", toolUseId: "toolu_9" },
      ],
    })
    expect(update?.settled).toHaveLength(2)
    expect(update?.settled[0]).toEqual({
      taskId: "t1",
      status: "completed",
      summary: "跑完了",
      toolUseId: null,
      result: null,
    })
    expect(update?.settled[1].status).toBe("unknown")
    expect(update?.settled[1].toolUseId).toBe("toolu_9")
  })

  it("watermark 透传，缺失为 null", () => {
    expect(normalizeBackgroundActivity({ outstanding: 0, watermark: 1234 })?.watermark).toBe(1234)
    expect(normalizeBackgroundActivity({ outstanding: 0 })?.watermark).toBeNull()
  })

  it("单条结算归一化直接可用", () => {
    expect(normalizeBackgroundSettledEntry({ task_id: " t1 ", status: "failed" })).toEqual({
      taskId: "t1",
      status: "failed",
      summary: null,
      toolUseId: null,
      result: null,
    })
    expect(normalizeBackgroundSettledEntry({})).toBeNull()
  })
})

describe("结算滚动日志", () => {
  it("按到达顺序追加，不按 id 去重（同一任务可被唤醒后再次结算）", () => {
    const first = appendBackgroundSettled([], [
      { taskId: "t1", status: "completed" },
    ])
    const second = appendBackgroundSettled(first, [{ taskId: "t1", status: "completed" }])
    expect(second).toHaveLength(2)
  })

  it("只保留最新的若干条", () => {
    const many = Array.from({ length: BACKGROUND_SETTLED_LOG_LIMIT + 3 }, (_, index) => ({
      taskId: `t${index}`,
      status: "completed",
    }))
    const log = appendBackgroundSettled([], many)
    expect(log).toHaveLength(BACKGROUND_SETTLED_LOG_LIMIT)
    expect(log[log.length - 1].taskId).toBe(`t${many.length - 1}`)
  })

  it("空入参保持原表", () => {
    const current = [{ taskId: "t1", status: "completed" }]
    expect(appendBackgroundSettled(current, [])).toBe(current)
    expect(appendBackgroundSettled(current, null)).toBe(current)
  })
})
