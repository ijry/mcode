import fs from "node:fs"
import path from "node:path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8")
}

const PAGE = "../../src/pages/conversations/index.vue"
const NAVBAR = "../../src/pages/conversations/components/ConversationsNavbar.vue"
const DETAIL = "../../src/pages/conversation-detail/index.vue"

/**
 * 会话列表「状态栏交给 iOS 系统」的契约。
 *
 * 症状（用户三次反馈）：「状态栏跟导航栏是割裂的两块区域，导航栏有磨砂效果，状态栏没有」。
 * 参照系是连接列表 —— 它的状态栏与内容区是一整片，磨砂不是代码，是 iOS 自己控制的。
 *
 * 查证过的机制（WebKit 源码 + iOS 27 真机实测，见 service 内注释）：
 *   1. Apple 文档：`black` / `default` 下 web 内容显示在状态栏**下方**；
 *      `black-translucent` 下内容铺满全屏、被状态栏部分遮挡。
 *   2. iOS 26/27 在 standalone 页面**顶部**画一条 Liquid Glass 滚动边缘带（实测约 75pt），
 *      采样滚动到它下面的内容 —— 连接列表「一整片」靠的是这条系统带。
 *   3. WebKit 的 `_shouldHideTopScrollPocket` 只有在页面顶部找不到带底色的 fixed/sticky
 *      容器时才画这条带；一旦找到，就用那个盒子的颜色把带子填掉。
 *
 * 所以契约是三件事，缺一件就复发：
 *   1. meta 走 `black`（service 的 "system" 档）—— 由页面的 sync 显式钉住，
 *      也负责把详情页（webview 档）留下的 translucent 写回来（SPA 的 meta 是文档级的）。
 *   2. 顶栏 **fixed + 全透明**：三件套必须置顶（常驻控件，滚走就没了入口），
 *      但整层不许有颜色。WebKit 填掉系统带需要「颜色」：命中测试撞上的第一个
 *      fixed 祖先若带背景色，就用它填带（fixed colour extension）；透明 = 取不到
 *      色 = 带子照画（vcctrl 实证：0px 高、取不到色的固定条「仍然模糊」）。
 *      iOS standalone 下状态栏占位为 0（webview 从状态栏下方开始、env inset=0），
 *      46px 导航行整个落进约 75pt 的系统带里被系统糊掉。
 *   3. 页面底色必须涂准且与 `.conversations-page` 的 CSS 背景同值：系统玻璃带采样到的、
 *      Android app-plus immersed 状态栏透出的、橡皮筋回弹露出的都是这个色。
 *
 * 曾经的反面方案（已删）：black-translucent + fixed 玻璃 navbar 自绘状态栏段。
 * 系统带照画（vcctrl 实测「translucent 让 header 移进带里，带还在」），手工玻璃与
 * 系统材质对不上 —— 割裂。解法不是把玻璃画得更好，是不画。
 */
describe("conversations status bar hand-off contract", () => {
  const source = read(PAGE)

  it("pins the standalone status bar meta to the system painter (black)", () => {
    const fn = source.slice(source.indexOf("function syncConversationListNativeStatusBar()"))
    const body = fn.slice(0, fn.indexOf("\n}"))

    // 显式写 "system"，不依赖默认值 —— 防止后来人「好心」照搬详情页的 webview 档。
    expect(body).toContain('iosStatusBarPainter: "system"')
    expect(body).not.toContain("black-translucent")
    expect(body).not.toContain('iosStatusBarPainter: "webview"')

    // 调用点挂在 onShow 上：从详情页（webview 档）返回时必须把 meta 写回来，
    // 主题在「我的」页切换后回到列表也同样只触发 onShow。
    const onShow = source.slice(source.indexOf("onShow(() => {"))
    expect(onShow.slice(0, onShow.indexOf("\n})"))).toContain(
      "syncConversationListNativeStatusBar()"
    )
  })

  it("keeps the detail page on the webview painter so the two do not drift", () => {
    // 详情页顶部是 fixed navbar + 不透明色带，带子由页面自己画 —— 它与列表页是两种
    // 合法的档位，但必须各自显式，不能靠同一个默认值蒙混。
    const detail = read(DETAIL)
    expect(detail).toContain('iosStatusBarPainter: "webview"')
    // 列表页不许出现 detail 的档位。
    expect(source).not.toContain('iosStatusBarPainter: "webview"')
  })

  // 置顶是硬需求，但「不自己处理背景色」的约束不变：fixed 可以，上色不行。
  // WebKit 的 _shouldHideTopScrollPocket 只在命中点找到**带底色**的 fixed 盒子时
  // 才用它的颜色填掉系统带（fixed colour extension）—— 透明层取不到色，带子照画。
  it("pins the top bar but keeps the fixed layer colourless", () => {
    const navbar = read(NAVBAR)

    // 置顶：三件套是常驻控件。fixed 层全宽、z-index 压过列表内容。
    expect(navbar).toContain("position: fixed")
    expect(navbar).toContain("z-index: 10")
    // 但 up-navbar 那套固定容器机制（自带 placeholder 与背景）不许回来。
    expect(navbar).not.toContain("up-navbar")
    expect(navbar).not.toContain(":fixed=")
    expect(navbar).not.toContain(":placeholder=")
    // fixed 不占流：占位根等高撑出（状态栏占位 + 46px 导航行）。
    expect(navbar).toContain("conversations-navbar__fixed")
    expect(navbar).toContain("statusBarInset")
    expect(navbar).toContain("height: 46px;")
    // iOS standalone 下状态栏占位为 0：webview 从状态栏下方开始（env inset=0），
    // 填了系统状态栏高度反而会把导航行推出口袋带。
    expect(navbar).toContain("isIosStandaloneDisplayMode")
    expect(navbar).toContain("uni.getWindowInfo?.()")
    // 页面侧也不许再把顶栏包回固定容器。
    expect(source).not.toContain("up-navbar")
  })

  it("paints nothing over the status bar area", () => {
    const navbar = read(NAVBAR)
    // 只查样式块：注释里会留下这些词的历史记录（讲清楚为什么删），那不是代码。
    const styles = navbar.slice(navbar.indexOf("<style"))

    // 自绘材质全部删除：磨砂、玻璃底、渐变、暗罩。留着任何一样都会与系统材质不一致。
    expect(styles).not.toContain("backdrop-filter")
    expect(styles).not.toContain("linear-gradient")
    expect(styles).not.toContain("rgba(242, 242, 247")
    expect(styles).not.toContain("rgba(0, 0, 0, 0.3)")
    // 占位条唯一的要求是透明。
    const spacer = styles.slice(styles.indexOf(".conversations-navbar__statusbar {"))
    expect(spacer.slice(0, spacer.indexOf("}"))).toContain("background: transparent")
    // fixed 层本身也必须透明：它是命中测试撞上的那个盒子，一带色就会触发
    // WebKit 的 fixed colour extension 把系统玻璃带填掉。半透明底色也不行。
    const fixed = styles.slice(styles.indexOf(".conversations-navbar__fixed {"))
    expect(fixed.slice(0, fixed.indexOf("}"))).toContain("background: transparent")
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
    // 两处写死同一个色、靠注释互相提醒，最容易的失败是「改了 CSS 忘了 JS」
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
