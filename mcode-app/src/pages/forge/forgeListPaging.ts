import type { ForgeIssueList } from "@/types/forge"

/**
 * 追加式分页的判据与摘要文案。**纯模块**。
 *
 * 手机端把桌面端的页码条换成 `onReachBottom` 追加（全仓库惯例）。这不丢能力
 * （任何一行仍能到达），但三个字段的作用位置变了：
 *
 * - `has_next` —— 还有没有下一页；
 * - `reachable_count` —— **天花板**。GitHub Search 只服务前 1000 条，第 1201 页
 *   是 422，所以到达这个上限时**即使 `has_next` 为 true 也必须停**；
 * - `total_count` —— 只进摘要行，不参与分页判断（它可能远大于可翻页数）。
 */

/** 上一次成功的那一页，加上它带来的三个信号。 */
export interface ForgePagingState {
  /** 已经加载到第几页（1 起）。0 = 还没加载过。 */
  page: number
  perPage: number
  hasNext: boolean
  totalCount: number | null
  reachableCount: number | null
  incomplete: boolean
}

export const EMPTY_FORGE_PAGING: ForgePagingState = {
  page: 0,
  perPage: 0,
  hasNext: false,
  totalCount: null,
  reachableCount: null,
  incomplete: false,
}

/** 从一页响应里取出分页状态。 */
export function pagingFromList(list: ForgeIssueList): ForgePagingState {
  return {
    page: list.page,
    perPage: list.per_page,
    hasNext: list.has_next,
    totalCount: list.total_count,
    reachableCount: list.reachable_count,
    incomplete: list.incomplete,
  }
}

/**
 * forge 肯翻到第几页。
 *
 * `null` = 没有上限（GitLab 总是如此，GitHub 在查询没撞上限时也是）。
 * `reachable_count` 为 0 时上限是第 1 页 —— 不是第 0 页，否则连首屏都不该发。
 */
export function maxReachablePage(paging: ForgePagingState): number | null {
  if (paging.reachableCount == null) return null
  if (paging.perPage <= 0) return null
  return Math.max(1, Math.ceil(paging.reachableCount / paging.perPage))
}

/**
 * 还能不能加载下一页。
 *
 * 三个条件都要：forge 说还有（`hasNext`）、没撞天花板、且当前没有请求在飞。
 * 天花板这一条**不能省** —— GitHub 在越过 1000 条时 `has_next` 仍然是 true
 * （它是从 Link 头推的），照着翻下去就是一次 422 和一条用户看不懂的错误。
 */
export function canLoadMoreForgeRows(
  paging: ForgePagingState,
  loading: boolean
): boolean {
  if (loading) return false
  if (paging.page <= 0) return false
  if (!paging.hasNext) return false
  const ceiling = maxReachablePage(paging)
  if (ceiling != null && paging.page >= ceiling) return false
  return true
}

/**
 * 列表下方那条摘要。
 *
 * 这是 `total_count` 三态**唯一**能说清楚的地方 —— tab 徽章只能画一个数字或者
 * 不画（uview 的 `u-tabs` 会把 `value: 0` 吃掉），所以「真的 0 条」「forge 拒绝
 * 计数」「计数不完整」的区别必须在这里表达。
 *
 * `loadedRows` 是已经追加了多少行：在追加式分页里，「已加载 20 / 共 137」比单独
 * 一个总数有用得多。
 */
export function forgeResultSummary(
  paging: ForgePagingState,
  loadedRows: number
): string {
  if (paging.page <= 0) return ""

  if (paging.totalCount == null) {
    // GitLab 超过 1 万行就不给 X-Total。说出来 —— 一个没有总数的列表不该看起来
    // 像「就这 20 条」。
    return paging.hasNext
      ? `已加载 ${loadedRows} 条，该仓库不提供总数`
      : `共 ${loadedRows} 条`
  }

  if (paging.incomplete) {
    // GitHub search 超时，这一页与这个计数都是残缺的。
    return `已加载 ${loadedRows} 条，搜索超时，计数与结果可能有遗漏`
  }

  const ceiling = maxReachablePage(paging)
  const reachable = paging.reachableCount
  if (reachable != null && reachable < paging.totalCount) {
    // GitHub search 的 1000 条上限：总数是真的，但翻不到那么多。两个数都要给,
    // 否则用户会以为列表少了东西。
    return `匹配 ${paging.totalCount} 条，最多可查看 ${reachable} 条（已加载 ${loadedRows} 条）`
  }

  if (loadedRows >= paging.totalCount) return `共 ${paging.totalCount} 条`
  return `已加载 ${loadedRows} / ${paging.totalCount} 条`
}

/** 列表末尾那一行的状态：还能加载 / 正在加载 / 到底了 / 撞到天花板。 */
export type ForgeListFooterKind = "more" | "loading" | "end" | "capped"

export function forgeListFooterKind(
  paging: ForgePagingState,
  loadingMore: boolean
): ForgeListFooterKind {
  if (loadingMore) return "loading"
  if (canLoadMoreForgeRows(paging, false)) return "more"
  const ceiling = maxReachablePage(paging)
  // forge 还说有下一页，但我们不敢翻了 —— 这不是「到底了」，要说清楚。
  if (paging.hasNext && ceiling != null && paging.page >= ceiling) return "capped"
  return "end"
}

export function forgeListFooterText(kind: ForgeListFooterKind): string {
  switch (kind) {
    case "loading":
      return "加载中..."
    case "more":
      return "上拉加载更多"
    case "capped":
      return "已到可查看范围的上限，请缩小筛选范围后重试"
    default:
      return "没有更多了"
  }
}
