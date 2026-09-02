import {
  authorInitial,
  relativeTime,
  rowGlyph,
  rowMetaText,
  visibleLabels,
} from "@/pages/forge/forgeRowPresentation"

const NOW = Date.parse("2026-09-02T12:00:00Z")

describe("rowGlyph", () => {
  it("maps the three normalized states", () => {
    expect(rowGlyph({ state: "open", draft: false, is_pr: false }).kind).toBe("open")
    expect(rowGlyph({ state: "closed", draft: false, is_pr: false }).kind).toBe("closed")
    expect(rowGlyph({ state: "merged", draft: false, is_pr: true }).kind).toBe("merged")
  })

  /**
   * 草稿 PR 在线上的 state 是 `open`，但它在 triage 列表里的意思是「还没准备好
   * 给人看」。画成普通的进行中会让人点进去才发现。
   */
  it("lets draft win over the open state on a pull request", () => {
    expect(rowGlyph({ state: "open", draft: true, is_pr: true }).kind).toBe("draft")
  })

  /** issue 的 draft 恒 false，但脏数据不该把一个 issue 画成草稿。 */
  it("ignores a draft flag on an issue", () => {
    expect(rowGlyph({ state: "open", draft: true, is_pr: false }).kind).toBe("open")
  })

  /** 服务端可能新增状态。退化成中性字形，而不是猜一个具体状态（猜错的方向是把已结束的画成还开着）。 */
  it("degrades an unknown state to a neutral glyph", () => {
    const glyph = rowGlyph({ state: "locked", draft: false, is_pr: false })
    expect(glyph.kind).toBe("unknown")
    expect(glyph.label).toBeTruthy()
  })

  /** 三重编码：每个字形都要有图标、颜色兜底与可读文字，只靠颜色对色盲用户不成立。 */
  it("encodes every state with a shape, a colour and a word", () => {
    const kinds = ["open", "closed", "merged", "draft", "unknown"] as const
    const rows = [
      { state: "open", draft: false, is_pr: false },
      { state: "closed", draft: false, is_pr: false },
      { state: "merged", draft: false, is_pr: true },
      { state: "open", draft: true, is_pr: true },
      { state: "???", draft: false, is_pr: false },
    ]
    rows.forEach((row, index) => {
      const glyph = rowGlyph(row)
      expect(glyph.kind).toBe(kinds[index])
      expect(glyph.icon).toBeTruthy()
      expect(glyph.label).toBeTruthy()
      expect(glyph.fallback).toMatch(/^#[0-9a-f]{6}$/i)
    })
  })

  /**
   * merged 刻意没有主题变量：uview 主题表里没有紫色，而紫色是两个 forge 对
   * 「已合并」的共同约定。拿 `--up-primary`（蓝）代替会让它和进行中几乎同色。
   */
  it("keeps merged on its own literal colour rather than a theme variable", () => {
    const glyph = rowGlyph({ state: "merged", draft: false, is_pr: true })
    expect(glyph.themeVar).toBe("")
    expect(glyph.fallback).toBe("#8957e5")
  })
})

describe("visibleLabels", () => {
  const labels = [
    { name: "a", color: null },
    { name: "b", color: null },
    { name: "c", color: null },
  ]

  it("shows up to the limit and reports the rest", () => {
    expect(visibleLabels(labels, 2)).toEqual({ shown: labels.slice(0, 2), hidden: 1 })
  })

  it("shows everything when it fits", () => {
    expect(visibleLabels(labels, 5)).toEqual({ shown: labels, hidden: 0 })
  })

  /** 折行会让同一屏里几行高几行矮 —— 行高必须可预测，所以超出的丢掉并报数。 */
  it("hides everything at a zero limit rather than throwing", () => {
    expect(visibleLabels(labels, 0)).toEqual({ shown: [], hidden: 3 })
  })

  it("defaults to two chips on a phone row", () => {
    expect(visibleLabels(labels).shown).toHaveLength(2)
  })
})

describe("relativeTime", () => {
  /** null 返回空串而不是「刚刚」—— 后者是一个关于时间的断言，而我们什么都不知道。 */
  it("says nothing when the forge gave no timestamp", () => {
    expect(relativeTime(null, NOW)).toBe("")
    expect(relativeTime(undefined, NOW)).toBe("")
    expect(relativeTime("not a date", NOW)).toBe("")
  })

  it("walks the units", () => {
    expect(relativeTime("2026-09-02T11:59:30Z", NOW)).toBe("刚刚")
    expect(relativeTime("2026-09-02T11:30:00Z", NOW)).toBe("30 分钟前")
    expect(relativeTime("2026-09-02T09:00:00Z", NOW)).toBe("3 小时前")
    expect(relativeTime("2026-08-29T12:00:00Z", NOW)).toBe("4 天前")
    expect(relativeTime("2026-06-02T12:00:00Z", NOW)).toBe("3 个月前")
    expect(relativeTime("2024-09-02T12:00:00Z", NOW)).toBe("2 年前")
  })

  /** 时钟偏差或时区处理会给出未来时间，不能画成负数。 */
  it("treats a future timestamp as just now", () => {
    expect(relativeTime("2026-09-03T12:00:00Z", NOW)).toBe("刚刚")
  })
})

describe("authorInitial", () => {
  it("takes an uppercase initial", () => {
    expect(authorInitial("octocat")).toBe("O")
  })

  /** 空作者给 `?` 而不是空白：一个空圆圈读起来像还在加载。 */
  it("falls back to a question mark", () => {
    expect(authorInitial(null)).toBe("?")
    expect(authorInitial("  ")).toBe("?")
  })
})

describe("rowMetaText", () => {
  it("joins number, author and time", () => {
    expect(
      rowMetaText({ number: 42, author: "octocat", updated_at: "2026-09-02T11:30:00Z" }, NOW)
    ).toBe("#42 · octocat · 30 分钟前")
  })

  /** 缺的段落整段消失，不留下悬着的分隔点。 */
  it("drops missing segments without leaving a dangling separator", () => {
    expect(rowMetaText({ number: 7, author: null, updated_at: null }, NOW)).toBe("#7")
    expect(rowMetaText({ number: 7, author: "a", updated_at: null }, NOW)).toBe("#7 · a")
  })
})
