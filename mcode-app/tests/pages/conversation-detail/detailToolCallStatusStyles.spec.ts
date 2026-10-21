import fs from "node:fs"
import path from "node:path"

function readComponent(name: string) {
  return fs.readFileSync(
    path.resolve(__dirname, "../../../src/components", name),
    "utf8"
  )
}

describe("P48 conversation detail tool call status styles", () => {
  /**
   * 分组摘要。设计稿 M09「新配色」把整条时间线收成一张纸面 —— 工具调用不再套胶囊，
   * 而是「一行小字 + 可点展开」。这里断言的是**容器确实是透明的、且仍可点**，
   * 不再是某个具体的胶囊底色。
   */
  it("renders grouped tool call summaries as bare rows on the page surface", () => {
    const source = readComponent("ToolCallGroupBlock.vue")

    expect(source).toContain('class="tool-group__summary"')
    expect(source).not.toContain("tool-group__summary--${groupStatus}")
    expect(source).toContain(":name=\"expanded ? 'arrow-down' : 'arrow-right'\"")
    expect(source).not.toContain("tool-group__dot")
    expect(source).toMatch(/\.tool-group\s*\{[\s\S]*align-items: flex-start;/)
    expect(source).toMatch(/\.tool-group__summary\s*\{[\s\S]*align-self: flex-start;[\s\S]*max-width: 100%;/)
    // 透明确认：不再有 hover 底色混色，也不再有药丸圆角
    // （只在该规则块内部断言 —— 用 `[\s\S]*` 会一直吃到文件末尾，命中别的规则）
    const summaryRule = source.match(/\n\.tool-group__summary\s*\{[\s\S]*?\n\}/)?.[0] || ""
    expect(summaryRule).toContain("background: transparent;")
    expect(summaryRule).not.toContain("background: color-mix(")
    expect(summaryRule).not.toContain("border-radius: 999rpx;")
    expect(summaryRule).not.toContain("border:")
    expect(source).toMatch(/\.tool-group__body\s*\{[\s\S]*width: 100%;/)
    // 半透明变体同样不引入边框/底色 —— 否则时间线会重新出现一条胶囊。
    const translucentSummaryRule = source.match(/\.tool-group__summary--translucent\s*\{[\s\S]*?\n\}/)?.[0] || ""
    expect(translucentSummaryRule).toContain("background: transparent;")
    expect(translucentSummaryRule).not.toContain("border:")
    expect(source).not.toMatch(/\.tool-group__summary\s*\{[\s\S]*\.tool-group__label[\s\S]*var\(--up-primary/)
    expect(source).not.toContain("&--completed { background: #8f9bb3; }")
  })

  /**
   * AI 气泡。新配色里它是**透明容器**（正文直接铺在纸面上），
   * 与用户气泡的中性灰形成左右对比，不再靠白卡片区分角色。
   */
  it("keeps assistant bubbles free of any background", () => {
    const source = readComponent("MessageBubble.vue")
    const assistantBubbleRule = source.match(/&--assistant\s*\{[\s\S]*?\n  \}/)?.[0] || ""

    expect(assistantBubbleRule).toContain("background-color: transparent;")
    expect(assistantBubbleRule).toContain("padding: 0;")
    expect(assistantBubbleRule).not.toContain("border:")

    // 用户气泡改中性灰（不再是主色蓝）。注意 `.bubble-wrap--user` 里也有个
    // `&--user { flex-direction: row-reverse }`，要锚到 `.bubble {` 之后那段。
    const userBubbleRule = source.match(/\n\.bubble \{[\s\S]*?&--user\s*\{[\s\S]*?\n  \}/)?.[0] || ""
    expect(userBubbleRule).toContain("var(--bubble-user-bg, #e9e9ee)")
    expect(userBubbleRule).not.toContain("var(--up-primary")
  })

  it("renders thinking as a bare text row with no surface", () => {
    const source = readComponent("MessageBubble.vue")
    const thinkingRule = source.match(/\n\.part-thinking\s*\{[\s\S]*?\n\}/)?.[0] || ""

    expect(source).toContain("<text class=\"thinking-hd__label\">思考</text>")
    expect(source).not.toContain("深度思考")
    expect(thinkingRule).toContain("align-self: flex-start;")
    expect(thinkingRule).toContain("width: fit-content;")
    expect(thinkingRule).not.toContain("border-left: 4rpx solid")

    // 思考块不再是卡片/药丸：无底色、无边框、无内距。
    // 有内距会把文字左沿推到正文右侧，同一条消息里几段内容左边界参差。
    expect(thinkingRule).toContain("padding: 0;")
    expect(thinkingRule).toContain("background: none;")
    expect(thinkingRule).toContain("border: none;")
    expect(thinkingRule).not.toContain("color-mix(")
    expect(thinkingRule).not.toContain("999rpx")
    expect(thinkingRule).not.toContain("16rpx 20rpx")

    const expandedRule = source.match(/\.part-thinking--expanded\s*\{[\s\S]*?\n\}/)?.[0] || ""
    expect(source).toContain("part-thinking--expanded")
    // 展开态也不切卡片，否则一展开间距就跳
    expect(expandedRule).toContain("padding: 0;")
    expect(expandedRule).not.toContain("12rpx")
    expect(expandedRule).not.toContain("999rpx")
  })

  it("keeps the thinking row aligned with the message text edge", () => {
    // 思考行去底色后不再与 tool-group__summary / subagent__summary 共用「药丸度量」，
    // 那条约束只在有底色时成立。现在它对齐的是正文左沿：零内距 + 内容高度，
    // 否则会比同一条消息里的工具行更高、更空。
    const source = readComponent("MessageBubble.vue")
    const collapsedRule = source.match(/\.part-thinking--collapsed\s*\{[\s\S]*?\n\}/)?.[0] || ""
    const baseRule = source.match(/\n\.part-thinking\s*\{[\s\S]*?\n\}/)?.[0] || ""

    expect(collapsedRule).toContain("min-height: 0;")
    expect(collapsedRule).toContain("padding: 0;")
    expect(collapsedRule).toContain("border: none;")
    // 48rpx 的药丸下限在无底色时会撑出一段空白
    expect(collapsedRule).not.toContain("min-height: 48rpx;")
    expect(collapsedRule).not.toContain("999rpx")

    expect(baseRule).toContain("box-sizing: border-box;")
    // 半透明变体排在折叠态之后且同为单类选择器，必须显式复位，否则背景/边框回来。
    expect(source).toContain(".part-thinking--collapsed.part-thinking--translucent")

    // 展开正文左缩进对齐标题文字（图标 24rpx + gap 10rpx），否则去底色后层级消失
    const bodyRule = source.match(/\.thinking-bd\s*\{[\s\S]*?\n\}/)?.[0] || ""
    expect(bodyRule).toContain("padding-left: 34rpx;")

    const iconRule = source.match(/\.thinking-hd__icon\s*\{[\s\S]*?\n\}/)?.[0] || ""
    expect(iconRule).toContain("width: 24rpx;")
    expect(iconRule).toContain("height: 24rpx;")

    const labelRule = source.match(/\.thinking-hd__label\s*\{[\s\S]*?\n\}/)?.[0] || ""
    expect(labelRule).toContain("font-size: 22rpx;")
    expect(labelRule).toContain("line-height: 1.2;")

    // 箭头与其它摘要胶囊同为 12 号。
    const thinkingArrowBlock = source.match(/:name="isThinkingCollapsed\(index\)[\s\S]*?<\/up-icon>/)?.[0] || ""
    expect(thinkingArrowBlock).toContain('size="12"')

    /*
     * 同类摘要控件里**只剩**子智能体胶囊还是药丸形。
     *
     * 工具组摘要、思考行在新配色里都已退成裸文本行（见上面两个用例）。
     * 子智能体胶囊仍然保留 48rpx 药丸度量 —— 它是唯一还带底色、需要
     * 「看起来可以展开」的那一个。只保留真正同形的 peers，
     * 否则这条断言会随每次视觉迭代误报。
     */
    const pillPeers = [
      readComponent("SubagentCapsuleBlock.vue").match(/\.subagent__summary\s*\{[\s\S]*?\n\}/)?.[0] || "",
    ]
    for (const peer of pillPeers) {
      expect(peer).toContain("min-height: 48rpx;")
      expect(peer).toContain("padding: 10rpx 18rpx;")
    }
  })

  it("themes subagent capsules and markdown tables inside every message surface", () => {
    const source = readComponent("MessageBubble.vue")
    // matrix 主题额外挂 `bubble-wrap--cyber`，sweet/summer 走 `bubble-wrap--theme-<name>`。
    for (const scope of ["cyber", "theme-sweet", "theme-summer"]) {
      expect(source).toContain(`.bubble-wrap--${scope} :deep(.subagent__summary)`)
      expect(source).toContain(`.bubble-wrap--${scope} :deep(.subagent__body)`)
      expect(source).toContain(`.bubble-wrap--${scope} :deep(table)`)
      expect(source).toContain(`.bubble-wrap--${scope} :deep(th)`)
      expect(source).toContain(`.bubble-wrap--${scope} :deep(td)`)
    }
    expect(source).toContain(":deep(table)")
    expect(source).toContain(":deep(thead)")
    expect(source).toContain(":deep(tbody)")
    expect(source).toContain(":deep(tr)")
    expect(source).toContain(":deep(th)")
    expect(source).toContain(":deep(td)")
  })

  it("keeps message code blocks horizontally scrollable without making every markdown root a scroll container", () => {
    // 横向滚动必须留着（代码块会超宽），但**不能**由 `._root` 提供：
    // 纵向 scroll-view 里每条消息一个动量滚动容器，在 iOS WKWebView 下既各占一个
    // 合成层、又会和外层纵向滚动抢手势（手指稍斜就被内层捕获，列表划不动）。
    // 见 2026-09-03-23-57-detail-streaming-performance-audit 的 P0-10。
    const source = readComponent("MessageBubble.vue")
    const codeRule = source.match(/\.part-text\s*\{[\s\S]*?\n\}/)?.[0] || ""

    expect(codeRule).toContain("min-width: 0;")
    expect(source).toContain(":deep(.up-markdown ._root)")
    expect(source).toContain(":deep(.up-markdown-code)")
    expect(source).toContain("white-space: pre;")

    // `._root` 既不滚动，也不带动量滚动。
    const rootRule =
      source.match(/:deep\(\.up-markdown \._root\)\s*\{[\s\S]*?\n {2}\}/)?.[0] || ""
    expect(rootRule).toContain("overflow: hidden;")
    expect(rootRule).not.toContain("overflow-x: auto;")
    expect(rootRule).not.toContain("-webkit-overflow-scrolling: touch;")

    // 代码块自己是滚动容器。
    const markdownCodeRule =
      source.match(/:deep\(\.up-markdown-code\)\s*\{[\s\S]*?\n {2}\}/)?.[0] || ""
    expect(markdownCodeRule).toContain("overflow-x: auto;")
    expect(markdownCodeRule).not.toContain("width: max-content;")
  })

  it("renders the context-compaction system note as the same neutral pill", () => {
    // 用户报「会话已压缩样式太难看，应该跟普通胶囊一样」：早先那版是橙色告警卡
    // （warning 边框 + 橙底 + info 图标 + 600 字重橙字）。它只是背景信息，
    // 不该比正文更抢眼 —— 形制必须与 `tool-group__summary` 逐条相同。
    const source = readComponent("MessageBubble.vue")
    const summaryRule = source.match(/\n\.system-note__summary\s*\{[\s\S]*?\n\}/)?.[0] || ""

    expect(summaryRule).toContain("border-radius: 999rpx;")
    expect(summaryRule).toContain(
      "background: color-mix(in srgb, var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6)) 60%, var(--up-card-bg-color, #ffffff) 40%);"
    )
    expect(summaryRule).toContain("align-self: flex-start;")
    // 无边框是这套胶囊的定义性特征（见 2026-08-17-tool-call-group-summary-style）。
    expect(summaryRule).not.toContain("border:")
    expect(summaryRule).not.toContain("--up-warning")

    // 标签跟 tool-group__label 同款：22rpx、常规字重、content 色。600 字重会让它抢戏。
    const labelRule = source.match(/\n\.system-note__label\s*\{[\s\S]*?\n\}/)?.[0] || ""
    expect(labelRule).toContain("font-size: 22rpx;")
    expect(labelRule).toContain("color: var(--up-content-color, #606266);")
    expect(labelRule).not.toContain("font-weight")

    // 箭头与另两处胶囊统一（size 12 + --up-light-color），且没有正文时不挂箭头 ——
    // 一个点不开的箭头比不挂更糟。
    expect(source).toContain(`v-if="systemNoteHasBody"`)
    expect(source).toContain(`:color="upThemeVar('--up-light-color', '#c0c4cc')"`)
    expect(source).not.toContain('name="info-circle"')

    // 主题类必须挂在 system-note 自己的根上：它是 .bubble-wrap 的 v-else 兄弟，
    // `.bubble-wrap--cyber :deep(.system-note__summary)` 永远选不中。
    expect(source).toContain("`system-note--theme-${detailTheme}`")
    expect(source).not.toContain(":deep(.system-note")
    for (const theme of ["matrix", "sweet", "summer"]) {
      expect(source).toContain(`.system-note--theme-${theme} .system-note__summary`)
      expect(source).toContain(`.system-note--theme-${theme} .system-note__label`)
    }
  })

  /**
   * 单个工具调用的状态色。
   *
   * 新配色把「图标 + 工具名 + 状态标签」整块换成了「彩色状态点 + 一句摘要」，
   * 所以这里断言的是状态点本身的语义色与四个状态，而不是旧的颜色映射表。
   */
  it("colors individual tool status dots by semantic state", () => {
    const source = readComponent("ToolCallBlock.vue")

    expect(source).toContain("tool-block--${toolCall.status || 'pending'}")
    expect(source).toContain("tool-status-dot--${toolCall.status || 'pending'}")

    // 运行中：绿点 + 呼吸动画（设计稿的「运行中」绿）
    expect(source).toMatch(/&--running\s+\{ background-color: #34c759; animation: pulse/)
    // 完成态刻意用中性灰，避免时间线里一路绿灯抢注意力
    expect(source).toMatch(/&--completed \{ background-color: var\(--up-tips-color, #909193\);/)
    expect(source).toMatch(/&--error\s+\{ background-color: var\(--up-error, #fa3534\);/)
    expect(source).toMatch(/&--pending\s+\{ background-color: var\(--up-warning, #f9ae3d\);/)

    // 展开态的成败标记仍然走 uview 运行时主题变量
    expect(source).toContain(":color=\"upThemeVar('--up-success', '#19be6b')\"")
    expect(source).toContain(":color=\"upThemeVar('--up-error', '#fa3534')\"")

    // 折叠态没有容器（否则时间线又会出现一圈圈的描边卡片）
    const baseRule = source.match(/\.tool-block\s*\{[\s\S]*?\n  \}/)?.[0] || ""
    expect(baseRule).not.toContain("border:")
    expect(baseRule).not.toContain("background-color: var(--up-hover-bg-color")

    // 摘要必须是「动词 + 目标」，而不是裸工具名
    expect(source).toContain("编辑 ${target}")
    expect(source).toContain("运行 ${firstLine")
  })
})
