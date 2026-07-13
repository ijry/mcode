import fs from "node:fs"
import path from "node:path"

describe("GoalToolCallBlock layout", () => {
  function readSource() {
    return fs.readFileSync(
      path.resolve(__dirname, "../../../src/components/GoalToolCallBlock.vue"),
      "utf8"
    )
  }

  it("switches the expanded goal card away from pill clipping", () => {
    const source = readSource()

    expect(source).toContain("expanded && 'goal-card--expanded'")
    expect(source).toMatch(/\.goal-card\s*\{[\s\S]*border-radius:\s*999rpx;[\s\S]*overflow:\s*hidden;/)
    expect(source).toMatch(/\.goal-card--expanded\s*\{[\s\S]*border-radius:\s*24rpx;[\s\S]*overflow:\s*visible;/)
  })

  it("adds a bottom collapse affordance inside the expanded body", () => {
    const source = readSource()

    expect(source).toContain('class="goal-card__collapse" @click.stop="collapseExpanded"')
    expect(source).toContain('class="goal-card__collapse-text">收起</text>')
    expect(source).toContain("function collapseExpanded()")
    expect(source).toContain("expanded.value = false")
  })
})
