export type ThemePreference = "system" | "light" | "dark"
export type ThemeMode = "light" | "dark"

export const THEME_PREFERENCE_KEY = "mcode_theme_preference"
export const LEGACY_DARK_MODE_KEY = "mcode_dark_mode"

const VALID_THEME_PREFERENCES: ThemePreference[] = ["system", "light", "dark"]

type UviewThemeApi = {
  setThemePreference?: (preference: ThemePreference) => void
  getThemePreference?: () => ThemePreference | string
  theme?: {
    mode?: ThemeMode | string
  }
}

function getUviewThemeApi(): UviewThemeApi | undefined {
  return (uni as typeof uni & { $u?: UviewThemeApi }).$u
}

export function normalizeThemePreference(value: unknown): ThemePreference {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (VALID_THEME_PREFERENCES.includes(normalized as ThemePreference)) {
      return normalized as ThemePreference
    }
  }
  return "system"
}

export function migrateLegacyThemePreference(
  storedPreference: unknown,
  legacyDarkMode: unknown
): ThemePreference {
  if (typeof storedPreference === "string") {
    return normalizeThemePreference(storedPreference)
  }
  if (legacyDarkMode === true) return "dark"
  if (legacyDarkMode === false) return "light"
  return "system"
}

export function readThemePreference(): ThemePreference {
  const storedPreference = uni.getStorageSync(THEME_PREFERENCE_KEY)
  const legacyDarkMode = uni.getStorageSync(LEGACY_DARK_MODE_KEY)
  const preference = migrateLegacyThemePreference(storedPreference, legacyDarkMode)
  uni.setStorageSync(THEME_PREFERENCE_KEY, preference)
  return preference
}

export function writeThemePreference(preference: ThemePreference) {
  uni.setStorageSync(THEME_PREFERENCE_KEY, normalizeThemePreference(preference))
}

export function applyThemePreference(preference: ThemePreference) {
  const resolvedPreference = normalizeThemePreference(preference)
  writeThemePreference(resolvedPreference)
  const uviewThemeApi = getUviewThemeApi()
  if (typeof uviewThemeApi?.setThemePreference === "function") {
    uviewThemeApi.setThemePreference(resolvedPreference)
  }
  return resolvedPreference
}

export function initializeThemePreference() {
  return applyThemePreference(readThemePreference())
}

export function getCurrentThemePreference(): ThemePreference {
  const uviewThemeApi = getUviewThemeApi()
  if (typeof uviewThemeApi?.getThemePreference === "function") {
    return normalizeThemePreference(uviewThemeApi.getThemePreference())
  }
  return readThemePreference()
}

export function getCurrentThemeMode(): ThemeMode {
  const mode = getUviewThemeApi()?.theme?.mode
  return mode === "dark" ? "dark" : "light"
}

export function isDarkThemeMode() {
  return getCurrentThemeMode() === "dark"
}
