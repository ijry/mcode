import fs from "fs"
import path from "path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, "../../../src", relativePath), "utf8")
}

/**
 * 流式指示器（三个点）的源码契约。
 *
 * 用户反馈：实时消息底部的三个点贴着气泡下沿、颜色太淡看不出来。这里锁的是「唯独源码
 * 能表达」的两件事 —— 底部留白存在、点色走强调色而不是边框色。真实盒高与可见度由
 * Chromium 渲染测量兜底（见 docs/mcode-architecture-notes/ 对应笔记），源码断言挡不住
 * box-sizing 之类的渲染回归。
 */
describe("streaming typing dots contract", () => {
  const bubble = read("components/MessageBubble.vue")

  function rule(selector: string) {
    // 锚定行首：`.dot {` 也是 `.bubble-wrap--cyber .dot {` 的子串，裸 indexOf 会抓到主题覆盖。
    const index = bubble.indexOf(`\n${selector} {`)
    expect(index).toBeGreaterThan(-1)
    return bubble.slice(index + 1, bubble.indexOf("\n}", index) + 2)
  }

  it("reserves bottom padding under the dots", () => {
    // 点原本紧贴气泡下沿，视觉上像被裁掉了半个。
    const dots = rule(".typing-dots")
    expect(dots).toContain("padding-top: 8rpx;")
    expect(dots).toContain("padding-bottom: 16rpx;")
    expect(dots).toContain("align-items: center;")
  })

  it("aligns the dots with the markdown text left edge", () => {
    // `.bubble` 内距 6px，但 `.part-text :deep(.up-markdown)` 自己还有 `padding: 1px 2px`，
    // 所以正文左沿在 8px，而点只有 6px。补 4rpx(=2px) 让两者对齐。
    const dots = rule(".typing-dots")
    expect(dots).toContain("padding-left: 4rpx;")
  })

  it("uses a neutral gray the dots are actually visible in", () => {
    const dot = rule(".dot")
    // --up-border-color 是分割线级别的浅灰，在气泡背景上几乎看不见；
    // --up-tips-color 同样太淡（实测峰值 3.15、谷值 1.58）。
    expect(dot).not.toContain("var(--up-border-color, #dadbde)")
    expect(dot).not.toContain("var(--up-tips-color")
    // 用户要求走灰色系而不是蓝色系。--up-content-color 是灰阶里唯一比原来的蓝更亮眼的
    // （峰值 6.11 vs 3.98，谷值 1.98 vs 1.80）。
    expect(dot).not.toContain("var(--up-primary, #2979ff)")
    expect(dot).toContain("var(--up-content-color, #606266)")
    expect(dot).toContain("width: 12rpx;")
    expect(dot).toContain("height: 12rpx;")
  })

  it("keeps the dimmed keyframe above the visibility floor", () => {
    const frames = bubble.slice(
      bubble.indexOf("@keyframes blink {"),
      bubble.indexOf("\n}", bubble.indexOf("@keyframes blink {")) + 2,
    )
    // 0.3 的谷值配浅色点等于「有一半时间是隐形的」。
    expect(frames).not.toContain("opacity: 0.3;")
    expect(frames).toContain("opacity: 0.45;")
  })

  it("still lets each theme override the dot color", () => {
    // 三主题的气泡背景各不相同，强调色只能作为默认值，不能吃掉主题覆盖。
    for (const scope of ["cyber", "theme-sweet", "theme-summer"]) {
      expect(bubble).toContain(`.bubble-wrap--${scope} .dot {`)
    }
  })

  it("darkens the sweet/summer dots that measured invisible on near-white bubbles", () => {
    // 实测（Chromium，375px）：#f472b6 / #fb7185 在各自气泡上峰值对比度仅 2.59 / 2.62，
    // 动画谷值掉到 1.5x —— 肉眼基本是背景色。加深到 4.4+ 峰值。
    expect(bubble).toContain("background-color: #db2777;")
    expect(bubble).toContain("background-color: #e11d48;")
    expect(bubble).not.toContain("background-color: #f472b6;")
    expect(bubble).not.toContain("background-color: #fb7185;")
  })
})
