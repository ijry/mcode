import type { ForgeIssueRow, ForgeLabel } from "@/types/forge"

/**
 * 列表行的呈现规则。**纯模块** —— 不 import uni / pinia / 组件，可以裸测。
 *
 * 这里只回答「这一行该显示成什么样」，不回答「有没有下一页」（`forgeListPaging`）
 * 也不回答「这一行是不是那一行」（`forgeListScope`）。
 */

/** 一行的视觉状态。比线上的 `state` 多一个 `draft` —— 草稿 PR 与开着的 PR 在 triage 时是两件事。 */
export type ForgeRowGlyphKind = "open" | "closed" | "merged" | "draft" | "unknown"

export interface ForgeRowGlyph {
  kind: ForgeRowGlyphKind
  /** uview 内置图标名。 */
  icon: string
  /** 可读标签 —— 形状 + 颜色 + 文字三重编码，色盲用户与截图都要能分辨。 */
  label: string
  /** `--up-*` 变量名（不含 `var()`），由组件用 `upThemeVar` 求值。 */
  themeVar: string
  /** `themeVar` 不存在时的字面兜底色。 */
  fallback: string
}

const GLYPHS: Record<ForgeRowGlyphKind, ForgeRowGlyph> = {
  open: {
    kind: "open",
    icon: "info-circle",
    label: "进行中",
    themeVar: "--up-success",
    fallback: "#19be6b",
  },
  closed: {
    kind: "closed",
    icon: "close-circle",
    label: "已关闭",
    themeVar: "--up-error",
    fallback: "#fa3534",
  },
  merged: {
    kind: "merged",
    icon: "checkmark-circle",
    label: "已合并",
    // 紫色是两个 forge 对「已合并」的共同约定，而 uview 主题表里没有紫色变量。
    // 这里刻意写死字面值：拿 `--up-primary`（蓝）代替会让已合并与进行中在
    // 一列里几乎同色，而 merged 恰好是最需要一眼认出的那个终态。
    themeVar: "",
    fallback: "#8957e5",
  },
  draft: {
    kind: "draft",
    icon: "edit-pen",
    label: "草稿",
    themeVar: "--up-tips-color",
    fallback: "#909193",
  },
  unknown: {
    kind: "unknown",
    icon: "more-circle",
    label: "未知状态",
    themeVar: "--up-content-color",
    fallback: "#606266",
  },
}

/**
 * 一行的状态字形。
 *
 * `draft` **压过** `state`：一个草稿 PR 在线上的 state 是 `open`，但它在 triage
 * 列表里的意思是「还没准备好给人看」，画成普通的进行中会让人点进去才发现。
 *
 * 未知 `state` 不丢行也不假装是 open —— 服务端可能新增状态，退化成一个中性字形
 * 比猜一个具体状态好（猜错的方向是把一个已经结束的东西画成还开着）。
 */
export function rowGlyph(row: Pick<ForgeIssueRow, "state" | "draft" | "is_pr">): ForgeRowGlyph {
  if (row.draft && row.is_pr) return GLYPHS.draft
  switch (row.state) {
    case "open":
      return GLYPHS.open
    case "closed":
      return GLYPHS.closed
    case "merged":
      return GLYPHS.merged
    default:
      return GLYPHS.unknown
  }
}

/**
 * 行上显示几个标签。
 *
 * 桌面端宽屏放 4 个、手机 1 个；这里默认 2 —— 手机竖屏一行大概能放两颗短胶囊，
 * 而 triage 时标签是**扫描**用的，一颗都不给等于把这一列的作用去掉。
 *
 * 超出的**丢掉**而不是折行：详情页会显示全部标签，行的高度必须是可预测的
 * （否则同一屏里几行高几行矮，列表读起来是锯齿）。返回 `hidden` 让调用方能画
 * 一个「+3」而不是静默省略。
 */
export function visibleLabels(
  labels: ForgeLabel[],
  limit = 2
): { shown: ForgeLabel[]; hidden: number } {
  if (limit <= 0) return { shown: [], hidden: labels.length }
  if (labels.length <= limit) return { shown: labels, hidden: 0 }
  return { shown: labels.slice(0, limit), hidden: labels.length - limit }
}

/**
 * 相对时间。
 *
 * `updated_at` 可能是 null（forge 没给），此时返回空串而不是「刚刚」——
 * 「刚刚」是一个关于时间的断言，而我们什么都不知道。
 *
 * `now` 由调用方传入（页面持有一个每分钟走一次的共享时刻），这样同一屏里所有
 * 相对时间的口径一致，且这个函数保持纯的、可测的。
 */
export function relativeTime(iso: string | null | undefined, now: number): string {
  if (!iso) return ""
  const stamp = Date.parse(iso)
  if (!Number.isFinite(stamp)) return ""
  const diff = now - stamp
  // 未来时间（时钟偏差、或 forge 的时区处理）不画成负数，按「刚刚」处理。
  if (diff < 60_000) return "刚刚"
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} 个月前`
  return `${Math.floor(months / 12)} 年前`
}

/** 作者缺失时的头像占位文字。空作者返回 `?` 而不是空白 —— 一个空的圆圈读起来像加载中。 */
export function authorInitial(author: string | null | undefined): string {
  const name = String(author || "").trim()
  if (!name) return "?"
  return name.slice(0, 1).toUpperCase()
}

/** 行上「#号 · 作者 · 时间」那条元信息。缺的段落整段不出现，不留下悬着的分隔点。 */
export function rowMetaText(
  row: Pick<ForgeIssueRow, "number" | "author" | "updated_at">,
  now: number
): string {
  return [`#${row.number}`, row.author || "", relativeTime(row.updated_at, now)]
    .filter(Boolean)
    .join(" · ")
}
