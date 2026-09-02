import { labelSwatch, neutralLabelSwatch } from "@/pages/forge/forgeLabelColor"

/**
 * 标签配色。
 *
 * 这是**纯函数**，`isDark` 是参数而不是从环境读的 —— 消费方必须把它接成 uview
 * mixin 的 `upThemeIsDark`（响应式 computed），而不是一次性读值。这里的测试锁住
 * 「两种主题下算出来的是两套不同的东西」，那正是接错时会静默丢掉的性质。
 */
describe("labelSwatch", () => {
  it("uses the colour itself as the light-theme fill", () => {
    const swatch = labelSwatch("#d73a4a", false)
    expect(swatch.background).toBe("rgb(215, 58, 74)")
  })

  /** 深色底上用 18% 的填充，而不是原色 —— 原色在深色页面上会刺眼。 */
  it("dims the fill on dark and keeps the colour for the text", () => {
    const swatch = labelSwatch("#d73a4a", true)
    expect(swatch.background).toBe("rgba(215, 58, 74, 0.18)")
    expect(swatch.color).toMatch(/^hsl\(/)
  })

  /** 两种主题必须算出两套值，否则就是 `isDark` 没接上（那是个只在深色下可见的静默失败）。 */
  it("produces a different swatch per theme", () => {
    const light = labelSwatch("#0e8a16", false)
    const dark = labelSwatch("#0e8a16", true)
    expect(dark.background).not.toBe(light.background)
    expect(dark.color).not.toBe(light.color)
  })

  /** 感知亮度决定黑字还是白字（Primer 的 BT.709 阈值）。 */
  it("picks black text over a light fill and white over a dark one", () => {
    expect(labelSwatch("#fbca04", false).color).toBe("#000000")
    expect(labelSwatch("#0e8a16", false).color).toBe("#ffffff")
  })

  /** 近白标签会溶进页面，给它一圈同色压暗的边；普通标签不要边。 */
  it("only rims a near-white label in the light theme", () => {
    expect(labelSwatch("#ffffff", false).border).toMatch(/^hsl\(/)
    expect(labelSwatch("#d73a4a", false).border).toBe("transparent")
  })

  /**
   * `color === null` 走中性胶囊，**不编一个默认色**：forge 给的不是 hex 时
   * （GitLab 写入接受 CSS 颜色名，后端因此拒绝透传）我们并不知道它该是什么颜色。
   */
  it("falls back to the neutral chip when there is no usable colour", () => {
    expect(labelSwatch(null, false)).toEqual(neutralLabelSwatch(false))
    expect(labelSwatch(undefined, true)).toEqual(neutralLabelSwatch(true))
    expect(labelSwatch("rebeccapurple", false)).toEqual(neutralLabelSwatch(false))
    expect(labelSwatch("#12345", false)).toEqual(neutralLabelSwatch(false))
  })

  /** 后端已经归一化过，但三位简写仍要接（手改的存储、未来版本）。 */
  it("accepts a three-digit shorthand and a bare hex", () => {
    expect(labelSwatch("#f00", false).background).toBe("rgb(255, 0, 0)")
    expect(labelSwatch("d73a4a", false).background).toBe("rgb(215, 58, 74)")
  })

  /** 值要进 style 属性，`hsl(0.20000000000000018deg …)` 帮不了任何人读它。 */
  it("rounds the hsl noise out of the values it emits", () => {
    const swatch = labelSwatch("#1d76db", true)
    expect(swatch.color).not.toMatch(/\d{4,}/)
  })

  it("gives the neutral chip a readable contrast in both themes", () => {
    expect(neutralLabelSwatch(false).color).not.toBe(neutralLabelSwatch(true).color)
  })
})
