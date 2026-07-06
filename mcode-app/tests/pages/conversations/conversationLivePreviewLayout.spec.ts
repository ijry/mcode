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
