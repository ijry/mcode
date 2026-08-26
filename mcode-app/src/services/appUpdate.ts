import { readAppVersionInfo } from "@/services/appVersion"

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000
const UPDATE_CHECKED_AT_KEY = "mcode_app_update_checked_at"
const APPBETA_API_BASE_URL = "https://app.lingyun.net/api"
const APPBETA_CHANNEL_KEY = "qH5w"
const APPBETA_DOWNLOAD_URL = "https://app.lingyun.net/appbeta/qH5w"

type UpdateCheckResponse = {
  code?: number | string
  msg?: string
  data?: {
    hasUpdate?: boolean
    versionInfo?: {
      version?: string
      versionCode?: string | number
      updateIntro?: string
      description?: string
    }
  }
}

declare const plus: { runtime?: { openWeb?: (url: string) => void; openURL?: (url: string) => void } } | undefined

let checkingPromise: Promise<void> | null = null

export function shouldCheckAppUpdate(now = Date.now(), lastCheckedAt = readLastCheckedAt()): boolean {
  return !lastCheckedAt || now - lastCheckedAt >= UPDATE_CHECK_INTERVAL_MS
}

export function isAndroidApp(): boolean {
  if (typeof plus === "undefined" || !plus) return false
  try {
    const systemInfo = uni.getSystemInfoSync?.() as { platform?: string; osName?: string } | undefined
    return String(systemInfo?.platform || systemInfo?.osName || "").toLowerCase() === "android"
  } catch {
    return false
  }
}

export function startAppUpdateCheck(force = false): void {
  if (!isAndroidApp() || (!force && !shouldCheckAppUpdate())) return
  if (checkingPromise) return

  const now = Date.now()
  writeLastCheckedAt(now)
  checkingPromise = checkForAppUpdate()
    .catch(() => undefined)
    .finally(() => {
      checkingPromise = null
    })
}

async function checkForAppUpdate(): Promise<void> {
  const runtimeInfo = readAppVersionInfo()
  const query = [
    ["key", APPBETA_CHANNEL_KEY],
    ["version", runtimeInfo.version],
    ["versionCode", runtimeInfo.versionCode],
  ]
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value || ""))}`)
    .join("&")

  const response = (await uni.request({
    url: `${APPBETA_API_BASE_URL}/v1/appbeta/app/checkUpdate?${query}`,
    method: "GET",
  })) as { statusCode?: number; data?: UpdateCheckResponse }
  const body = response.data || {}
  if (Number(body.code) !== 200 || body.data?.hasUpdate !== true) return

  const versionInfo = body.data.versionInfo || {}
  const version = String(versionInfo.version || "新版本")
  const versionCode = String(versionInfo.versionCode || "")
  const intro = String(versionInfo.updateIntro || versionInfo.description || "发现新版本，建议立即更新")
  const versionLabel = versionCode ? `${version}（构建号 ${versionCode}）` : version

  await new Promise<void>((resolve) => {
    uni.showModal({
      title: `发现新版本 ${versionLabel}`,
      content: intro,
      confirmText: "立即更新",
      cancelText: "稍后再说",
      success: (result) => {
        if (result.confirm) openDownloadPage()
        resolve()
      },
      fail: () => resolve(),
    })
  })
}

function openDownloadPage(): void {
  try {
    if (plus?.runtime?.openWeb) {
      plus.runtime.openWeb(APPBETA_DOWNLOAD_URL)
      return
    }
    if (plus?.runtime?.openURL) {
      plus.runtime.openURL(APPBETA_DOWNLOAD_URL)
      return
    }
  } catch {
    // 更新跳转失败不应影响用户继续使用当前版本。
  }
}

function readLastCheckedAt(): number {
  const value = Number(uni.getStorageSync(UPDATE_CHECKED_AT_KEY))
  return Number.isFinite(value) ? value : 0
}

function writeLastCheckedAt(value: number): void {
  uni.setStorageSync(UPDATE_CHECKED_AT_KEY, String(value))
}

export const appUpdateConfig = {
  apiBaseUrl: APPBETA_API_BASE_URL,
  channelKey: APPBETA_CHANNEL_KEY,
  downloadUrl: APPBETA_DOWNLOAD_URL,
  intervalMs: UPDATE_CHECK_INTERVAL_MS,
}
