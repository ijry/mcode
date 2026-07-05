export type IosStandaloneStatusBarStyle = "default" | "black" | "black-translucent"

export interface IosStandaloneStatusBarOptions {
  cyberModeEnabled: boolean
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
  syncMetaContent(THEME_COLOR_META_NAME, options.cyberModeEnabled ? statusColor : pageColor)

  if (!isIosStandaloneDisplayMode()) return

  // iOS standalone only exposes coarse status bar modes. Use black instead of
  // black-translucent because the existing uni-app pages already account for
  // safe areas; full-bleed mode double-counts top and bottom insets.
  syncMetaContent(
    APPLE_STATUS_BAR_META_NAME,
    options.cyberModeEnabled ? "black" : "default"
  )
  document.documentElement.style.backgroundColor = options.cyberModeEnabled ? statusColor : pageColor
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
