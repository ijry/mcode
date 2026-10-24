import fs from "node:fs"
import path from "node:path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8")
}

const PAGE = "../../../src/pages/conversations/index.vue"
const SERVICE = "../../../src/services/iosStandaloneStatusBar.ts"

describe("conversation list iOS standalone status bar", () => {
  // iOS standalone 下 meta 固定 `black`：状态栏交还 iOS 系统绘制（系统材质 + iOS 26/27
  // 滚动玻璃模糊），与连接列表（走 index.html 默认 black、从不调本 service）逐字一致。
  // 列表页调这个 service 是为了把 theme-color / html/body 背景同步成页面底色
  // （Android app-plus immersed 与橡皮筋回弹都吃这个色）。
  it("syncs the standalone status bar band from the page", () => {
    const source = read(PAGE)

    expect(source).toContain(
      'import { syncIosStandaloneStatusBar } from "@/services/iosStandaloneStatusBar"'
    )
    expect(source).toContain("function syncConversationListNativeStatusBar() {")
    expect(source).toContain("syncIosStandaloneStatusBar({")
  })

  // 色带底色必须是 6 位实色：service 的 normalizeHexColor 会把 var()/rgba() 判非法后回退成
  // 黑色，那正是要修的黑带。navbar 已改为 fixed 但全透明、不再有玻璃色常量，但 pageSurfaceColor 仍是
  // theme-color / html / body / Android 色带的唯一来源，一样不能传表达式。
  it("passes a resolved hex color instead of a CSS var expression", () => {
    const source = read(PAGE)
    const block = source.slice(
      source.indexOf("function syncConversationListNativeStatusBar() {"),
      source.indexOf("\n}", source.indexOf("function syncConversationListNativeStatusBar() {"))
    )

    // 色带要涂**页面底色**：iOS 的系统玻璃带采样到的、Android app-plus 状态栏透出的、
    // 橡皮筋回弹露出的都是它；涂卡片白会在灰底上留一条色差接缝。
    // 所以既不能用卡片色，也不能用任何 var()/rgba()。
    expect(block).toMatch(/const pageSurfaceColor = darkStatusBarBand \? PAGE_SURFACE_DARK : PAGE_SURFACE_LIGHT/)
    expect(block).not.toContain("--up-card-bg-color")
    expect(block).not.toContain("var(--up-navbar-glass-bg-color")
    expect(block).not.toContain("rgba(")
    // 两个常量本身也必须是 6 位实色字面量，不能为了「跟着主题变量走」换成 upThemeVar()。
    expect(source).toMatch(/const PAGE_SURFACE_LIGHT = "#[0-9a-f]{6}"/)
    expect(source).toMatch(/const PAGE_SURFACE_DARK = "#[0-9a-f]{6}"/)
  })

  // 深色主题下色带底色变深，图标必须跟着转白，否则黑字压深底不可读。
  it("selects light status bar glyphs in dark theme", () => {
    const source = read(PAGE)

    expect(source).toContain('import { isDarkThemeMode } from "@/services/theme"')
    expect(source).toContain("const darkStatusBarBand = isDarkThemeMode()")
    expect(source).toContain('const frontColor = darkStatusBarBand ? "#ffffff" : "#000000"')
  })

  // 主题在「我的」页切换后回到列表只会触发 onShow，所以同步挂在 onShow 上。
  it("re-syncs on show so a theme switch elsewhere takes effect", () => {
    const source = read(PAGE)
    const block = source.slice(
      source.indexOf("onShow(() => {"),
      source.indexOf("\n})", source.indexOf("onShow(() => {"))
    )

    expect(block).toContain("syncConversationListNativeStatusBar()")
  })

  // script setup 里不能直调 mixin 注入的 upThemeVar（只有模板作用域有），必须走 proxy 包装。
  it("resolves theme vars through the component proxy", () => {
    const source = read(PAGE)

    expect(source).toContain("const currentInstance = getCurrentInstance()")
    expect(source).toContain("currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor)")
  })

  // 语义化字段名：这个开关控制的是「深色色带 + 浅色图标」，与会话详情页的 matrix 主题无关。
  it("names the service flag after the visual it controls", () => {
    const source = read(SERVICE)

    expect(source).toContain("darkStatusBarBand: boolean")
    expect(source).not.toContain("cyberModeEnabled")
  })
})
