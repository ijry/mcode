import { DEFAULT_FORGE_FILTER, type ForgeFilterState } from "@/pages/forge/forgeFilterState"
import {
  appendForgeRows,
  forgeCountsScope,
  forgeListScope,
  forgeRowKey,
  isSameForgeRow,
  matchesForgeLabelFilter,
  prependForgeRow,
  replaceForgeRow,
  shouldPrependNewIssue,
} from "@/pages/forge/forgeListScope"
import type { ForgeIssueRow } from "@/types/forge"

function filterWith(overrides: Partial<ForgeFilterState> = {}): ForgeFilterState {
  return { ...DEFAULT_FORGE_FILTER, ...overrides }
}

function rowWith(overrides: Partial<ForgeIssueRow> = {}): ForgeIssueRow {
  return {
    number: 1,
    title: "t",
    body: null,
    state: "open",
    draft: false,
    labels: [],
    author: null,
    author_avatar: null,
    updated_at: null,
    html_url: "",
    is_pr: false,
    comments: 0,
    ...overrides,
  }
}

describe("forgeListScope", () => {
  it("changes with every field that changes the result set", () => {
    const base = forgeListScope("c", 1, filterWith())
    expect(forgeListScope("c", 1, filterWith({ tab: "prs" }))).not.toBe(base)
    expect(forgeListScope("c", 1, filterWith({ state: "closed" }))).not.toBe(base)
    expect(forgeListScope("c", 1, filterWith({ assignedMe: true }))).not.toBe(base)
    expect(forgeListScope("c", 1, filterWith({ labels: ["bug"] }))).not.toBe(base)
    expect(forgeListScope("c", 1, filterWith({ keyword: "x" }))).not.toBe(base)
    expect(forgeListScope("c", 1, filterWith({ sort: "oldest" }))).not.toBe(base)
    expect(forgeListScope("c", 1, filterWith({ perPage: 50 }))).not.toBe(base)
    expect(forgeListScope("c", 2, filterWith())).not.toBe(base)
    expect(forgeListScope("d", 1, filterWith())).not.toBe(base)
  })

  /** 归一化之后相同的筛选是同一个作用域 —— 否则一个尾随空格会白白作废整页缓存。 */
  it("is stable across equivalent filters", () => {
    expect(forgeListScope("c", 1, filterWith({ keyword: "  x  " }))).toBe(
      forgeListScope("c", 1, filterWith({ keyword: "x" }))
    )
    expect(forgeListScope("c", 1, filterWith({ labels: ["bug", "bug"] }))).toBe(
      forgeListScope("c", 1, filterWith({ labels: ["bug"] }))
    )
  })
})

describe("forgeCountsScope", () => {
  /**
   * **这一条是「切 tab 不发请求」的全部理由**：计数作用域不含 tab，所以来回切 tab
   * 之后已缓存的那个数字仍然描述当前结果集。
   */
  it("does not change when only the tab changes", () => {
    expect(forgeCountsScope("c", 1, filterWith({ tab: "issues" }))).toBe(
      forgeCountsScope("c", 1, filterWith({ tab: "prs" }))
    )
  })

  /** 排序与页大小不可能改变一个计数，带上会让改排序白白作废两个徽章。 */
  it("ignores the sort and the page size", () => {
    const base = forgeCountsScope("c", 1, filterWith())
    expect(forgeCountsScope("c", 1, filterWith({ sort: "oldest" }))).toBe(base)
    expect(forgeCountsScope("c", 1, filterWith({ perPage: 50 }))).toBe(base)
  })

  it("still tracks the repository and every real filter", () => {
    const base = forgeCountsScope("c", 1, filterWith())
    expect(forgeCountsScope("c", 2, filterWith())).not.toBe(base)
    expect(forgeCountsScope("c", 1, filterWith({ state: "all" }))).not.toBe(base)
    expect(forgeCountsScope("c", 1, filterWith({ assignedMe: true }))).not.toBe(base)
    expect(forgeCountsScope("c", 1, filterWith({ labels: ["bug"] }))).not.toBe(base)
    expect(forgeCountsScope("c", 1, filterWith({ keyword: "x" }))).not.toBe(base)
  })
})

describe("forgeRowKey", () => {
  /**
   * `kind:number` 而不是裸 number：GitHub 的 issue 与 PR 共享一个编号空间，但
   * **GitLab 的 issue 与 MR 各有一套** —— 裸 number 在 GitLab 上会让两者互相覆盖。
   */
  it("keeps an issue and a pull request of the same number apart", () => {
    expect(forgeRowKey({ number: 42, is_pr: false })).toBe("issue:42")
    expect(forgeRowKey({ number: 42, is_pr: true })).toBe("pr:42")
    expect(isSameForgeRow({ number: 42, is_pr: false }, { number: 42, is_pr: true })).toBe(false)
  })
})

describe("appendForgeRows", () => {
  /**
   * 按身份去重而不是无脑 concat：两个 forge 都可能在两次请求之间插入新行，那会把
   * 第 1 页的末条挤到第 2 页，于是它出现两次（Vue 的 `:key` 重复 → 渲染错乱）。
   */
  it("drops a row that already landed on an earlier page", () => {
    const existing = [rowWith({ number: 3 }), rowWith({ number: 2 })]
    const incoming = [rowWith({ number: 2 }), rowWith({ number: 1 })]
    expect(appendForgeRows(existing, incoming).map((row) => row.number)).toEqual([3, 2, 1])
  })

  /**
   * 重复的那一行**保留旧的**：新的那份来自更晚的请求，但用户可能已经在这一行上
   * 做过写回（关闭 / 合并），而 GitHub 的 search 索引落后写入几秒 —— 覆盖等于把
   * 刚做完的事撤销。
   */
  it("keeps the row already on screen rather than the newer copy", () => {
    const existing = [rowWith({ number: 2, state: "closed" })]
    const incoming = [rowWith({ number: 2, state: "open" })]
    expect(appendForgeRows(existing, incoming)[0].state).toBe("closed")
  })

  it("keeps a pull request and an issue of the same number", () => {
    const result = appendForgeRows(
      [rowWith({ number: 1, is_pr: false })],
      [rowWith({ number: 1, is_pr: true })]
    )
    expect(result).toHaveLength(2)
  })
})

describe("replaceForgeRow", () => {
  it("swaps the row in place", () => {
    const rows = [rowWith({ number: 1 }), rowWith({ number: 2, state: "open" })]
    const next = replaceForgeRow(rows, rowWith({ number: 2, state: "closed" }))
    expect(next[1].state).toBe("closed")
    expect(next[0]).toBe(rows[0])
  })

  /**
   * 找不到就原样返回，**不追加** —— 一个不在当前结果集里的行不该因为被写回过就
   * 凭空出现（关掉一个 issue 之后它不该继续挂在「进行中」的列表里）。
   */
  it("does not resurrect a row that left the result set", () => {
    const rows = [rowWith({ number: 1 })]
    expect(replaceForgeRow(rows, rowWith({ number: 9 }))).toBe(rows)
  })
})

describe("prependForgeRow", () => {
  it("puts a new row first", () => {
    const next = prependForgeRow([rowWith({ number: 1 })], rowWith({ number: 2 }))
    expect(next.map((row) => row.number)).toEqual([2, 1])
  })

  /** 服务端返回的行恰好也在当前页时走替换，避免出现两份。 */
  it("replaces instead of duplicating when it is already there", () => {
    const next = prependForgeRow(
      [rowWith({ number: 2, state: "open" })],
      rowWith({ number: 2, state: "closed" })
    )
    expect(next).toHaveLength(1)
    expect(next[0].state).toBe("closed")
  })
})

describe("shouldPrependNewIssue", () => {
  it("inserts under the default triage filter", () => {
    expect(shouldPrependNewIssue(filterWith())).toBe(true)
    expect(shouldPrependNewIssue(filterWith({ sort: "recently_updated" }))).toBe(true)
  })

  /**
   * 乐观插入必须诚实。用户按 `oldest` 排序时把新 issue 放在第一行，一刷新就消失了
   * —— 那比不插更糟，因为它让用户以为列表坏了。
   */
  it("refuses when the new row would not really sort first", () => {
    expect(shouldPrependNewIssue(filterWith({ sort: "oldest" }))).toBe(false)
    expect(shouldPrependNewIssue(filterWith({ sort: "least_recently_updated" }))).toBe(false)
  })

  it("refuses on the pull request tab and under a closed filter", () => {
    expect(shouldPrependNewIssue(filterWith({ tab: "prs" }))).toBe(false)
    expect(shouldPrependNewIssue(filterWith({ state: "closed" }))).toBe(false)
  })

  /**
   * 搜索与「指派给我」都无法在本地判定（一个要问 forge 的全文索引，一个要问当前
   * 身份），此时宁可不插 —— 少一行比多一行不该在的假行好。
   */
  it("refuses what it cannot judge locally", () => {
    expect(shouldPrependNewIssue(filterWith({ keyword: "crash" }))).toBe(false)
    expect(shouldPrependNewIssue(filterWith({ assignedMe: true }))).toBe(false)
  })
})

describe("matchesForgeLabelFilter", () => {
  it("passes everything when no label is selected", () => {
    expect(matchesForgeLabelFilter(rowWith(), filterWith())).toBe(true)
  })

  /** AND 语义，与两个 forge 一致 —— 选两个标签是「同时带这两个」而不是「带任一个」。 */
  it("requires every selected label", () => {
    const row = rowWith({ labels: [{ name: "bug", color: null }] })
    expect(matchesForgeLabelFilter(row, filterWith({ labels: ["bug"] }))).toBe(true)
    expect(matchesForgeLabelFilter(row, filterWith({ labels: ["bug", "p1"] }))).toBe(false)
  })
})
