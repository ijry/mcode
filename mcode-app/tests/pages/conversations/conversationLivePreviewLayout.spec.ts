import fs from "node:fs"
import path from "node:path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8")
}

describe("conversation live preview layout contract", () => {
  it("renders live preview text through the marquee component", () => {
    const source = read("../../../src/pages/conversations/index.vue")

    expect(source).toContain('import MarqueeText from "@/components/MarqueeText.vue"')
    expect(source).toContain('<MarqueeText class="live-card__preview" :text="card.livePreviewText" />')
    expect(source).toContain(".live-card__preview-row")
  })

  it("keeps running live session cards ahead of idle cards", () => {
    const source = read("../../../src/pages/conversations/index.vue")

    expect(source).toContain("sortLiveSessionCardsByRunning(")
    expect(source).toContain('statusClass(a.card.displayStatus) === "running" ? 0 : 1')
    expect(source).toContain("return a.index - b.index")
  })

  // 顺序必须完全由 `buildConnectionConversationSnapshot` 决定（纯按活跃时间降序）。
  // 页面这里曾经写成 `[...openTabCards, ...recentActiveCards]`，把标签组整体钉在前面 ——
  // 于是一个 4 天前的标签压在 5 分钟前的会话上面，用户看到的就是「24H 顺序不对」。
  // `sortLiveSessionCardsByRunning` 的 tiebreak 是原始下标，所以它保留（而不是修正）
  // 传进来的顺序 —— 这条断言是唯一防它退回去的东西。
  it("renders cards in the snapshot's own time order", () => {
    const source = read("../../../src/pages/conversations/index.vue")

    expect(source).toContain("cards: snapshot.cards")
    expect(source).not.toContain("[...snapshot.openTabCards, ...snapshot.recentActiveCards]")
  })

  // 顺序不再表达「这个会话在 PC 上开着」，所以那个信息必须落到一枚角标上，
  // 否则合并排序之后它就彻底消失了。
  it("marks open tabs with a badge instead of a position", () => {
    const source = read("../../../src/pages/conversations/index.vue")

    expect(source).toContain('v-if="card.isOpenTab"')
    expect(source).toContain(".live-card__tab-flag")
    // 深色模式：色值只能作为 var() 的 fallback（AGENTS.md）。
    expect(source).toContain("color: var(--up-primary, #2979ff);")
  })

  it("measures overflow before enabling marquee scrolling", () => {
    const source = read("../../../src/components/MarqueeText.vue")

    expect(source).toContain('query.select(".marquee").boundingClientRect()')
    expect(source).toContain('query.select(".marquee__probe").boundingClientRect()')
    expect(source).toContain("textWidth <= wrapWidth + 1")
    expect(source).toContain("animationDuration")
  })

  it("keeps marquee typography stable after switching into scrolling mode", () => {
    const source = read("../../../src/components/MarqueeText.vue")
    const trackStyle = source.slice(source.indexOf(".marquee__track {"), source.indexOf(".marquee__track--scroll {"))

    expect(trackStyle).toContain("font-size: inherit;")
    expect(trackStyle).toContain("font-weight: inherit;")
    expect(trackStyle).toContain("line-height: inherit;")
    expect(trackStyle).toContain("color: inherit;")
  })
})
