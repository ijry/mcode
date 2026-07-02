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
    expect(source).not.toMatch(/\.tool-group__summary\s*\{[\s\S]*\.tool-group__label[\s\S]*var\(--up-primary/)
    expect(source).not.toContain("&--completed { background: #8f9bb3; }")
  })

  it("keeps assistant bubbles borderless", () => {
    const source = readComponent("MessageBubble.vue")
    const assistantBubbleRule = source.match(/&--assistant\s*\{[\s\S]*?\n  \}/)?.[0] || ""

    expect(assistantBubbleRule).toContain("background-color: var(--up-card-bg-color, #ffffff);")
    expect(assistantBubbleRule).not.toContain("border:")
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
