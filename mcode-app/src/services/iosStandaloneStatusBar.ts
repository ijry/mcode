export type IosStandaloneStatusBarStyle = "default" | "black" | "black-translucent"

export interface IosStandaloneStatusBarOptions {
  /**
   * 状态栏色带是否走深色（深色底 + 浅色图标）。命名按它控制的视觉来，
   * 而不是按某个页面主题 —— 会话详情页的 matrix 主题和列表页的深色主题都会打开它。
   */
  darkStatusBarBand: boolean
  statusBarBackgroundColor: string
  pageBackgroundColor: string
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

  // iOS standalone 下要让状态栏和导航栏一样有磨砂：
  // 只有 `black-translucent` 会让原生状态栏变透明、把 webview 露出来，而我们给
  // `.u-status-bar` 占位条加了 backdrop-filter，于是状态栏区域也跟着被磨砂。
  // 另两种模式（black / default）会由原生的不透明条盖住 webview 顶部，磨砂永远透不出来。
  //
  // 代价：translucent 下状态栏文字固定为浅色（白），浅色页面上白字对比偏弱 ——
  // 由调用方（ConversationsNavbar）在占位条上叠一层很淡的暗罩来兜底可读性。
  //
  // index.html 早已开启 viewport-fit=cover，webview 本来就是全屏铺到状态栏底下，
  // 切换成 translucent 不会改变布局（u-navbar 的占位条已经预留了状态栏高度），
  // 不会重复吃 safe-area。
  syncMetaContent(APPLE_STATUS_BAR_META_NAME, "black-translucent")
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
