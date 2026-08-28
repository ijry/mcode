import fs from "node:fs"
import path from "node:path"

/**
 * 默认主题状态胶囊的边框旋转动画契约。
 *
 * 用户要求：默认主题的状态胶囊也要有跟黑客帝国一样的边框旋转动画。默认主题本来就已经
 * 具备全部图层（`::before` 的 conic-gradient + `::after` 的实色遮罩只露边缘），唯一缺的
 * 是 animation。这里锁的是「动画规则挂在不依赖 cyberActive 的状态类上」——`cyberActive`
 * 在非 matrix 主题恒为 false，默认主题拿不到 `.detail-body--cyber-active`。
 */
describe("default theme status capsule border spin", () => {
  const body = fs.readFileSync(
    path.resolve(__dirname, "../../../src/pages/conversation-detail/ConversationDetailBody.vue"),
    "utf8",
  )

  function rule(selectorBlockStart: string) {
    const index = body.indexOf(`\n${selectorBlockStart}`)
    expect(index).toBeGreaterThan(-1)
    return body.slice(index + 1, body.indexOf("\n}", index) + 2)
  }

  it("spins the border on running/pending without requiring the cyber-active class", () => {
    const block = rule(".input-status-wrap--status-running::before,")
    expect(block).toContain(".input-status-wrap--status-pending::before")
    expect(block).toContain("animation: inputStatusLedSpin")
    // 不能带 cyber 前缀，否则默认主题永远匹配不上。
    expect(block).not.toContain("detail-body--cyber")
  })

  it("keeps idle/online/error capsules static in the default theme", () => {
    const block = rule(".input-status-wrap--status-idle::before,")
    expect(block).toContain(".input-status-wrap--status-online::before")
    expect(block).toContain(".input-status-wrap--status-error::before")
    expect(block).toContain("animation: none")
  })

  it("lets the cyber theme keep its own gradient and faster streaming cadence", () => {
    // cyber 侧规则权重更高（两个类）且排在默认规则之后，颜色/时长覆盖必须仍然存在。
    expect(body).toContain(".detail-body--cyber-active .input-status-wrap::before")
    expect(body).toContain(".detail-body--cyber-active.detail-body--streaming .input-status-wrap::before")
    expect(body).toContain("animation-duration: 0.95s;")
  })

  it("still disables the spin under reduced motion", () => {
    const reduced = body.slice(
      body.indexOf("@media (prefers-reduced-motion: reduce) {"),
      body.indexOf("@keyframes inputStatusLedSpin"),
    )
    expect(reduced).toContain(".input-status-wrap::before")
    expect(reduced).toContain("animation: none !important")
  })
})
