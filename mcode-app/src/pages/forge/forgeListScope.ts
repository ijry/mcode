import type { ForgeIssueRow } from "@/types/forge"
import {
  normalizeForgeLabelFilter,
  normalizeForgeSearch,
  type ForgeFilterState,
} from "./forgeFilterState"

/**
 * 「这批数据描述的是哪一个结果集」—— 作用域键。**纯模块**。
 *
 * 为什么需要它：面板同时持有三样按不同节奏到达的东西 —— 可见 tab 的列表、
 * **不可见** tab 的计数、以及跨页写回的行。三者都可能在用户改了筛选之后才落地。
 * 光靠一个「有没有请求在飞」的布尔量分不清「这是当前答案」还是「这是上一次筛选
 * 的残留」，而残留的表现是：改了筛选，徽章上的数字先闪一下旧值再跳到新值。
 *
 * 所以每一份缓存的数据都随身带一个作用域键，落地时比对。
 */

/** 一次列表请求的作用域：仓库 + tab + 全部筛选。页码**不在**里面 —— 第 2 页与第 1 页是同一个结果集的两段。 */
export function forgeListScope(
  connectionKey: string,
  folderId: number,
  filter: ForgeFilterState
): string {
  return [
    connectionKey,
    folderId,
    filter.tab,
    filter.state,
    filter.assignedMe ? "mine" : "all",
    normalizeForgeLabelFilter(filter.labels).join(","),
    normalizeForgeSearch(filter.keyword) || "",
    filter.sort,
    filter.perPage,
  ].join("|")
}

/**
 * 一次计数请求的作用域：仓库 + 筛选，**不含 tab / sort / perPage**。
 *
 * 不含 tab 是关键：两个 tab 的计数共享同一份筛选，所以切 tab 时**已缓存的那个
 * 数字仍然有效** —— 这正是「切 tab 不产生任何新请求」成立的原因。
 *
 * 不含 sort / perPage 是因为它们不可能改变一个计数，带上会让改排序白白作废两个
 * 徽章。
 */
export function forgeCountsScope(
  connectionKey: string,
  folderId: number,
  filter: ForgeFilterState
): string {
  return [
    connectionKey,
    folderId,
    filter.state,
    filter.assignedMe ? "mine" : "all",
    normalizeForgeLabelFilter(filter.labels).join(","),
    normalizeForgeSearch(filter.keyword) || "",
  ].join("|")
}

/**
 * 一行的身份。
 *
 * `kind:number` 而不是裸 number：GitHub 的 issue 与 PR **共享一个编号空间**（所以
 * 那边 `#42` 只会是一个东西），但 GitLab 的 issue 与 MR **各有一套编号**，
 * `issue:42` 与 `pr:42` 是两个不同的工作项。裸 number 在 GitLab 上会让两者互相
 * 覆盖。
 */
export function forgeRowKey(row: Pick<ForgeIssueRow, "number" | "is_pr">): string {
  return `${row.is_pr ? "pr" : "issue"}:${row.number}`
}

export function isSameForgeRow(
  a: Pick<ForgeIssueRow, "number" | "is_pr">,
  b: Pick<ForgeIssueRow, "number" | "is_pr">
): boolean {
  return forgeRowKey(a) === forgeRowKey(b)
}

/**
 * 追加下一页。
 *
 * **按身份去重**而不是无脑 concat：两个 forge 都可能在两次请求之间插入新行，
 * 那会把第 1 页的最后一条挤到第 2 页，于是它出现两次（Vue 的 `:key` 重复 →
 * 渲染错乱）。已存在的行**保留旧的那份**而不是用新的覆盖 —— 新的那份来自更晚的
 * 请求，但用户可能已经在这一行上做过写回（关闭 / 合并），而 GitHub 的 search
 * 索引落后写入几秒，覆盖等于把刚做完的事撤销。
 */
export function appendForgeRows(
  existing: ForgeIssueRow[],
  incoming: ForgeIssueRow[]
): ForgeIssueRow[] {
  const seen = new Set(existing.map(forgeRowKey))
  const result = existing.slice()
  for (const row of incoming) {
    const key = forgeRowKey(row)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(row)
  }
  return result
}

/**
 * 用一行的新版本替换列表里的那一行。
 *
 * 找不到就**原样返回**（不追加）：一个不在当前结果集里的行不该因为被写回过就
 * 凭空出现 —— 关掉一个 issue 之后它不该继续挂在「进行中」的列表里。
 */
export function replaceForgeRow(
  rows: ForgeIssueRow[],
  updated: ForgeIssueRow
): ForgeIssueRow[] {
  const index = rows.findIndex((row) => isSameForgeRow(row, updated))
  if (index < 0) return rows
  const next = rows.slice()
  next[index] = updated
  return next
}

/**
 * 新建的条目插到列表首位。
 *
 * 已经在列表里（服务端返回的行恰好也在当前页）就走替换，避免出现两份。
 */
export function prependForgeRow(
  rows: ForgeIssueRow[],
  created: ForgeIssueRow
): ForgeIssueRow[] {
  if (rows.some((row) => isSameForgeRow(row, created))) {
    return replaceForgeRow(rows, created)
  }
  return [created, ...rows]
}

/**
 * 一个新建的条目**是否应该**出现在当前列表里。
 *
 * 只有在「当前 tab 是 issues」且「排序是把最新的放在前面」且「筛选不会把它排除」
 * 时才插入。否则乐观地插进去等于撒谎：用户按 `oldest` 排序，新建的 issue 出现在
 * 第一行，一刷新就消失了。
 */
export function shouldPrependNewIssue(filter: ForgeFilterState): boolean {
  if (filter.tab !== "issues") return false
  if (filter.sort !== "newest" && filter.sort !== "recently_updated") return false
  // 新建的 issue 必然是 open 的，所以 closed 筛选下它不属于这个结果集。
  if (filter.state === "closed") return false
  // 搜索与「指派给我」都无法在本地判定（一个要问 forge 的全文索引，一个要问
  // 当前身份），此时宁可不插 —— 少一行比多一行不该在的假行好。
  if (normalizeForgeSearch(filter.keyword)) return false
  if (filter.assignedMe) return false
  // 标签筛选可以本地判定（AND 语义），交给调用方按创建结果的 labels 自己比。
  return true
}

/** 新建的行是否满足当前的标签筛选（AND 语义，与两个 forge 一致）。 */
export function matchesForgeLabelFilter(
  row: Pick<ForgeIssueRow, "labels">,
  filter: ForgeFilterState
): boolean {
  const wanted = normalizeForgeLabelFilter(filter.labels)
  if (wanted.length === 0) return true
  const owned = new Set(row.labels.map((label) => label.name))
  return wanted.every((name) => owned.has(name))
}
