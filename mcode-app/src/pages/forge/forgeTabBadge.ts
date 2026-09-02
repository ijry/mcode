import type { ForgeIssueList, ForgeTab } from "@/types/forge"

/**
 * tab 徽章。**纯模块**。
 *
 * ## 为什么这个文件存在
 *
 * `u-tabs` 的模板是：
 *
 * ```
 * <u-badge :show="!!(item.badge && (item.badge.show || item.badge.isDot || item.badge.value))"
 *          :value="item.badge && item.badge.value || propsBadge.value" … />
 * ```
 *
 * 两处 `||` 都会把 `value: 0` 吃掉：`show` 算出 false，`value` 落回默认的 `''`。
 * `u-badge` 自己的 `showZero` 也因此拿不到 0。**这个不能靠传参绕过去** ——
 * 所以徽章只画 `> 0` 的数字，`0` 与「读不到」一律不画。
 *
 * 但状态里必须保留 `number | null` 三态，否则摘要行没有东西可说。这就是
 * `ForgeTabCount` 把 `value` 与 `scope` 绑在一起、而**每个 tab 各有一份**的原因：
 * 两个数字来自不同来源、不同时刻（可见 tab 的数字搭在列表响应里，不可见 tab 的
 * 来自一次单独的探测请求）。挂在一对上会逼你在「丢掉还没跟上的那个」（每次改
 * 筛选徽章闪一下）和「原样留着」（分不清是当前答案还是残留）之间选一个，两个都错。
 */

export interface ForgeTabCount {
  /** `null` = forge 拒绝计数，或这一页残缺（`incomplete`）所以数字不可信。 */
  value: number | null
  /** 这个数字描述的是哪个结果集（`forgeCountsScope` 的输出）。不匹配就是残留。 */
  scope: string
}

export const EMPTY_FORGE_TAB_COUNT: ForgeTabCount = { value: null, scope: "" }

export type ForgeTabCounts = Record<ForgeTab, ForgeTabCount>

export function emptyForgeTabCounts(): ForgeTabCounts {
  return { issues: { ...EMPTY_FORGE_TAB_COUNT }, prs: { ...EMPTY_FORGE_TAB_COUNT } }
}

/**
 * 可见 tab 的计数**从列表响应里取**，不额外发请求。
 *
 * `incomplete` 时给 `null`：一次超时的搜索数到的比实际匹配少，而一个光秃秃的数字
 * 没地方说明这一点。列表可以在自己旁边带上这个说明（摘要行），徽章只能对或者没有。
 * 这与后端 `ForgeIssueList::trustworthy_count()` 是同一个判据。
 */
export function tabCountFromList(list: ForgeIssueList, scope: string): ForgeTabCount {
  return { value: list.incomplete ? null : list.total_count, scope }
}

/** 探测请求（`forge_tab_count`）的结果。`null` 原样保留 —— 它就是「forge 不肯数」。 */
export function tabCountFromProbe(value: number | null, scope: string): ForgeTabCount {
  return { value, scope }
}

/** 这份计数还在描述当前结果集吗。 */
export function isForgeTabCountFresh(count: ForgeTabCount, scope: string): boolean {
  return Boolean(count.scope) && count.scope === scope
}

/**
 * 传给 `u-tabs` 的 `list[i].badge`。
 *
 * `null` 才是「不画」—— 不要给 `{value: 0}` 或 `{show: false}`：前者会被 uview 的
 * `||` 吃掉后落回默认值（可能画出别的东西），后者仍然进 `!!(… || …)` 的判断链。
 */
export function forgeTabBadge(
  count: ForgeTabCount,
  scope: string,
  bgColor: string
): { value: number; bgColor: string } | null {
  if (!isForgeTabCountFresh(count, scope)) return null
  if (count.value == null || count.value <= 0) return null
  return { value: count.value, bgColor }
}

/** 哪个 tab 需要单独探测 —— 永远是**不可见**的那个（可见的搭在列表响应里）。 */
export function hiddenForgeTab(tab: ForgeTab): ForgeTab {
  return tab === "issues" ? "prs" : "issues"
}

/**
 * 现在该不该发那次探测请求。
 *
 * 只有在「不可见 tab 的缓存数字已经不描述当前筛选了」时才发。这条判据是配额纪律的
 * 核心：切 tab 不改变 `countsScope`（它不含 tab），所以来回切 tab **一次探测都不会
 * 发**；改筛选才会。
 */
export function shouldProbeForgeTabCount(
  counts: ForgeTabCounts,
  tab: ForgeTab,
  scope: string
): boolean {
  return !isForgeTabCountFresh(counts[hiddenForgeTab(tab)], scope)
}

export function forgeTabLabel(tab: ForgeTab, provider: string): string {
  if (tab === "issues") return "Issue"
  // GitLab 叫合并请求，GitHub 叫拉取请求 —— 用户在网页上看到的是哪个词，这里就该是哪个。
  return provider === "gitlab" ? "合并请求" : "拉取请求"
}
