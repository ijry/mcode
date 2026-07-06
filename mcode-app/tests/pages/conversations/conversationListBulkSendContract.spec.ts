import fs from "node:fs"
import path from "node:path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8")
}

function extractBlock(source: string, startToken: string, endToken: string) {
  const start = source.indexOf(startToken)
  const end = source.indexOf(endToken, start)
  if (start < 0 || end < 0) {
    throw new Error(`Failed to extract block from ${startToken}`)
  }
  return source.slice(start, end)
}

describe("P67 conversation list bulk send contract", () => {
  it("renders selection controls only on top-level live cards", () => {
    const source = read("../../../src/pages/conversations/index.vue")

    expect(source).toContain('class="conversations-header__select"')
    expect(source).toContain('{{ selectionMode ? "取消" : "选择" }}')
    expect(source).toContain('v-if="selectionMode && isSelectableLiveCard(card)"')
    expect(source).toContain("bulk-select-check")
    expect(source).toContain('@click="handleLiveCardClick(card, group.key)"')

    const historyBlock = extractBlock(
      source,
      '<view v-else class="history-list">',
      '<!-- 创建会话底部弹层 -->'
    )
    expect(historyBlock).not.toContain("bulk-select-check")
    expect(historyBlock).not.toContain("toggleConversationSelection")
    expect(historyBlock).not.toContain("handleLiveCardClick")
  })

  it("routes top-level card taps to selection toggling before detail navigation", () => {
    const source = read("../../../src/pages/conversations/index.vue")
    const block = extractBlock(
      source,
      "function handleLiveCardClick(card: LiveSessionCard, groupKey: string) {",
      "\nfunction openLiveSession(card: LiveSessionCard, groupKey?: string) {"
    )

    expect(block).toContain("if (selectionMode.value) {")
    expect(block).toContain("toggleConversationSelection(card, groupKey)")
    expect(block).toContain("return")
    expect(block).toContain("openLiveSession(card, groupKey)")
    expect(block.indexOf("toggleConversationSelection(card, groupKey)"))
      .toBeLessThan(block.indexOf("openLiveSession(card, groupKey)"))
  })
})
