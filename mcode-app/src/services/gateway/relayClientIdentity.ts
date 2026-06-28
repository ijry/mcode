const STORAGE_KEY = "mcode:relay-client-id"

let cachedRelayClientId = ""

function randomSuffix() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function isValidRelayClientId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^mcode-client-[a-zA-Z0-9._:-]{6,96}$/.test(value.trim())
  )
}

export function getRelayClientId(): string {
  if (cachedRelayClientId) return cachedRelayClientId
  try {
    const stored = uni.getStorageSync(STORAGE_KEY)
    if (isValidRelayClientId(stored)) {
      cachedRelayClientId = stored.trim()
      return cachedRelayClientId
    }
  } catch {
    // Storage can be unavailable in tests or restricted runtimes.
  }
  cachedRelayClientId = `mcode-client-${randomSuffix()}`
  try {
    uni.setStorageSync(STORAGE_KEY, cachedRelayClientId)
  } catch {
    // Best effort; in-memory id still keeps this runtime stable.
  }
  return cachedRelayClientId
}

export function __resetRelayClientIdForTest() {
  cachedRelayClientId = ""
}
