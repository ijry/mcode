/**
 * 「定时运行」用到的时间换算与格式化，全部纯函数。
 *
 * 两条不变量，都来自「用户说的时间是自己的墙上时钟，服务端存的是 UTC 时刻」这个落差：
 * - **输入侧**用本地 `YYYY-MM-DD` + `HH:mm` 两个字段，拼起来按**本地时区**解析。
 *   `new Date("2026-09-02T09:00")`（不带 Z、不带偏移）正是本地时间语义 —— 这是
 *   刻意依赖的，加上 `Z` 会把「早上九点」变成 UTC 九点。
 * - **输出侧**送 `toISOString()`（UTC 时刻）给服务端，显示时再转回本地。
 *
 * 过去的时间**接受**而不是拒绝：引擎下一轮扫描就会领取它。UI 得把这件事说出来，
 * 否则看起来像是设了个静默失效的计划。
 */

/** `Date` → 本地 `YYYY-MM-DD`。 */
export function toDayValue(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** `Date` → 本地 `HH:mm`。 */
export function toTimeValue(date: Date): string {
  const hours = `${date.getHours()}`.padStart(2, "0")
  const minutes = `${date.getMinutes()}`.padStart(2, "0")
  return `${hours}:${minutes}`
}

/**
 * 本地日期 + 本地时刻 → `Date`，缺任何一半返回 null。
 *
 * **不加时区后缀**：`"2026-09-02T09:00"` 被 JS 按本地时间解析，这正是我们要的语义。
 */
export function parseLocalDateTime(day: string, time: string): Date | null {
  const dayText = String(day || "").trim()
  const timeText = String(time || "").trim()
  if (!dayText || !timeText) return null
  const parsed = new Date(`${dayText}T${timeText}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** ISO 时刻 → 本地 `{ day, time }`，供弹层回填已有计划。 */
export function splitIsoToLocal(iso: string | null | undefined): { day: string; time: string } {
  if (!iso) return { day: "", time: "" }
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return { day: "", time: "" }
  return { day: toDayValue(parsed), time: toTimeValue(parsed) }
}

/** 选中的时刻是否已经过去。用 `>=` 的反面：正好等于「现在」不算过去。 */
export function isScheduleInPast(picked: Date, nowMs: number): boolean {
  return picked.getTime() < nowMs
}

/**
 * 一个空白时间字段该默认填几点。
 *
 * 选的是**今天**就给「下一个整点」（此刻之后最近的整点，跨天则退到 23:00）——
 * 选今天的人通常是想「今天晚点跑」；选的是**以后**就给 09:00，那是「某天开始工作」
 * 的默认含义。
 */
export function defaultTimeForDay(day: string, now: Date): string {
  const today = toDayValue(now)
  if (day !== today) return "09:00"
  const next = new Date(now.getTime())
  next.setMinutes(0, 0, 0)
  next.setHours(next.getHours() + 1)
  if (next.getDate() !== now.getDate()) return "23:00"
  return toTimeValue(next)
}

export interface SchedulePreset {
  label: string
  day: string
  time: string
}

/** 一键选项：真正会被选的那几个时间点，且每个都同时填好日期与时刻。 */
export function schedulePresets(now: Date): SchedulePreset[] {
  const inHours = (hours: number) => {
    const date = new Date(now.getTime() + hours * 60 * 60 * 1000)
    return { day: toDayValue(date), time: toTimeValue(date) }
  }
  const tomorrow = new Date(now.getTime())
  tomorrow.setDate(tomorrow.getDate() + 1)
  return [
    { label: "1 小时后", ...inHours(1) },
    { label: "3 小时后", ...inHours(3) },
    { label: "明天 9:00", day: toDayValue(tomorrow), time: "09:00" },
  ]
}

/** 卡片角标用的短格式：今天只给时刻，其它给 `MM-DD HH:mm`。 */
export function formatScheduleShort(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return ""
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return ""
  const isToday = toDayValue(parsed) === toDayValue(new Date(now))
  if (isToday) return `今天 ${toTimeValue(parsed)}`
  const month = `${parsed.getMonth() + 1}`.padStart(2, "0")
  const day = `${parsed.getDate()}`.padStart(2, "0")
  return `${month}-${day} ${toTimeValue(parsed)}`
}

/** 完整格式：`YYYY-MM-DD HH:mm`，详情页与提示语用。 */
export function formatScheduleFull(iso: string | null | undefined): string {
  if (!iso) return ""
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return ""
  return `${toDayValue(parsed)} ${toTimeValue(parsed)}`
}
