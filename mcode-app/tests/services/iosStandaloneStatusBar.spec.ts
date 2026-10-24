/**
 * @jest-environment jsdom
 */
import {
  isIosStandaloneDisplayMode,
  syncIosStandaloneStatusBar,
} from "@/services/iosStandaloneStatusBar"

const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

function setUserAgent(userAgent: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    value: userAgent,
    configurable: true,
  })
}

function setStandalone(standalone: boolean) {
  Object.defineProperty(window.navigator, "standalone", {
    value: standalone,
    configurable: true,
  })
}

function readMeta(name: string) {
  return document.head
    .querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
    ?.getAttribute("content")
}

describe("iOS standalone status bar service", () => {
  beforeEach(() => {
    document.head.innerHTML = ""
    document.documentElement.style.backgroundColor = ""
    document.body.style.backgroundColor = ""
    setUserAgent(DESKTOP_UA)
    setStandalone(false)
  })

  it("detects iOS standalone only for iOS user agents in standalone display mode", () => {
    expect(isIosStandaloneDisplayMode()).toBe(false)

    setUserAgent(IOS_UA)
    expect(isIosStandaloneDisplayMode()).toBe(false)

    setStandalone(true)
    expect(isIosStandaloneDisplayMode()).toBe(true)
  })

  // theme-color 对普通浏览器（含非 standalone 的 iOS Safari）也生效，所以它在 early return 之前同步。
  it("syncs theme-color outside standalone but leaves the apple status bar style alone", () => {
    syncIosStandaloneStatusBar({
      darkStatusBarBand: false,
      statusBarBackgroundColor: "#ffffff",
      pageBackgroundColor: "#f3f4f6",
    })

    expect(readMeta("theme-color")).toBe("#f3f4f6")
    expect(readMeta("apple-mobile-web-app-status-bar-style")).toBeUndefined()
    expect(document.documentElement.style.backgroundColor).toBe("")
  })

  // 默认 "system" 档 → meta `black`：webview 从状态栏下方开始，顶上那条带子交还 iOS
  // （iOS 26/27 在页面顶部画 Liquid Glass 滚动边缘带，采样滚动内容）。连接列表走
  // index.html 默认 black、从不调本 service，观感上是一整片；列表页显式写回同一个值，
  // 是为了把详情页（webview 档）留下的 translucent 覆盖掉 —— SPA 的 meta 是文档级的。
  // 深/浅只影响 html/body 背景（橡皮筋回弹露出的颜色），不再切换 status bar style。
  it("uses black by default so iOS paints the status bar strip itself, in light mode", () => {
    setUserAgent(IOS_UA)
    setStandalone(true)

    syncIosStandaloneStatusBar({
      darkStatusBarBand: false,
      statusBarBackgroundColor: "#ffffff",
      pageBackgroundColor: "#f3f4f6",
    })

    expect(readMeta("apple-mobile-web-app-status-bar-style")).toBe("black")
    expect(readMeta("theme-color")).toBe("#f3f4f6")
    expect(document.documentElement.style.backgroundColor).toBe("rgb(243, 244, 246)")
    expect(document.body.style.backgroundColor).toBe("rgb(243, 244, 246)")
  })

  // 显式 "system" 与省略等价：两页（列表 / 连接）必须落在同一个 meta 上，
  // 否则同一套系统行为会出现两种观感。
  it("treats an explicit system painter the same as the default", () => {
    setUserAgent(IOS_UA)
    setStandalone(true)

    syncIosStandaloneStatusBar({
      darkStatusBarBand: false,
      statusBarBackgroundColor: "#ffffff",
      pageBackgroundColor: "#f3f4f6",
      iosStatusBarPainter: "system",
    })

    expect(readMeta("apple-mobile-web-app-status-bar-style")).toBe("black")
  })

  // "webview" 档 → `black-translucent`：webview 伸到状态栏底下，带子由页面自己画。
  // 只有会话详情页（fixed navbar + 不透明色带）用这档；它的 fixed 不透明容器同时会被
  // WebKit 当 fixed colour extension 填掉系统玻璃带，正合它「不要系统磨砂」的设计。
  it("uses black-translucent only when the caller paints the strip itself", () => {
    setUserAgent(IOS_UA)
    setStandalone(true)

    syncIosStandaloneStatusBar({
      darkStatusBarBand: false,
      statusBarBackgroundColor: "#ffffff",
      pageBackgroundColor: "#f3f4f6",
      iosStatusBarPainter: "webview",
    })

    expect(readMeta("apple-mobile-web-app-status-bar-style")).toBe("black-translucent")
    expect(readMeta("theme-color")).toBe("#f3f4f6")
  })

  it("stays black in dark mode and still paints the dark page background", () => {
    setUserAgent(IOS_UA)
    setStandalone(true)

    syncIosStandaloneStatusBar({
      darkStatusBarBand: true,
      statusBarBackgroundColor: "#000000",
      pageBackgroundColor: "#000000",
    })

    expect(readMeta("apple-mobile-web-app-status-bar-style")).toBe("black")
    expect(readMeta("theme-color")).toBe("#000000")
  })

  // 调用方必须给 6 位实色：var()/rgba() 会被判非法并静默回退，
  // 这也是列表页不能直接把玻璃色 var(--up-navbar-glass-bg-color, ...) 传进来的原因。
  it("falls back when the caller passes a non-hex color expression", () => {
    setUserAgent(IOS_UA)
    setStandalone(true)

    syncIosStandaloneStatusBar({
      darkStatusBarBand: false,
      statusBarBackgroundColor: "var(--up-navbar-glass-bg-color, rgba(255, 255, 255, 0.82))",
      pageBackgroundColor: "rgba(255, 255, 255, 0.82)",
    })

    expect(readMeta("theme-color")).toBe("#000000")
  })
})
