import {
  canSubmitFollowUp,
  DEFAULT_FOLLOW_UP_INTENT,
  followUpScenario,
  FOLLOW_UP_SCENARIOS,
  restartNotePlaceholder,
} from "@/pages/tasks/taskFollowUp"
import {
  defaultTimeForDay,
  formatScheduleFull,
  formatScheduleShort,
  isScheduleInPast,
  parseLocalDateTime,
  schedulePresets,
  splitIsoToLocal,
  toDayValue,
  toTimeValue,
} from "@/pages/tasks/taskSchedule"
import {
  duplicateActiveSource,
  duplicateActiveSourceLabel,
} from "@/pages/tasks/taskRestartGuard"

describe("taskFollowUp", () => {
  /** `revise` 是第一个也是默认值 —— 它是这个动作长出意图之前的行为。 */
  it("defaults to revise and lists it first", () => {
    expect(DEFAULT_FOLLOW_UP_INTENT).toBe("revise")
    expect(FOLLOW_UP_SCENARIOS[0].intent).toBe("revise")
    expect(FOLLOW_UP_SCENARIOS.map((item) => item.intent)).toEqual([
      "revise",
      "continue",
      "question",
      "verify",
    ])
  })

  /**
   * 只有自查允许空文本：「验收前你再看一遍」本身就是完整指令，做成一键正是它的价值。
   * 其余三个都需要用户说点什么，否则 agent 收到的是一个没有内容的返工请求。
   */
  it("allows an empty submit only for the self-check intent", () => {
    expect(canSubmitFollowUp("verify", "")).toBe(true)
    expect(canSubmitFollowUp("revise", "")).toBe(false)
    expect(canSubmitFollowUp("continue", "")).toBe(false)
    expect(canSubmitFollowUp("question", "")).toBe(false)
  })

  it("treats whitespace as empty", () => {
    expect(canSubmitFollowUp("revise", "   \n  ")).toBe(false)
    expect(canSubmitFollowUp("revise", " 改一下 ")).toBe(true)
  })

  /** 附件单独就算内容：一张截图不配句子也是完整指令。 */
  it("counts an attachment as content on its own", () => {
    expect(canSubmitFollowUp("revise", "", true)).toBe(true)
  })

  it("falls back to the first scenario for an unknown intent", () => {
    expect(followUpScenario("nonsense" as never).intent).toBe("revise")
  })

  it("words the restart placeholder differently per kind", () => {
    expect(restartNotePlaceholder("retry")).not.toBe(restartNotePlaceholder("requeue"))
    expect(restartNotePlaceholder("requeue")).toContain("为什么取消")
  })
})

describe("taskSchedule", () => {
  /**
   * 「早上九点」是用户自己的墙上时钟。`parseLocalDateTime` 必须**不加**时区后缀 ——
   * 加了 `Z` 会把它变成 UTC 九点，在东八区就是下午五点。
   */
  it("parses day + time in the local timezone, not as UTC", () => {
    const parsed = parseLocalDateTime("2026-09-02", "09:00")
    expect(parsed).not.toBeNull()
    expect(parsed!.getHours()).toBe(9)
    expect(parsed!.getMinutes()).toBe(0)
    // 往返一圈拿回同一组本地字段。
    expect(toDayValue(parsed!)).toBe("2026-09-02")
    expect(toTimeValue(parsed!)).toBe("09:00")
  })

  it("returns null when either half is missing", () => {
    expect(parseLocalDateTime("", "09:00")).toBeNull()
    expect(parseLocalDateTime("2026-09-02", "")).toBeNull()
    expect(parseLocalDateTime("nonsense", "09:00")).toBeNull()
  })

  /** 弹层回填已有计划：ISO 时刻 → 本地两个字段。 */
  it("splits an ISO instant back into local day and time", () => {
    const iso = parseLocalDateTime("2026-09-02", "14:30")!.toISOString()
    expect(splitIsoToLocal(iso)).toEqual({ day: "2026-09-02", time: "14:30" })
  })

  /** 没有计划时弹层是**空的** —— 预填会让每个待办看起来都定了时。 */
  it("yields empty fields for a task with no plan", () => {
    expect(splitIsoToLocal(null)).toEqual({ day: "", time: "" })
    expect(splitIsoToLocal("not-a-date")).toEqual({ day: "", time: "" })
  })

  it("judges the past strictly before now", () => {
    const now = Date.parse("2026-09-02T12:00:00Z")
    expect(isScheduleInPast(new Date(now - 1000), now)).toBe(true)
    expect(isScheduleInPast(new Date(now), now)).toBe(false)
    expect(isScheduleInPast(new Date(now + 1000), now)).toBe(false)
  })

  /**
   * 选今天 → 下一个整点（「今天晚点跑」）；选以后 → 09:00（「某天开始工作」）。
   * 两者都是那个选择下最可能的意思。
   */
  it("defaults today's blank time to the next hour and a future day to 09:00", () => {
    const now = new Date(2026, 8, 2, 14, 20, 0)
    expect(defaultTimeForDay(toDayValue(now), now)).toBe("15:00")
    expect(defaultTimeForDay("2026-09-05", now)).toBe("09:00")
  })

  /** 跨天时退到 23:00 而不是给出「明天 00:00」—— 用户选的是今天。 */
  it("clamps to 23:00 rather than rolling into tomorrow", () => {
    const lateNight = new Date(2026, 8, 2, 23, 40, 0)
    expect(defaultTimeForDay(toDayValue(lateNight), lateNight)).toBe("23:00")
  })

  /** 预设必须同时填好两半 —— 一个预设仍然是一个决定。 */
  it("fills both halves for every preset", () => {
    const presets = schedulePresets(new Date(2026, 8, 2, 10, 0, 0))
    expect(presets).toHaveLength(3)
    presets.forEach((preset) => {
      expect(preset.day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(preset.time).toMatch(/^\d{2}:\d{2}$/)
      expect(parseLocalDateTime(preset.day, preset.time)).not.toBeNull()
    })
    expect(presets[0].time).toBe("11:00")
    expect(presets[2].time).toBe("09:00")
  })

  it("formats today's schedule without repeating the date", () => {
    const now = new Date(2026, 8, 2, 10, 0, 0)
    const todayIso = parseLocalDateTime(toDayValue(now), "18:00")!.toISOString()
    expect(formatScheduleShort(todayIso, now.getTime())).toBe("今天 18:00")
    const laterIso = parseLocalDateTime("2026-09-05", "09:00")!.toISOString()
    expect(formatScheduleShort(laterIso, now.getTime())).toBe("09-05 09:00")
  })

  it("formats the full schedule for the detail page", () => {
    const iso = parseLocalDateTime("2026-09-05", "09:00")!.toISOString()
    expect(formatScheduleFull(iso)).toBe("2026-09-05 09:00")
    expect(formatScheduleFull(null)).toBe("")
    expect(formatScheduleFull("nonsense")).toBe("")
  })
})

describe("taskRestartGuard", () => {
  const refusal = (detail: string) => new Error(`work_task_retry: ${detail}`)

  /**
   * 这是唯一一个「有出路」的拒绝：服务端接受 `allowDuplicateSource` 豁免。
   * 识别不出来的话，失败的 forge 任务就是死路 —— 只要替身还活着每次重启都被拒。
   */
  it("recognizes the guard's refusal and names the other task", () => {
    const parsed = duplicateActiveSource(
      refusal("duplicate_active_source: task #42 (修复登录) is already active")
    )
    expect(parsed).toEqual({ id: 42, title: "修复登录" })
    expect(duplicateActiveSourceLabel(parsed!)).toBe("#42（修复登录）")
  })

  /**
   * 标题本身可能以 `)` 结尾 —— 贪婪捕获 + 锚定后缀才能拿到完整标题，
   * 惰性匹配会在第一个右括号处截断。
   */
  it("captures a title that itself ends in a parenthesis", () => {
    const parsed = duplicateActiveSource(
      refusal("duplicate_active_source: task #7 (fix login (again)) is already active")
    )
    expect(parsed?.title).toBe("fix login (again)")
  })

  /**
   * 标记才是契约，id 与标题只是装饰。措辞漂移过的详情串仍然要拿到豁免入口 ——
   * 解析失败降级成「无名的重复」，而不是「不是重复」。
   */
  it("degrades to a nameless duplicate rather than to 'not a duplicate'", () => {
    const parsed = duplicateActiveSource(refusal("duplicate_active_source: something new"))
    expect(parsed).toEqual({ id: null, title: null })
    expect(duplicateActiveSourceLabel(parsed!)).toBe("另一个任务")
  })

  /** 其它失败返回 null —— 那些仍旧只是一条 toast，没有可决定的事。 */
  it("returns null for every other failure", () => {
    expect(duplicateActiveSource(new Error("work_task_retry: network timeout"))).toBeNull()
    expect(duplicateActiveSource(null)).toBeNull()
    expect(duplicateActiveSource("plain string")).toBeNull()
  })

  it("uses the id alone when the title is missing", () => {
    expect(duplicateActiveSourceLabel({ id: 9, title: null })).toBe("#9")
  })
})
