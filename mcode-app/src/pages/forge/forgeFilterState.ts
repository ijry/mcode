import {
  FORGE_DEFAULT_PER_PAGE,
  FORGE_MAX_LABEL_FILTERS,
  FORGE_MAX_PER_PAGE,
  FORGE_MAX_SEARCH_CHARS,
  FORGE_MIN_PER_PAGE,
  type ForgeListFilters,
  type ForgeSort,
  type ForgeStateFilter,
  type ForgeTab,
} from "@/types/forge"

/**
 * 列表筛选状态。**纯模块** —— 不 import uni / pinia / 组件，可以裸测。
 *
 * 这里的每个上限都镜像 Rust 常量，目的是**在发请求之前**拦住 —— 服务端也会 clamp，
 * 但一次注定被 clamp 的请求仍然烧掉一次 GitHub search 配额（30 次/分钟），
 * 而且用户会看到一个和他输入不一致的结果而不知道为什么。
 */

/** 页面持有的筛选状态。比 `ForgeListFilters` 少 `accountId`（那是鉴权，由页面在发请求时补）。 */
export interface ForgeFilterState {
  tab: ForgeTab
  state: ForgeStateFilter
  assignedMe: boolean
  labels: string[]
  /** 搜索框里的原文（未 trim、未截断）—— 归一化发生在构造请求时。 */
  keyword: string
  sort: ForgeSort
  perPage: number
}

/**
 * 默认值。
 *
 * `state: "open"` 与 `sort: "newest"` 是 github.com 自己的 issue 列表的默认，也是
 * triage 的正确起点：**还没处理完的、最新的**。这两个刻意不持久化（见
 * `forgeScopePreference`）—— 一个记着「已关闭 + 最早优先」的面板每次打开都是在
 * 看历史，而不是在看要做的事。
 */
export const DEFAULT_FORGE_FILTER: ForgeFilterState = {
  tab: "issues",
  state: "open",
  assignedMe: false,
  labels: [],
  keyword: "",
  sort: "newest",
  perPage: FORGE_DEFAULT_PER_PAGE,
}

export const FORGE_STATE_OPTIONS: Array<{ value: ForgeStateFilter; label: string }> = [
  { value: "open", label: "进行中" },
  { value: "closed", label: "已关闭" },
  { value: "all", label: "全部" },
]

export const FORGE_SORT_OPTIONS: Array<{ value: ForgeSort; label: string }> = [
  { value: "newest", label: "最新创建" },
  { value: "oldest", label: "最早创建" },
  { value: "recently_updated", label: "最近更新" },
  { value: "least_recently_updated", label: "最久未更新" },
]

/**
 * 搜索词归一化：trim + 截断 + 空串变 null。
 *
 * 空串必须变 `null` 而不是留着 `""`：服务端把 `Some("")` 和 `None` 当两件事处理
 * （前者会进 GitHub 的 `q`，把一个本来能走普通列表端点的查询推到 search 端点上，
 * 白花配额还把可翻页数从无限压到 1000）。
 */
export function normalizeForgeSearch(keyword: string): string | null {
  const trimmed = String(keyword || "").trim()
  if (!trimmed) return null
  return trimmed.length > FORGE_MAX_SEARCH_CHARS
    ? trimmed.slice(0, FORGE_MAX_SEARCH_CHARS)
    : trimmed
}

/**
 * 标签筛选归一化：去空、去重、截断到上限。
 *
 * 去重是必须的 —— 两个 forge 都 AND，重复的标签不改变结果但会白白拉长 GitHub 的
 * `q`（那个字符串本身有 256 字符上限）。
 */
export function normalizeForgeLabelFilter(labels: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const label of labels || []) {
    const name = String(label || "").trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    result.push(name)
    if (result.length >= FORGE_MAX_LABEL_FILTERS) break
  }
  return result
}

/**
 * 页大小 clamp 到服务端的 `1..=100`。
 *
 * 读不出数字时回落到**默认值**而不是下界：`|| 0` 那种写法会把 NaN 变成 0 再 clamp
 * 成 1，于是一次脏输入让列表变成「每次加载 1 条」—— 那是个能用但荒谬的状态，
 * 用户还会以为仓库里只有一条。
 */
export function clampForgePerPage(perPage: number): number {
  const parsed = Number(perPage)
  if (!Number.isFinite(parsed) || parsed <= 0) return FORGE_DEFAULT_PER_PAGE
  return Math.min(FORGE_MAX_PER_PAGE, Math.max(FORGE_MIN_PER_PAGE, Math.trunc(parsed)))
}

/**
 * 状态 + 页码 → 一个请求。
 *
 * `accountId` 由调用方给：它是**鉴权**不是筛选，来源是「这个 host 上被选中的账号」
 * 而不是筛选面板。
 */
export function buildForgeListQuery(
  filter: ForgeFilterState,
  page: number,
  accountId: string | null = null
): ForgeListFilters {
  return {
    tab: filter.tab,
    state: filter.state,
    assignedMe: filter.assignedMe,
    labels: normalizeForgeLabelFilter(filter.labels),
    search: normalizeForgeSearch(filter.keyword),
    sort: filter.sort,
    page: Math.max(1, Math.trunc(page) || 1),
    perPage: clampForgePerPage(filter.perPage),
    accountId,
  }
}

/**
 * 计数请求的载荷。
 *
 * 故意**不含** tab / page / sort：服务端有义务忽略它们，而带着三个被忽略的字段正是
 * 客户端误以为自己设了它们的由来。tab 是 `forge_tab_count` 的独立参数（问的就是
 * 「那个不可见的 tab」），排序不可能改变一个计数。
 */
export function buildForgeCountFilters(
  filter: ForgeFilterState,
  accountId: string | null = null
) {
  return {
    state: filter.state,
    assignedMe: filter.assignedMe,
    labels: normalizeForgeLabelFilter(filter.labels),
    search: normalizeForgeSearch(filter.keyword),
    accountId,
  }
}

/**
 * 有没有生效的筛选 —— 给筛选按钮加一个点。
 *
 * **不算 `tab`**（它自己就在屏幕上，是两个并列的入口而不是一个筛选）也**不算
 * `keyword`**（搜索框里的字自己就是最好的提示）。
 */
export function isForgeFilterActive(filter: ForgeFilterState): boolean {
  return (
    filter.state !== DEFAULT_FORGE_FILTER.state ||
    filter.sort !== DEFAULT_FORGE_FILTER.sort ||
    filter.assignedMe !== DEFAULT_FORGE_FILTER.assignedMe ||
    normalizeForgeLabelFilter(filter.labels).length > 0
  )
}

/** 重置筛选，**保留 tab 与 perPage** —— 前者是用户当前在看哪一栏，后者是设备偏好，两者都不是「筛选」。 */
export function resetForgeFilter(filter: ForgeFilterState): ForgeFilterState {
  return {
    ...DEFAULT_FORGE_FILTER,
    tab: filter.tab,
    perPage: filter.perPage,
  }
}

/** 空列表时该说什么。四档，让用户知道该点哪里而不是盯着一个空白页。 */
export function resolveForgeEmptyText(filter: ForgeFilterState): string {
  const tabWord = filter.tab === "prs" ? "变更" : "Issue"
  if (normalizeForgeSearch(filter.keyword)) return `没有匹配「${filter.keyword.trim()}」的${tabWord}`
  if (isForgeFilterActive(filter)) return `当前筛选下没有${tabWord}，试试放宽条件`
  if (filter.state === "open") return `这个仓库没有进行中的${tabWord}`
  return `这个仓库还没有${tabWord}`
}
