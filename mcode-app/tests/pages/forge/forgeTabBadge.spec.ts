import {
  EMPTY_FORGE_TAB_COUNT,
  emptyForgeTabCounts,
  forgeTabBadge,
  forgeTabLabel,
  hiddenForgeTab,
  isForgeTabCountFresh,
  shouldProbeForgeTabCount,
  tabCountFromList,
  tabCountFromProbe,
} from "@/pages/forge/forgeTabBadge"
import type { ForgeIssueList } from "@/types/forge"

function listWith(overrides: Partial<ForgeIssueList> = {}): ForgeIssueList {
  return {
    rows: [],
    page: 1,
    per_page: 20,
    total_count: 12,
    reachable_count: null,
    has_next: false,
    incomplete: false,
    ...overrides,
  }
}

describe("tabCountFromList", () => {
  /** 可见 tab 的数字**搭在它自己的列表响应里**，不额外花一次请求。 */
  it("takes the visible tab's number off its own list response", () => {
    expect(tabCountFromList(listWith({ total_count: 12 }), "s")).toEqual({ value: 12, scope: "s" })
  })

  /**
   * `incomplete` 时给 null。一次超时的搜索数到的比实际匹配少，而一个光秃秃的数字
   * 没地方说明这一点 —— 与后端 `ForgeIssueList::trustworthy_count()` 同一个判据。
   */
  it("refuses to publish a count from an incomplete search", () => {
    expect(tabCountFromList(listWith({ total_count: 12, incomplete: true }), "s").value).toBeNull()
  })

  /** forge 拒绝计数时原样保留 null，不压成 0。 */
  it("keeps a refused count null", () => {
    expect(tabCountFromList(listWith({ total_count: null }), "s").value).toBeNull()
  })
})

describe("forgeTabBadge", () => {
  const scope = "s"

  it("draws a positive count", () => {
    expect(forgeTabBadge(tabCountFromProbe(7, scope), scope, "#2979ff")).toEqual({
      value: 7,
      bgColor: "#2979ff",
    })
  })

  /**
   * **这是这个模块存在的理由。** `u-tabs` 的模板是
   * `:value="item.badge && item.badge.value || propsBadge.value"` —— `value: 0` 被
   * `||` 吃掉后落回默认值，`:show` 那条 `!!(… || … || item.badge.value)` 也算 false。
   * 所以 0 与「读不到」都必须返回 `null`（完全不给 badge 对象），区别放到摘要行。
   */
  it("returns null rather than a zero badge uview cannot render", () => {
    expect(forgeTabBadge(tabCountFromProbe(0, scope), scope, "#2979ff")).toBeNull()
    expect(forgeTabBadge(tabCountFromProbe(null, scope), scope, "#2979ff")).toBeNull()
    expect(forgeTabBadge(tabCountFromProbe(-1, scope), scope, "#2979ff")).toBeNull()
  })

  /**
   * 作用域不匹配就是**残留**（上一次筛选的数字还没被替换）。不画，否则改了筛选
   * 之后徽章会先闪一下旧值。
   */
  it("hides a count left over from a previous filter", () => {
    expect(forgeTabBadge(tabCountFromProbe(7, "old"), "new", "#2979ff")).toBeNull()
    expect(forgeTabBadge(EMPTY_FORGE_TAB_COUNT, "new", "#2979ff")).toBeNull()
  })

  it("treats an empty scope as never fresh", () => {
    expect(isForgeTabCountFresh({ value: 7, scope: "" }, "")).toBe(false)
  })
})

describe("shouldProbeForgeTabCount", () => {
  const scope = "s"

  it("probes when the hidden tab's number is stale", () => {
    expect(shouldProbeForgeTabCount(emptyForgeTabCounts(), "issues", scope)).toBe(true)
  })

  /**
   * **配额纪律的核心。** 计数作用域不含 tab，所以切 tab 之后隐藏 tab 的缓存仍然
   * 新鲜 —— 来回切 tab 一次探测都不会发。
   */
  it("does not probe again after merely switching tabs", () => {
    const counts = {
      issues: tabCountFromProbe(3, scope),
      prs: tabCountFromProbe(5, scope),
    }
    expect(shouldProbeForgeTabCount(counts, "issues", scope)).toBe(false)
    expect(shouldProbeForgeTabCount(counts, "prs", scope)).toBe(false)
  })

  it("probes again once the filter moves", () => {
    const counts = {
      issues: tabCountFromProbe(3, "old"),
      prs: tabCountFromProbe(5, "old"),
    }
    expect(shouldProbeForgeTabCount(counts, "issues", "new")).toBe(true)
  })

  /** 只看**隐藏**那个 —— 可见 tab 的数字由它自己的列表响应负责。 */
  it("only looks at the hidden tab", () => {
    const counts = {
      issues: tabCountFromProbe(3, "old"),
      prs: tabCountFromProbe(5, scope),
    }
    // 可见 issues（陈旧）+ 隐藏 prs（新鲜）→ 不探测。
    expect(shouldProbeForgeTabCount(counts, "issues", scope)).toBe(false)
  })
})

describe("hiddenForgeTab", () => {
  it("is always the other one", () => {
    expect(hiddenForgeTab("issues")).toBe("prs")
    expect(hiddenForgeTab("prs")).toBe("issues")
  })
})

describe("forgeTabLabel", () => {
  /** 用户在网页上看到的是哪个词，这里就该是哪个 —— GitLab 叫合并请求，GitHub 叫拉取请求。 */
  it("uses each forge's own word for a proposed change", () => {
    expect(forgeTabLabel("prs", "github")).toBe("拉取请求")
    expect(forgeTabLabel("prs", "gitlab")).toBe("合并请求")
    expect(forgeTabLabel("issues", "gitlab")).toBe("Issue")
  })

  it("falls back to the GitHub wording for an unknown provider", () => {
    expect(forgeTabLabel("prs", "")).toBe("拉取请求")
  })
})
