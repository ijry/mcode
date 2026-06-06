const STORAGE_KEY = "mcode_direct_tokens"
const LEGACY_STORAGE_KEY = "mcode_direct_token"

export function normalizeDirectBaseUrl(baseUrl: string) {
  return String(baseUrl || "").trim().replace(/\/+$/, "")
}

function readTokenMap(): Record<string, string> {
  const raw = uni.getStorageSync(STORAGE_KEY)
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  return raw as Record<string, string>
}

export function getDirectToken(baseUrl: string) {
  const key = normalizeDirectBaseUrl(baseUrl)
  if (!key) return ""

  const token = String(readTokenMap()[key] || "").trim()
  if (token) return token

  // Read the legacy singleton token once so existing direct sessions still recover
  // after the storage format change.
  const legacyToken = String(uni.getStorageSync(LEGACY_STORAGE_KEY) || "").trim()
  if (!legacyToken) return ""
  setDirectToken(key, legacyToken)
  return legacyToken
}

export function setDirectToken(baseUrl: string, token: string) {
  const key = normalizeDirectBaseUrl(baseUrl)
  if (!key) return

  const next = { ...readTokenMap() }
  const value = String(token || "").trim()
  if (value) {
    next[key] = value
  } else {
    delete next[key]
  }
  uni.setStorageSync(STORAGE_KEY, next)
}

export function removeDirectToken(baseUrl: string) {
  setDirectToken(baseUrl, "")
}
