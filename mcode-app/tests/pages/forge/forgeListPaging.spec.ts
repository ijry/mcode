import {
  canLoadMoreForgeRows,
  EMPTY_FORGE_PAGING,
  forgeListFooterKind,
  forgeListFooterText,
  forgeResultSummary,
  maxReachablePage,
  pagingFromList,
  type ForgePagingState,
} from "@/pages/forge/forgeListPaging"
import type { ForgeIssueList } from "@/types/forge"

function pagingWith(overrides: Partial<ForgePagingState> = {}): ForgePagingState {
  return { page: 1, perPage: 20, hasNext: true, totalCount: 100, reachableCount: null, incomplete: false, ...overrides }
}

function listWith(overrides: Partial<ForgeIssueList> = {}): ForgeIssueList {
  return {
    rows: [],
    page: 1,
    per_page: 20,
    total_count: 100,
    reachable_count: null,
    has_next: true,
    incomplete: false,
    ...overrides,
  }
}

describe("pagingFromList", () => {
  it("carries all three nullable signals through", () => {
    const paging = pagingFromList(
      listWith({ total_count: null, reachable_count: 1000, incomplete: true })
    )
    expect(paging.totalCount).toBeNull()
    expect(paging.reachableCount).toBe(1000)
    expect(paging.incomplete).toBe(true)
  })
})

describe("maxReachablePage", () => {
  /** `null` = 没有上限（GitLab 总是如此，GitHub 在查询没撞上限时也是）。 */
  it("has no ceiling when the forge names none", () => {
    expect(maxReachablePage(pagingWith({ reachableCount: null }))).toBeNull()
  })

  it("divides the reachable count by the page size", () => {
    expect(maxReachablePage(pagingWith({ reachableCount: 1000, perPage: 20 }))).toBe(50)
    expect(maxReachablePage(pagingWith({ reachableCount: 1000, perPage: 30 }))).toBe(34)
  })

  /** 0 条可达时上限是第 1 页而不是第 0 页 —— 否则连首屏都不该发。 */
  it("never floors below the first page", () => {
    expect(maxReachablePage(pagingWith({ reachableCount: 0 }))).toBe(1)
  })

  it("cannot divide by a zero page size", () => {
    expect(maxReachablePage(pagingWith({ reachableCount: 100, perPage: 0 }))).toBeNull()
  })
})

describe("canLoadMoreForgeRows", () => {
  it("needs a loaded first page", () => {
    expect(canLoadMoreForgeRows(EMPTY_FORGE_PAGING, false)).toBe(false)
  })

  it("refuses while a request is in flight", () => {
    expect(canLoadMoreForgeRows(pagingWith(), true)).toBe(false)
  })

  it("obeys the forge's own has_next", () => {
    expect(canLoadMoreForgeRows(pagingWith({ hasNext: false }), false)).toBe(false)
    expect(canLoadMoreForgeRows(pagingWith({ hasNext: true }), false)).toBe(true)
  })

  /**
   * **这一条不能省。** GitHub Search 只服务前 1000 条，越过是 422 —— 而它在越过时
   * `has_next` 仍然是 true（那是从 Link 头推的）。照着翻下去就是一次用户看不懂的错误。
   */
  it("stops at the reachable ceiling even while has_next is still true", () => {
    const atCeiling = pagingWith({ page: 50, perPage: 20, reachableCount: 1000, hasNext: true })
    expect(canLoadMoreForgeRows(atCeiling, false)).toBe(false)
    const belowCeiling = pagingWith({ page: 49, perPage: 20, reachableCount: 1000, hasNext: true })
    expect(canLoadMoreForgeRows(belowCeiling, false)).toBe(true)
  })

  /** 没有上限时只看 has_next —— GitLab 的列表可以一直翻。 */
  it("keeps going without a ceiling", () => {
    expect(canLoadMoreForgeRows(pagingWith({ page: 999, reachableCount: null }), false)).toBe(true)
  })
})

describe("forgeResultSummary", () => {
  it("says nothing before the first page lands", () => {
    expect(forgeResultSummary(EMPTY_FORGE_PAGING, 0)).toBe("")
  })

  /**
   * 摘要行是 `total_count` 三态**唯一**能说清楚的地方（tab 徽章只能画一个数字或者
   * 不画），所以三种情形要说三句不同的话。
   */
  it("distinguishes a refused count from a real one", () => {
    expect(forgeResultSummary(pagingWith({ totalCount: null, hasNext: true }), 20)).toContain(
      "不提供总数"
    )
    expect(forgeResultSummary(pagingWith({ totalCount: null, hasNext: false }), 7)).toBe("共 7 条")
  })

  it("owns up to an incomplete search", () => {
    expect(forgeResultSummary(pagingWith({ incomplete: true }), 20)).toContain("超时")
  })

  /** GitHub search 的 1000 条上限：总数是真的，但翻不到那么多。两个数都要给。 */
  it("names both the match count and the reachable cap", () => {
    const summary = forgeResultSummary(
      pagingWith({ totalCount: 24_000, reachableCount: 1000 }),
      40
    )
    expect(summary).toContain("24000")
    expect(summary).toContain("1000")
  })

  it("reports progress against a plain total", () => {
    expect(forgeResultSummary(pagingWith({ totalCount: 137 }), 40)).toBe("已加载 40 / 137 条")
    expect(forgeResultSummary(pagingWith({ totalCount: 40 }), 40)).toBe("共 40 条")
  })

  /** 真的 0 条要说出来 —— 这是 `total_count: 0` 与 `null` 必须分开的原因。 */
  it("states a genuine zero", () => {
    expect(forgeResultSummary(pagingWith({ totalCount: 0, hasNext: false }), 0)).toBe("共 0 条")
  })
})

describe("forgeListFooterKind", () => {
  it("shows the loading state while a page is in flight", () => {
    expect(forgeListFooterKind(pagingWith(), true)).toBe("loading")
  })

  it("invites another page when there is one", () => {
    expect(forgeListFooterKind(pagingWith({ hasNext: true }), false)).toBe("more")
  })

  it("says it ended when the forge has nothing more", () => {
    expect(forgeListFooterKind(pagingWith({ hasNext: false }), false)).toBe("end")
  })

  /**
   * 「forge 还说有下一页但我们不敢翻」与「到底了」是两件事。混成一句会让用户以为
   * 他看到了全部匹配 —— 而实际上有 23000 条在上限之外。
   */
  it("distinguishes hitting the cap from reaching the end", () => {
    const capped = pagingWith({ page: 50, perPage: 20, reachableCount: 1000, hasNext: true })
    expect(forgeListFooterKind(capped, false)).toBe("capped")
    expect(forgeListFooterText("capped")).not.toBe(forgeListFooterText("end"))
    expect(forgeListFooterText("capped")).toContain("上限")
  })

  it("gives every kind its own words", () => {
    const kinds = ["more", "loading", "end", "capped"] as const
    const texts = kinds.map(forgeListFooterText)
    expect(new Set(texts).size).toBe(kinds.length)
    texts.forEach((text) => expect(text).toBeTruthy())
  })
})
