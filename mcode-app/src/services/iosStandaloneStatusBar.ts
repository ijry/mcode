export type IosStandaloneStatusBarStyle = "default" | "black" | "black-translucent"

/**
 * iOS standalone 下状态栏区域由谁来画。机制与踩坑详见函数内注释。
 *
 * - `"system"`（默认）：meta `black`，webview 从状态栏下方开始，带子交还 iOS
 *   （iOS 26/27 会在页面顶部画自己的 Liquid Glass 滚动边缘带，采样滚动内容）。
 *   连接列表走这条。页面顶部可以有 fixed/sticky 盒子（置顶控件要用），但不许
 *   带背景色 —— 详见函数内注释的命中测试规则。
 * - `"webview"`：meta `black-translucent`，webview 伸到状态栏底下，带子由页面
 *   自己画。会话详情页的 fixed navbar + 不透明色带走这条。
 */
export type IosStatusBarPainter = "system" | "webview"

export interface IosStandaloneStatusBarOptions {
  /**
   * 状态栏色带是否走深色（深色底 + 浅色图标）。命名按它控制的视觉来，
   * 而不是按某个页面主题 —— 会话详情页的 matrix 主题和列表页的深色主题都会打开它。
   */
  darkStatusBarBand: boolean
  statusBarBackgroundColor: string
  pageBackgroundColor: string
  /** 状态栏区域绘制方，默认 `"system"`。见 {@link IosStatusBarPainter}。 */
  iosStatusBarPainter?: IosStatusBarPainter
}

const APPLE_STATUS_BAR_META_NAME = "apple-mobile-web-app-status-bar-style"
const THEME_COLOR_META_NAME = "theme-color"

export function isIosStandaloneDisplayMode() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false
  if (!/iPhone|iPad|iPod/i.test(navigator.userAgent || "")) return false
  if (Boolean((navigator as any).standalone)) return true
  return typeof window.matchMedia === "function"
    && window.matchMedia("(display-mode: standalone)").matches
}

export function syncIosStandaloneStatusBar(options: IosStandaloneStatusBarOptions) {
  if (typeof document === "undefined") return

  const statusColor = normalizeHexColor(options.statusBarBackgroundColor, "#000000")
  const pageColor = normalizeHexColor(options.pageBackgroundColor, statusColor)
  syncMetaContent(THEME_COLOR_META_NAME, options.darkStatusBarBand ? statusColor : pageColor)

  if (!isIosStandaloneDisplayMode()) return

  const painter = options.iosStatusBarPainter === "webview" ? "webview" : "system"

  // standalone 下状态栏区域由谁画（`iosStatusBarPainter`，默认 "system"）：
  //
  // - "system" → meta `black`（与 index.html 的默认值一致）：Apple 文档 ——
  //   "If set to default or black, the web content is displayed below the status
  //   bar"。webview 从状态栏下方开始，状态栏那条带子交还 iOS。iOS 26/27 会在
  //   **页面顶部**渲染自己的 Liquid Glass 滚动边缘带（实测约 75pt），采样滚动到它
  //   下面的内容 —— 连接列表（pages/connections/index.vue）走的就是这条：没有
  //   fixed 顶栏，品牌区滚进带里被系统糊掉，状态栏与内容区因此是一整片。
  //
  //   ⚠️ 这一档的页面顶部可以有 fixed/sticky 盒子（置顶控件要用），但**不能带
  //   背景色**：WebKit 的 `_shouldHideTopScrollPocket`（WKWebViewIOS.mm →
  //   LocalFrameView::fixedContainerEdges）在视口顶端下方 4px、水平中点做命中
  //   测试，找到的第一个 fixed/sticky 祖先（≥90% 视口宽、≤105% 视口高；矮于
  //   10px 则采样其顶部 2px）**带背景色**时，就用它的颜色把玻璃带填掉
  //   （fixed colour extension）。透明层取不到颜色，带子照画 —— vcctrl 实证：
  //   0px 高、取不到色的固定条「仍然模糊」。会话列表顶栏（ConversationsNavbar）
  //   就是 fixed + 全透明：按钮置顶，毛砂归系统。
  //
  // - "webview" → meta `black-translucent`：Apple 文档 —— "the web content is
  //   displayed on the entire screen, partially obscured by the status bar"。
  //   webview 伸到状态栏底下，带子由页面自己画。会话详情页的 fixed navbar +
  //   不透明色带走这档；那个 fixed 不透明容器同时被 WebKit 当作 fixed colour
  //   extension，玻璃带被填成 navbar 自己的颜色，正合它的设计。
  //
  // 曾经整站固定在 black-translucent，让会话列表的 fixed 玻璃 navbar 自己画状态栏段。
  // 两个系统行为没算到：① 系统玻璃带照画（vcctrl 实测 iOS 27："setting
  // black-translucent made it worse: the header moved up into the band and the
  // band stayed put"）；② 手工玻璃与系统材质对不上。用户三次反馈「状态栏与导航
  // 两块割裂」。解法不是把玻璃画得更好，而是不画 —— 列表页回到 black、顶栏改成
  // fixed 但全透明（不上色，系统带就还在），系统自己来。
  //
  // 为什么每次都要显式写 meta：uni-app H5 是 SPA，meta 是文档级的。从详情页
  // （webview 档）返回列表页时不写回来，就会停留在 translucent。
  syncMetaContent(
    APPLE_STATUS_BAR_META_NAME,
    painter === "webview" ? "black-translucent" : "black"
  )
  document.documentElement.style.backgroundColor = options.darkStatusBarBand ? statusColor : pageColor
  document.body?.style.setProperty("background-color", pageColor)
}

function syncMetaContent(name: string, content: string) {
  const meta = ensureMetaElement(name)
  if (meta.getAttribute("content") !== content) {
    meta.setAttribute("content", content)
  }
}

function ensureMetaElement(name: string) {
  const selector = `meta[name="${name}"]`
  const existing = document.head.querySelector<HTMLMetaElement>(selector)
  if (existing) return existing

  const meta = document.createElement("meta")
  meta.setAttribute("name", name)
  document.head.appendChild(meta)
  return meta
}

function normalizeHexColor(value: string, fallback: string) {
  const color = String(value || "").trim()
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback
}
