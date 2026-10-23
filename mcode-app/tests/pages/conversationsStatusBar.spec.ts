import fs from "node:fs"
import path from "node:path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8")
}

const PAGE = "../../src/pages/conversations/index.vue"
const NAVBAR = "../../src/pages/conversations/components/ConversationsNavbar.vue"

/**
 * 会话列表「顶栏穿透到状态栏」的契约。
 *
 * 症状（用户报的）：「导航栏没有穿透到顶部状态栏」—— 顶栏玻璃上方压着一条与页面不同色的
 * 带子，看起来像导航栏从状态栏下沿才开始，内容区与系统状态栏是断开的两块。
 *
 * 成因有两层，缺一层都会复发：
 *   1. navbar 必须**不带底色**（`bgColor` / `statusBarBgColor` 都是 transparent）。
 *      它自带 `u-status-bar` 占位，透明后页面底色会一路透到屏幕最上沿，滚动时卡片也从
 *      状态栏底下穿过 —— 这才是「穿透」。给它任何实色，接缝立刻回来。
 *   2. 状态栏那条色带要涂**页面底色**。app-plus 是 immersive 状态栏（`manifest.json` 的
 *      `statusbar.immersed`），webview 画得到状态栏底下，但系统仍会按我们上报的底色画
 *      最上面一条；iOS standalone 更是完全由系统按 `html`/`body` 背景绘制。
 *      这条带子一旦涂成卡片白，而页面已经是 #F2F2F7 灰，接缝就出现了。
 *
 * 1 由 `ConversationsNavbar` 自己保证，2 由页面的 `syncConversationListNativeStatusBar`
 * 保证；两处的色值必须与 `.conversations-page` 的 `background` 一致，所以这里把三者绑在
 * 一起断言 —— 只改其中一处，测试就红。
 */
describe("conversations status bar bleed-through contract", () => {
  const source = read(PAGE)

  it("unifies the status bar and navbar background via the uview bgColor props", () => {
    // 状态栏与导航内容用同一个色（脚本里 navbarBgColor / navbarStatusBarBgColor 是同一值），
    // 走 uview 的 `bgColor` / `statusBarBgColor` 两个 prop 下传 —— 详情页同款「统一背景色」做法。
    // 不再给状态栏单独叠暗罩：那正是之前状态栏与导航分裂成两截的元凶。
    const navbar = read(NAVBAR)
    expect(navbar).toContain(':bgColor="navbarBgColor"')
    expect(navbar).toContain(':statusBarBgColor="navbarStatusBarBgColor"')

    // 不再有「只盖状态栏」的暗罩 / is-dark 分支：那会在状态栏与导航之间拉出一条缝。
    expect(navbar).not.toContain("rgba(0, 0, 0, 0.3)")
    expect(navbar).not.toContain("is-dark")
    // 也不再用手写 :deep 透明去覆盖 uview 默认底色 —— 底色交给 prop。
    const shell = navbar.slice(navbar.indexOf(".conversations-navbar-shell :deep(.u-navbar--fixed)"))
    expect(shell.slice(0, shell.indexOf("}"))).not.toContain("background: transparent !important")

    // 磨砂必须还在：滚动时底下卡片上来要被糊掉，不能裸透。
    expect(navbar).toContain("backdrop-filter: blur(")
    expect(navbar).toContain("-webkit-backdrop-filter: blur(")
  })

  it("paints the status bar band with the page surface, not the card color", () => {
    const fn = source.slice(source.indexOf("function syncConversationListNativeStatusBar()"))
    const body = fn.slice(0, fn.indexOf("\n}"))

    // 只接受页面底色常量：卡片色比页面底色亮，涂上去就是一条白接缝。
    expect(body).toContain("pageSurfaceColor")
    expect(body).not.toContain("--up-card-bg-color")
    // 色带与页面底色给同一个值，两者不许再分家。
    expect(body).toContain("statusBarBackgroundColor: pageSurfaceColor")
    expect(body).toContain("pageBackgroundColor: pageSurfaceColor")
    expect(body).toContain("backgroundColor: pageSurfaceColor")
  })

  it("keeps the JS surface constants identical to the CSS page background", () => {
    // 两处写死同一个色、靠注释互相提醒，最容易的失败是「改了 CSS 忘了改 JS」
    // （或反之）接缝就悄悄回来了。这里把两边读出来比对。
    const light = /const PAGE_SURFACE_LIGHT = "(#[0-9a-fA-F]{6})"/.exec(source)?.[1]
    const dark = /const PAGE_SURFACE_DARK = "(#[0-9a-fA-F]{6})"/.exec(source)?.[1]
    expect(light).toBeTruthy()
    expect(dark).toBeTruthy()

    const lightBlock = source.slice(source.indexOf(".conversations-page {"))
    const lightBg = /background:\s*(#[0-9a-fA-F]{6})/.exec(lightBlock)?.[1]
    const darkBlock = source.slice(source.indexOf("[data-up-theme='dark'] .conversations-page"))
    const darkBg = /background:\s*(#[0-9a-fA-F]{6})/.exec(darkBlock)?.[1]

    expect(lightBg?.toLowerCase()).toBe(light?.toLowerCase())
    expect(darkBg?.toLowerCase()).toBe(dark?.toLowerCase())
  })

  it("uses opaque 6-digit hex because the service falls back to black otherwise", () => {
    // normalizeHexColor 只认 #rrggbb，`var()` / `rgba()` 会被判非法并回退成黑色 ——
    // 那正是这一页最初「顶部压着一条黑带」的成因。所以两个常量必须是裸的 6 位实色，
    // 不能为了「跟着主题变量走」把它们换成 upThemeVar() 的返回值。
    expect(/const PAGE_SURFACE_LIGHT = "#[0-9a-fA-F]{6}"/.test(source)).toBe(true)
    expect(/const PAGE_SURFACE_DARK = "#[0-9a-fA-F]{6}"/.test(source)).toBe(true)

    const fn = source.slice(source.indexOf("function syncConversationListNativeStatusBar()"))
    const body = fn.slice(0, fn.indexOf("\n}"))
    expect(body).not.toContain("upThemeVar(")
  })
})
