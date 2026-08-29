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

  // 这是本次列表页黑带的直接机制：standalone 非 translucent 模式下 webview 画不到状态栏，
  // 那条带子由系统按 html/body 背景 + status bar style 绘制。style=black 就是纯黑带。
  it("paints the standalone status bar band from the page background in light mode", () => {
    setUserAgent(IOS_UA)
    setStandalone(true)

    syncIosStandaloneStatusBar({
      darkStatusBarBand: false,
      statusBarBackgroundColor: "#ffffff",
      pageBackgroundColor: "#f3f4f6",
    })

    expect(readMeta("apple-mobile-web-app-status-bar-style")).toBe("default")
    expect(readMeta("theme-color")).toBe("#f3f4f6")
    expect(document.documentElement.style.backgroundColor).toBe("rgb(243, 244, 246)")
    expect(document.body.style.backgroundColor).toBe("rgb(243, 244, 246)")
  })

  it("switches to the black band and status bar color when the band is dark", () => {
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
