import fs from "node:fs"
import path from "node:path"

function readComponent(name: string) {
  return fs.readFileSync(
    path.resolve(__dirname, "../../../src/components", name),
    "utf8"
  )
}

describe("P48 conversation detail tool call status styles", () => {
  it("renders grouped tool call summaries as neutral compact pills", () => {
    const source = readComponent("ToolCallGroupBlock.vue")

    expect(source).toContain('class="tool-group__summary"')
    expect(source).not.toContain("tool-group__summary--${groupStatus}")
    expect(source).toContain(":name=\"expanded ? 'arrow-down' : 'arrow-right'\"")
    expect(source).not.toContain("tool-group__dot")
    expect(source).toMatch(/\.tool-group\s*\{[\s\S]*align-items: flex-start;/)
    expect(source).toMatch(/\.tool-group__summary\s*\{[\s\S]*align-self: flex-start;[\s\S]*max-width: 100%;/)
    expect(source).toMatch(/\.tool-group__summary\s*\{[\s\S]*background: color-mix\(in srgb, var\(--up-hover-bg-color, var\(--up-bg-color, #f3f4f6\)\) 60%, var\(--up-card-bg-color, #ffffff\) 40%\);/)
    expect(source).toMatch(/\.tool-group__body\s*\{[\s\S]*width: 100%;/)
    expect(source).not.toMatch(/\.tool-group__summary\s*\{[\s\S]*border:/)
    const translucentSummaryRule = source.match(/\.tool-group__summary--translucent\s*\{[\s\S]*?\n\}/)?.[0] || ""
    expect(translucentSummaryRule).toContain("background:")
    expect(translucentSummaryRule).not.toContain("border:")
    expect(source).not.toMatch(/\.tool-group__summary\s*\{[\s\S]*\.tool-group__label[\s\S]*var\(--up-primary/)
    expect(source).not.toContain("&--completed { background: #8f9bb3; }")
  })

  it("keeps assistant bubbles borderless", () => {
    const source = readComponent("MessageBubble.vue")
    const assistantBubbleRule = source.match(/&--assistant\s*\{[\s\S]*?\n  \}/)?.[0] || ""

    expect(assistantBubbleRule).toContain("background-color: var(--up-card-bg-color, #ffffff);")
    expect(assistantBubbleRule).not.toContain("border:")
  })

  it("renders thinking as a compact pill with the shorter label", () => {
    const source = readComponent("MessageBubble.vue")
    const thinkingRule = source.match(/\n\.part-thinking\s*\{[\s\S]*?\n\}/)?.[0] || ""

    expect(source).toContain("<text class=\"thinking-hd__label\">思考</text>")
    expect(source).not.toContain("深度思考")
    expect(thinkingRule).toContain("align-self: flex-start;")
    expect(thinkingRule).toContain("width: fit-content;")
    expect(thinkingRule).toContain("border-radius: 999rpx;")
    expect(thinkingRule).not.toContain("border-left: 4rpx solid")

    const expandedRule = source.match(/\.part-thinking--expanded\s*\{[\s\S]*?\n\}/)?.[0] || ""
    expect(source).toContain("part-thinking--expanded")
    expect(expandedRule).toContain("border-radius: 12rpx;")
    expect(expandedRule).not.toContain("999rpx")
  })

  it("keeps the collapsed thinking pill on the shared summary pill metrics", () => {
    // 折叠态的思考胶囊、工具组摘要、子智能体摘要、系统注记是同一类可展开的摘要控件，
    // 高度度量必须一致，否则同一条消息里几枚胶囊会高低不齐。
    const source = readComponent("MessageBubble.vue")
    const collapsedRule = source.match(/\.part-thinking--collapsed\s*\{[\s\S]*?\n\}/)?.[0] || ""
    const baseRule = source.match(/\n\.part-thinking\s*\{[\s\S]*?\n\}/)?.[0] || ""

    expect(collapsedRule).toContain("min-height: 48rpx;")
    expect(collapsedRule).toContain("padding: 10rpx 18rpx;")
    expect(collapsedRule).toContain("border-radius: 999rpx;")
    // 旧的 16rpx 上下内距是把展开态的内距套在了药丸上，收缩后偏高。
    expect(collapsedRule).not.toContain("padding-bottom: 16rpx;")

    // 没有 border-box，`min-height: 48rpx` 会被当成内容盒高度，再叠 20rpx 内距
    // 与 2rpx 边框 —— 实测 72rpx，比同类药丸高 50%。
    expect(baseRule).toContain("box-sizing: border-box;")
    // 药丸态无边框，与 `tool-group__summary` / `subagent__summary` 的约定一致；
    // 留着 1rpx 边框会让药丸比同类高出约 2rpx。
    expect(collapsedRule).toContain("border: none;")
    // 半透明变体排在折叠态之后且同为单类选择器，必须显式复位，否则边框回来。
    expect(source).toContain(".part-thinking--collapsed.part-thinking--translucent")

    const iconRule = source.match(/\.thinking-hd__icon\s*\{[\s\S]*?\n\}/)?.[0] || ""
    expect(iconRule).toContain("width: 24rpx;")
    expect(iconRule).toContain("height: 24rpx;")

    const labelRule = source.match(/\.thinking-hd__label\s*\{[\s\S]*?\n\}/)?.[0] || ""
    expect(labelRule).toContain("font-size: 22rpx;")
    expect(labelRule).toContain("line-height: 1.2;")

    // 箭头与其它摘要胶囊同为 12 号。
    const thinkingArrowBlock = source.match(/:name="isThinkingCollapsed\(index\)[\s\S]*?<\/up-icon>/)?.[0] || ""
    expect(thinkingArrowBlock).toContain('size="12"')

    const pillPeers = [
      readComponent("ToolCallGroupBlock.vue").match(/\.tool-group__summary\s*\{[\s\S]*?\n\}/)?.[0] || "",
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

  it("keeps message code blocks horizontally scrollable", () => {
    const source = readComponent("MessageBubble.vue")
    const codeRule = source.match(/\.part-text\s*\{[\s\S]*?\n\}/)?.[0] || ""

    expect(codeRule).toContain("min-width: 0;")
    expect(source).toContain(":deep(.up-markdown ._root)")
    expect(source).toContain("overflow-x: auto;")
    expect(source).toContain(":deep(.up-markdown-code)")
    expect(source).toContain("white-space: pre;")
    expect(source).toContain("width: max-content;")
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

  it("colors individual tool calls with uview runtime theme variables", () => {
    const source = readComponent("ToolCallBlock.vue")

    expect(source).toContain("tool-block--${toolCall.status || 'pending'}")
    expect(source).toContain("running: \"var(--up-primary, #2979ff)\"")
    expect(source).toContain("completed: \"var(--up-success, #19be6b)\"")
    expect(source).toContain("error: \"var(--up-error, #fa3534)\"")
    expect(source).toContain(":color=\"upThemeVar('--up-success', '#19be6b')\"")
    expect(source).toContain(":color=\"upThemeVar('--up-error', '#fa3534')\"")
    expect(source).toMatch(/&--running\s+\{ background-color: var\(--up-primary, #2979ff\)/)
    expect(source).toMatch(/&--completed \{ background-color: var\(--up-success, #19be6b\)/)
    expect(source).toMatch(/&--error\s+\{ background-color: var\(--up-error, #fa3534\)/)
  })
})
