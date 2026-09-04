import { APP_BUILD_TIME } from "@/services/appVersion"

/**
 * iOS standalone（添加到主屏幕）等长驻 webview 场景下，从桌面点开应用通常只是把旧文档从
 * 后台恢复回前台，并不会重新向服务器发起请求，因此站点更新后旧 bundle 会一直运行。本模块
 * 在启动与回到前台时探测部署版本标记 version.json（构建产物与 __APP_BUILD_TIME__ 同源生成），
 * 发现远端版本与当前 bundle 不一致时强制刷新一次，让用户尽快切到新版本。
 *
 * 防循环：刷新目标写入 localStorage，同一目标版本在 H5_UPDATE_GUARD_TTL_MS 内只刷新一次，
 * 避免部署中途版本标记与静态资源先后不一致时反复刷新；TTL 过期后允许再次尝试，兜底刷新前
 * 进程被中断、或刷新后仍加载到旧资源的情况。
 */
export const H5_VERSION_MARKER_PATH = "/version.json"
export const H5_UPDATE_GUARD_STORAGE_KEY = "mcode_h5_update_reload_guard"
export const H5_UPDATE_GUARD_TTL_MS = 2 * 60 * 1000

export interface H5UpdateGuardRecord {
  buildTime: string
  at: number
}

export interface H5UpdateStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface H5FetchResponse {
  ok: boolean
  text(): Promise<string>
}

export type H5FetchLike = (url: string) => Promise<H5FetchResponse>

export interface H5UpdateCheckOptions {
  runningBuildTime?: string
  markerPath?: string
  storage?: H5UpdateStorage
  fetch?: H5FetchLike
  reload?: () => void
  now?: () => number
}

let checkInFlight: Promise<boolean> | null = null
let guardStarted = false

/** 解析 version.json 内容，容错 object.buildTime 与顶层字符串两种形态。 */
export function parseVersionMarker(raw: unknown): string {
  if (raw == null) return ""
  if (typeof raw === "string") return raw.trim()
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const buildTime = (raw as { buildTime?: unknown }).buildTime
    if (typeof buildTime === "string") return buildTime.trim()
  }
  return ""
}

/** 决定是否需要对目标版本强制刷新一次。 */
export function shouldReloadH5ForUpdate(options: {
  runningBuildTime: string
  deployedBuildTime: string
  lastReload?: H5UpdateGuardRecord | null
  now?: number
}): boolean {
  const running = String(options.runningBuildTime || "").trim()
  const deployed = String(options.deployedBuildTime || "").trim()
  if (!running || !deployed || running === deployed) return false

  const now = typeof options.now === "number" && Number.isFinite(options.now) ? options.now : Date.now()
  const lastReload = options.lastReload
  if (
    lastReload &&
    lastReload.buildTime === deployed &&
    now - lastReload.at < H5_UPDATE_GUARD_TTL_MS
  ) {
    return false
  }
  return true
}

/** 读取上次为哪个目标版本触发过刷新。 */
export function readUpdateGuardRecord(storage?: H5UpdateStorage): H5UpdateGuardRecord | null {
  const store = resolveStorage(storage)
  if (!store) return null
  try {
    const raw = store.getItem(H5_UPDATE_GUARD_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { buildTime?: unknown; at?: unknown } | null
    const buildTime = typeof parsed?.buildTime === "string" ? parsed.buildTime.trim() : ""
    const at = typeof parsed?.at === "number" && Number.isFinite(parsed.at) ? parsed.at : 0
    return buildTime ? { buildTime, at } : null
  } catch {
    return null
  }
}

/** 记录已为目标版本触发刷新，同一版本在 TTL 内不再重复刷新。 */
export function writeUpdateGuardRecord(
  buildTime: string,
  now = Date.now(),
  storage?: H5UpdateStorage,
): void {
  const store = resolveStorage(storage)
  if (!store) return
  try {
    store.setItem(H5_UPDATE_GUARD_STORAGE_KEY, JSON.stringify({ buildTime, at: now }))
  } catch {
    // 存储不可用（隐私模式等）时放弃防循环记录，宁可偶尔多刷一次也不能卡住启动。
  }
}

/** 给版本标记 URL 追加时间戳，绕过浏览器/WebView 的启发式缓存拿到最新标记。 */
export function buildVersionMarkerUrl(markerPath: string, bust: number): string {
  const separator = markerPath.includes("?") ? "&" : "?"
  return `${markerPath}${separator}_=${String(bust)}`
}

/**
 * 执行一轮更新检查：拉取远端版本标记并与当前 bundle 版本比较，不一致且在防循环窗口外时
 * 写入刷新记录并触发 reload。返回 true 表示本次触发了刷新。任何失败都静默返回 false。
 * 模块级并发去重：同一时刻只有一轮检查在跑。
 */
export function runH5UpdateCheck(options: H5UpdateCheckOptions = {}): Promise<boolean> {
  if (checkInFlight) return checkInFlight
  checkInFlight = performUpdateCheck(options).finally(() => {
    checkInFlight = null
  })
  return checkInFlight
}

/**
 * 启动 H5 更新守卫：立即检查一次，并监听页面重新可见（standalone 从后台回前台的关键时机）
 * 再次检查。模块级幂等，可安全地在 App onLaunch 调用。
 */
export function startH5UpdateGuard(): void {
  if (guardStarted) return
  if (typeof window === "undefined" || typeof document === "undefined") return
  guardStarted = true

  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void runH5UpdateCheck({ reload: () => window.location.reload() })
    }
  })
  void runH5UpdateCheck({ reload: () => window.location.reload() })
}

async function performUpdateCheck(options: H5UpdateCheckOptions): Promise<boolean> {
  const runningBuildTime = String(options.runningBuildTime ?? APP_BUILD_TIME).trim()
  const fetchImpl = options.fetch ?? resolveDefaultFetch()
  const now = typeof options.now === "function" ? options.now() : Date.now()
  if (!fetchImpl || !runningBuildTime) return false

  let body: string
  try {
    const markerUrl = buildVersionMarkerUrl(options.markerPath ?? H5_VERSION_MARKER_PATH, now)
    const response = await fetchImpl(markerUrl)
    if (!response.ok) return false
    body = await response.text()
  } catch {
    return false
  }

  let deployedBuildTime: string
  try {
    deployedBuildTime = parseVersionMarker(JSON.parse(body))
  } catch {
    return false
  }
  if (!deployedBuildTime) return false

  const shouldReload = shouldReloadH5ForUpdate({
    runningBuildTime,
    deployedBuildTime,
    lastReload: readUpdateGuardRecord(options.storage),
    now,
  })
  if (!shouldReload) return false

  writeUpdateGuardRecord(deployedBuildTime, now, options.storage)
  if (typeof options.reload === "function") options.reload()
  return true
}

function resolveStorage(storage?: H5UpdateStorage): H5UpdateStorage | null {
  if (storage) return storage
  try {
    const store = (globalThis as { localStorage?: H5UpdateStorage }).localStorage
    return store ?? null
  } catch {
    return null
  }
}

function resolveDefaultFetch(): H5FetchLike | null {
  if (typeof globalThis === "undefined") return null
  const globalFetch = (globalThis as typeof globalThis & { fetch?: typeof fetch }).fetch
  if (typeof globalFetch !== "function") return null
  return (url: string) =>
    globalFetch(url, { cache: "no-store" }).then((response) => ({
      ok: response.ok,
      text: () => response.text(),
    }))
}