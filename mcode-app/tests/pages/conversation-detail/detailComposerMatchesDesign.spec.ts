import fs from "node:fs"
import path from "node:path"

function read(relativePath: string) {
  return fs.readFileSync(
    path.resolve(__dirname, "../../../src", relativePath),
    "utf8"
  )
}

/**
 * 输入区（composer）的形制对齐设计稿 M09 / M10。
 *
 * 设计稿里输入区是**三件套直接铺在纸面上**（节点 9:13 / 9:71）：
 * 白色圆形加号、浅灰圆角输入框、深色圆角发送键，三者外层没有共同容器 ——
 * 没有容器底色、描边、圆角、阴影，也没有那层 16rpx 内距。
 *
 * 旧实现把它们包在一张 76% 白卡片里，于是屏幕上多出一圈设计稿里不存在的
 * 「输入区卡片」，且外层 16rpx 内距 + 内层 12px 内距把输入框压窄了两倍。
 *
 * 这些断言钉的是**结果**（哪条规则必须存在/必须不存在），不是写法细节。
 */
describe("detail composer matches the M09 design", () => {
  const body = read("pages/conversation-detail/ConversationDetailBody.vue")
  const page = read("pages/conversation-detail/index.vue")
  const pane = read("pages/conversation-detail/ConversationDetailInteractivePane.vue")
  const styles = read("pages/conversation-detail/index.scss")

  it("removes the card shell around the composer", () => {
    // 外壳的六个属性必须一起归零：只清背景会留下一圈描边/阴影，
    // 只清描边又会留下一张半透明底板 —— 都还是「卡片」。
    expect(body).toMatch(/\.input-wrap--bare\s*\{[\s\S]*?background:\s*none;/)
    expect(body).toMatch(/\.input-wrap--bare\s*\{[\s\S]*?border:\s*0;/)
    expect(body).toMatch(/\.input-wrap--bare\s*\{[\s\S]*?padding:\s*0;/)
    expect(body).toMatch(/\.input-wrap--bare\s*\{[\s\S]*?box-shadow:\s*none;/)
    expect(body).toMatch(/\.input-wrap--bare\s*\{[\s\S]*?backdrop-filter:\s*none;/)
  })

  it("applies the bare shell only for the default theme", () => {
    // 三套实验主题（cyber / sweet / summer）保留原来的卡片形制，
    // 所以它是开关而不是直接把基础样式改掉。
    expect(page).toContain(':bare-composer="detailTheme === \'default\'"')
    expect(pane).toContain(':bare-composer="bareComposer"')
    expect(body).toContain("input-wrap--bare")
    expect(body).toContain("bareComposer?: boolean")
  })

  it("no longer injects an inline card background into the composer wrapper", () => {
    // 曾经的 `:style="upThemeCardStyle"` 会往这层塞内联 background，
    // 内联样式压过 class，bare 形制就永远生效不了。
    expect(page).not.toContain('input-wrap-style="detailTheme')
    expect(pane).not.toContain(':input-wrap-style="inputWrapStyle"')
    expect(body).not.toContain("resolvedInputWrapStyle")
  })

  it("keeps the full 44px geometry for all three controls", () => {
    // 加号：白底正圆；输入框：浅灰 14px 圆角；发送键：深色 14px 圆角。
    expect(styles).toMatch(/\.tool-toggle-btn\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/)
    expect(styles).toMatch(/\.tool-toggle-btn\s*\{[\s\S]*?border-radius:\s*999px;/)
    expect(styles).toMatch(/\.input-box\s*\{[\s\S]*?border-radius:\s*14px;/)
    expect(styles).toMatch(/\.input-box\s*\{[\s\S]*?min-height:\s*44px;/)
    expect(styles).toMatch(/\.send-btn\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/)
    expect(styles).toMatch(/\.send-btn\s*\{[\s\S]*?border-radius:\s*14px;/)
    expect(styles).toMatch(/\.input-main-row\s*\{[\s\S]*?gap:\s*10px;[\s\S]*?padding:\s*8px 12px;/)
  })

  it("keeps the send button at the single design colour in both themes", () => {
    // 设计稿六张画板取的发送键底色都是 #48484a，连只有占位文字时也一样；
    // 旧实现给了「未激活 #c7c7cc / 激活 #48484a」两档，屏幕上是两个不同的键。
    //
    // 两个块必须分别切出来断言：浅色块的范围是 `.page {` 到深色块之前，
    // 早先直接切到 `.page--cyber` 会把深色块也吞进去 —— 那样即使浅色值被改回
    // #c7c7cc，断言仍会命中深色块里的 #48484a 而假通过（变异实测确实如此）。
    const lightStart = styles.indexOf(".page {")
    const darkStart = styles.indexOf("[data-up-theme='dark'] .page")
    expect(lightStart).toBeGreaterThan(-1)
    expect(darkStart).toBeGreaterThan(lightStart)

    const lightVars = styles.slice(lightStart, darkStart)
    expect(lightVars).toContain("--send-btn-bg: #48484a;")
    expect(lightVars).not.toContain("--send-btn-bg: #c7c7cc;")

    const darkVars = styles.slice(darkStart, styles.indexOf(".page--cyber"))
    expect(darkVars).toContain("--send-btn-bg: #48484a;")

    // 兜底值也必须同色：变量缺失时（自定义主题、独立复用）不能再退回浅灰。
    // 注意 `.page--cyber .send-btn {` 也以 `.send-btn {` 结尾，所以不能用
    // indexOf 定位 —— 那会命中 cyber 主题块。直接匹配带 geometry 的基础规则。
    expect(styles).toMatch(
      /\.send-btn\s*\{[\s\S]*?width:\s*44px;[\s\S]*?background-color:\s*var\(--send-btn-bg,\s*#48484a\);/
    )
    expect(styles).not.toContain("var(--send-btn-bg, #c7c7cc)")
  })

  it("sizes the send icon to the design's 18px", () => {
    // 设计稿的发送图标框是 18×18（节点 9:39 / 9:97），旧实现用了 22。
    const at = pane.indexOf("'send-btn',")
    expect(at).toBeGreaterThan(-1)
    const sendBlock = pane.slice(at, at + 900)
    expect(sendBlock).toContain('size="18"')
    expect(sendBlock).not.toContain('size="22"')
  })

  it("computes the plus icon colour from the app theme, not from a CSS var lookup", () => {
    // `upThemeVar` 只查 uview 自己的 theme.vars / config.color，
    // 读不到我们挂在 .page 上的变量 —— 用它取自定义变量会恒拿 fallback，
    // 深色下图标就变成浅色值（在黑底上消失）。
    expect(pane).toContain("composerIconColor")
    expect(pane).toMatch(/upThemeIsDark/)
    expect(pane).toContain(": composerIconColor")
  })
})
