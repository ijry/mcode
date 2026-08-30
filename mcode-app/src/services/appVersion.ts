export interface AppVersionInfo {
  version: string
  versionCode: string
}

export const FALLBACK_APP_VERSION = "0.3.1"
export const FALLBACK_APP_VERSION_CODE = "3"
export const APP_BUILD_TIME =
  typeof __APP_BUILD_TIME__ === "string" ? __APP_BUILD_TIME__ : ""

export function readAppVersionInfo(): AppVersionInfo {
  try {
    const info =
      typeof uni !== "undefined" && typeof uni.getAppBaseInfo === "function"
        ? uni.getAppBaseInfo()
        : undefined

    return {
      version: normalizeVersionValue(info?.appVersion, FALLBACK_APP_VERSION),
      versionCode: normalizeVersionValue(
        info?.appVersionCode,
        FALLBACK_APP_VERSION_CODE,
      ),
    }
  } catch {
    return {
      version: FALLBACK_APP_VERSION,
      versionCode: FALLBACK_APP_VERSION_CODE,
    }
  }
}

export function formatBuildTimestamp(value: unknown): string {
  if (value == null || value === "") return ""

  const raw = value instanceof Date ? "" : String(value).trim()
  if (/^\d{12}$/.test(raw)) return raw

  const date =
    value instanceof Date
      ? value
      : typeof value === "number"
        ? new Date(value)
        : new Date(raw)
  if (!Number.isFinite(date.getTime())) return ""

  const pad = (part: number) => String(part).padStart(2, "0")
  return [
    String(date.getFullYear()),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join("")
}

export function buildAppVersionLabel(
  info?: AppVersionInfo,
  buildTime: unknown = APP_BUILD_TIME,
): string {
  const resolvedInfo = info || readAppVersionInfo()
  const version = normalizeVersionValue(
    resolvedInfo.version,
    FALLBACK_APP_VERSION,
  )
  const timestamp = formatBuildTimestamp(buildTime)
  return timestamp ? `${version}.${timestamp}` : version
}

function normalizeVersionValue(value: unknown, fallback: string): string {
  const normalized = String(value ?? "").trim()
  return normalized || fallback
}
