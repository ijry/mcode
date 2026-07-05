export const DETAIL_THEME_STORAGE_KEY = "mcode_detail_theme_v1"
export const DETAIL_CYBER_MODE_STORAGE_KEY = "mcode_detail_cyber_mode_v1"

export type DetailThemeId = "default" | "matrix" | "sweet" | "summer"
export type CyberEffectPhase = "idle" | "ramp" | "streaming" | "settle"

export interface DetailThemeOption {
  id: DetailThemeId
  name: string
  color: string
}

const DEFAULT_GLYPHS = "0101010110010110<>/|[]{}"
const SETTLE_WINDOW_MS = 1_200

export const DETAIL_THEME_OPTIONS: DetailThemeOption[] = [
  { id: "default", name: "默认主题", color: "#2979ff" },
  { id: "matrix", name: "微黑暗帝国", color: "#22c55e" },
  { id: "sweet", name: "甜心泡泡", color: "#ec4899" },
  { id: "summer", name: "西瓜海浪", color: "#06b6d4" },
]

export function normalizeDetailThemeStorage(raw: unknown): DetailThemeId {
  if (isDetailThemeId(raw)) return raw

  if (
    raw === true ||
    raw === "true" ||
    raw === 1 ||
    raw === "1"
  ) {
    return "matrix"
  }

  if (
    raw === false ||
    raw === "false" ||
    raw === 0 ||
    raw === "0" ||
    raw == null ||
    raw === ""
  ) {
    return "default"
  }

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      return normalizeDetailThemeStorage(
        parsed && typeof parsed === "object" && "theme" in parsed
          ? (parsed as { theme?: unknown }).theme
          : parsed && typeof parsed === "object" && "enabled" in parsed
            ? ((parsed as { enabled?: unknown }).enabled ? "matrix" : "default")
            : parsed
      )
    } catch {
      return "default"
    }
  }

  if (typeof raw === "object" && raw) {
    if ("theme" in raw) {
      return normalizeDetailThemeStorage((raw as { theme?: unknown }).theme)
    }
    if ("enabled" in raw) {
      return (raw as { enabled?: unknown }).enabled ? "matrix" : "default"
    }
  }

  return "default"
}

export function isExperimentalDetailTheme(theme: DetailThemeId) {
  return theme === "matrix" || theme === "sweet" || theme === "summer"
}

export function isMatrixDetailTheme(theme: DetailThemeId) {
  return theme === "matrix"
}

export function isSweetDetailTheme(theme: DetailThemeId) {
  return theme === "sweet"
}

export function buildDetailThemeMenuActions(activeTheme: DetailThemeId) {
  return DETAIL_THEME_OPTIONS.map((item) => ({
    ...item,
    active: item.id === activeTheme,
    name: item.id === activeTheme ? `${item.name} · 当前` : item.name,
  }))
}

export function shouldShowDetailBackgroundImage(input: {
  detailTheme: DetailThemeId
  detailBackgroundImageUrl: string
}) {
  return input.detailTheme === "default" && String(input.detailBackgroundImageUrl || "").trim().length > 0
}

export function deriveCyberEffectPhase(input: {
  detailTheme: DetailThemeId
  runtimeStatus: string
  hasLiveMessage: boolean
  lastStreamEndedAt: number
  now: number
}): CyberEffectPhase {
  if (!isExperimentalDetailTheme(input.detailTheme)) return "idle"
  if (input.hasLiveMessage) return "streaming"

  const status = String(input.runtimeStatus || "idle")
  if (
    status === "connecting" ||
    status === "thinking" ||
    status === "running_tool" ||
    status === "waiting_permission" ||
    status === "waiting_question"
  ) {
    return "ramp"
  }

  if (input.lastStreamEndedAt > 0 && input.now - input.lastStreamEndedAt < SETTLE_WINDOW_MS) {
    return "settle"
  }

  return "idle"
}

export function buildCyberDecodeText(input: {
  text: string
  progress: number
  tick: number
  glyphs?: string
}) {
  const text = String(input.text || "")
  if (!text) return ""

  const glyphs = String(input.glyphs || DEFAULT_GLYPHS)
  const progress = Math.max(0, Math.min(1, Number(input.progress || 0)))
  const revealedCount = Math.max(0, Math.min(text.length, Math.floor(text.length * progress)))
  const chars = text.split("")

  return chars
    .map((char, index) => {
      if (char === "\n") return "\n"
      if (char === " ") return " "
      if (index < revealedCount) return char
      const glyphIndex = Math.abs((index * 17 + Number(input.tick || 0) * 13) % glyphs.length)
      return glyphs[glyphIndex]
    })
    .join("")
}

export function normalizeCyberModeStorage(raw: unknown): boolean {
  return normalizeDetailThemeStorage(raw) === "matrix"
}

export function buildCyberModeMenuAction(enabled: boolean) {
  return enabled
    ? { name: "关闭微黑暗帝国", color: "#19be6b" }
    : { name: "微黑暗帝国", color: "#22c55e" }
}

function isDetailThemeId(value: unknown): value is DetailThemeId {
  return value === "default" || value === "matrix" || value === "sweet" || value === "summer"
}
