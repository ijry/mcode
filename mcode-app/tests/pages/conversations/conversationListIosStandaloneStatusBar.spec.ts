import fs from "node:fs"
import path from "node:path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8")
}

const PAGE = "../../../src/pages/conversations/index.vue"
const SERVICE = "../../../src/services/iosStandaloneStatusBar.ts"

describe("conversation list iOS standalone status bar", () => {
  // iOS standalone（非 black-translucent）下 webview 画不到状态栏，那条色带由系统按
  // html/body 背景绘制。列表页此前完全没调这个 service，色带只能停留在 index.html 启动时
  // 声明的 black，于是玻璃 navbar 上方出现一条黑带 —— 也就是「没有沉浸进状态栏」。
  it("syncs the standalone status bar band from the page", () => {
    const source = read(PAGE)

    expect(source).toContain(
      'import { syncIosStandaloneStatusBar } from "@/services/iosStandaloneStatusBar"'
    )
    expect(source).toContain("function syncConversationListNativeStatusBar() {")
    expect(source).toContain("syncIosStandaloneStatusBar({")
  })

  // 色带底色必须是 6 位实色：service 的 normalizeHexColor 会把 var()/rgba() 判非法后回退成
  // 黑色，那正是要修的黑带。navbar 玻璃色 var(--up-navbar-glass-bg-color, ...) 因此不能直接传，
  // 而且它只由 u-navbar 的 CSS 定义、不在 uview 的 JS 主题表里，upThemeVar 也取不到。
  it("passes a resolved hex color instead of a CSS var expression", () => {
    const source = read(PAGE)
    const block = source.slice(
      source.indexOf("function syncConversationListNativeStatusBar() {"),
      source.indexOf("\n}", source.indexOf("function syncConversationListNativeStatusBar() {"))
    )

    // 色带压在 navbar 玻璃层的正上方，所以对齐 navbar 表面色而不是页面底色，
    // 否则真机上 navbar 上沿会出现一条色差接缝。
    expect(block).toContain('upThemeVar("--up-card-bg-color"')
    expect(block).not.toContain("var(--up-navbar-glass-bg-color")
    expect(block).not.toContain("rgba(")
    // fallback 也必须是 6 位实色，主题表缺键时不能落到 service 的黑色兜底。
    expect(block).toMatch(/surfaceFallbackColor = darkStatusBarBand \? "#[0-9a-f]{6}" : "#[0-9a-f]{6}"/)
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
