import {
  buildForgeCountFilters,
  buildForgeListQuery,
  clampForgePerPage,
  DEFAULT_FORGE_FILTER,
  isForgeFilterActive,
  normalizeForgeLabelFilter,
  normalizeForgeSearch,
  resetForgeFilter,
  resolveForgeEmptyText,
  type ForgeFilterState,
} from "@/pages/forge/forgeFilterState"

function filterWith(overrides: Partial<ForgeFilterState> = {}): ForgeFilterState {
  return { ...DEFAULT_FORGE_FILTER, ...overrides }
}

describe("default filter", () => {
  /**
   * `open` + `newest` 是 github.com 自己的默认，也是 triage 的正确起点：
   * 还没处理完的、最新的。这两个刻意不持久化 —— 记着「已关闭 + 最早优先」的面板
   * 每次打开都是在看历史。
   */
  it("starts where a triage list should", () => {
    expect(DEFAULT_FORGE_FILTER.state).toBe("open")
    expect(DEFAULT_FORGE_FILTER.sort).toBe("newest")
    expect(DEFAULT_FORGE_FILTER.assignedMe).toBe(false)
    expect(DEFAULT_FORGE_FILTER.labels).toEqual([])
  })
})

describe("normalizeForgeSearch", () => {
  /**
   * 空串必须变 null。服务端把 `Some("")` 与 `None` 当两件事：前者会进 GitHub 的
   * `q`，把一个本来能走普通列表端点的查询推到 search 端点上 —— 白花配额，还把可翻
   * 页数从无限压到 1000。
   */
  it("turns an empty search into null rather than an empty string", () => {
    expect(normalizeForgeSearch("")).toBeNull()
    expect(normalizeForgeSearch("   ")).toBeNull()
  })

  it("trims what the user typed", () => {
    expect(normalizeForgeSearch("  crash  ")).toBe("crash")
  })

  /** GitHub 把整个 `q` 限制在 256 字符，限定符已经吃掉一些 —— 更长的搜索会变成 422。 */
  it("truncates at the backend's own ceiling", () => {
    const long = "x".repeat(300)
    expect(normalizeForgeSearch(long)).toHaveLength(128)
  })
})

describe("normalizeForgeLabelFilter", () => {
  /** 两个 forge 都 AND，重复标签不改变结果但会白白拉长 GitHub 的 `q`。 */
  it("drops duplicates and blanks", () => {
    expect(normalizeForgeLabelFilter(["bug", "bug", " ", "  p1  "])).toEqual(["bug", "p1"])
  })

  it("stops at the ten-label ceiling", () => {
    const many = Array.from({ length: 25 }, (_, index) => `l${index}`)
    expect(normalizeForgeLabelFilter(many)).toHaveLength(10)
  })

  it("tolerates a missing array", () => {
    expect(normalizeForgeLabelFilter(undefined as any)).toEqual([])
  })
})

describe("clampForgePerPage", () => {
  it("keeps a per-page the backend would honour", () => {
    expect(clampForgePerPage(50)).toBe(50)
  })

  it("clamps an oversized page down to the backend's ceiling", () => {
    expect(clampForgePerPage(500)).toBe(100)
  })

  /**
   * 读不出数字时回落到**默认值**而不是下界 1：clamp 成 1 会让列表变成「每次加载
   * 1 条」—— 那是个能用但荒谬的状态，用户还会以为仓库里只有一条。
   */
  it("falls back to the default rather than to a one-row page", () => {
    expect(clampForgePerPage(0)).toBe(20)
    expect(clampForgePerPage(-5)).toBe(20)
    expect(clampForgePerPage(Number.NaN)).toBe(20)
  })
})

describe("buildForgeListQuery", () => {
  it("normalizes the text and label filters on the way out", () => {
    const query = buildForgeListQuery(
      filterWith({ keyword: "  crash  ", labels: ["bug", "bug"] }),
      1
    )
    expect(query.search).toBe("crash")
    expect(query.labels).toEqual(["bug"])
  })

  it("never asks for page zero", () => {
    expect(buildForgeListQuery(filterWith(), 0).page).toBe(1)
    expect(buildForgeListQuery(filterWith(), -3).page).toBe(1)
  })

  /** accountId 是**鉴权**不是筛选 —— 来源是「这个 host 上被选中的账号」，不是筛选面板。 */
  it("takes the account from the caller, not the filter", () => {
    expect(buildForgeListQuery(filterWith(), 1).accountId).toBeNull()
    expect(buildForgeListQuery(filterWith(), 1, "acc-1").accountId).toBe("acc-1")
  })
})

describe("buildForgeCountFilters", () => {
  /**
   * 计数载荷故意**不含** tab / page / sort：服务端有义务忽略它们，而带着三个被忽略
   * 的字段正是客户端误以为自己设了它们的由来。
   */
  it("omits the three fields a count cannot use", () => {
    const filters = buildForgeCountFilters(filterWith({ tab: "prs", sort: "oldest" }))
    expect(Object.keys(filters).sort()).toEqual([
      "accountId",
      "assignedMe",
      "labels",
      "search",
      "state",
    ])
  })

  it("shares the filter half with the list so the badge cannot contradict it", () => {
    const filter = filterWith({ state: "all", assignedMe: true, labels: ["bug"], keyword: "x" })
    const list = buildForgeListQuery(filter, 1)
    const count = buildForgeCountFilters(filter)
    expect(count.state).toBe(list.state)
    expect(count.assignedMe).toBe(list.assignedMe)
    expect(count.labels).toEqual(list.labels)
    expect(count.search).toBe(list.search)
  })
})

describe("isForgeFilterActive", () => {
  it("is quiet at the defaults", () => {
    expect(isForgeFilterActive(filterWith())).toBe(false)
  })

  it("lights up for every filter the sheet owns", () => {
    expect(isForgeFilterActive(filterWith({ state: "closed" }))).toBe(true)
    expect(isForgeFilterActive(filterWith({ sort: "oldest" }))).toBe(true)
    expect(isForgeFilterActive(filterWith({ assignedMe: true }))).toBe(true)
    expect(isForgeFilterActive(filterWith({ labels: ["bug"] }))).toBe(true)
  })

  /**
   * tab 与 keyword 都**不算**：前者是两个并列的入口而不是一个筛选，后者的搜索框里
   * 的字自己就是最好的提示。给它们加点会让那颗点一直亮着，于是它不再有意义。
   */
  it("ignores the tab and the search box", () => {
    expect(isForgeFilterActive(filterWith({ tab: "prs" }))).toBe(false)
    expect(isForgeFilterActive(filterWith({ keyword: "crash" }))).toBe(false)
  })

  /** 空白标签不算生效 —— 它们在发请求前会被归一化掉。 */
  it("does not count a blank label as a filter", () => {
    expect(isForgeFilterActive(filterWith({ labels: ["  "] }))).toBe(false)
  })
})

describe("resetForgeFilter", () => {
  /** tab 是「当前在看哪一栏」，perPage 是设备偏好 —— 两者都不是筛选，重置不该动它们。 */
  it("keeps the tab and the page size", () => {
    const next = resetForgeFilter(
      filterWith({ tab: "prs", perPage: 50, state: "closed", labels: ["bug"] })
    )
    expect(next.tab).toBe("prs")
    expect(next.perPage).toBe(50)
    expect(next.state).toBe("open")
    expect(next.labels).toEqual([])
  })
})

describe("resolveForgeEmptyText", () => {
  it("names the search term when there is one", () => {
    expect(resolveForgeEmptyText(filterWith({ keyword: " crash " }))).toContain("crash")
  })

  it("suggests loosening the filters when some are on", () => {
    expect(resolveForgeEmptyText(filterWith({ state: "closed" }))).toContain("放宽")
  })

  /** 默认状态下的空列表是「没有进行中的」，不是「这个仓库是空的」—— 两者差别很大。 */
  it("distinguishes no open items from no items at all", () => {
    expect(resolveForgeEmptyText(filterWith())).toContain("进行中")
    expect(resolveForgeEmptyText(filterWith({ state: "all" }))).not.toContain("进行中")
  })

  it("uses the tab's own word", () => {
    expect(resolveForgeEmptyText(filterWith({ tab: "prs" }))).toContain("变更")
    expect(resolveForgeEmptyText(filterWith({ tab: "issues" }))).toContain("Issue")
  })
})
