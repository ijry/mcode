export const DETAIL_CYBER_MODE_STORAGE_KEY = "mcode_detail_cyber_mode_v1"

export type CyberEffectPhase = "idle" | "ramp" | "streaming" | "settle"

const DEFAULT_GLYPHS = "0101010110010110<>/|[]{}"
const SETTLE_WINDOW_MS = 1_200

export function normalizeCyberModeStorage(raw: unknown): boolean {
  if (raw === true || raw === "true" || raw === 1 || raw === "1") return true
  if (
    raw === false ||
    raw === "false" ||
    raw === 0 ||
    raw === "0" ||
    raw == null ||
    raw === ""
  ) {
    return false
  }

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      return normalizeCyberModeStorage(
        parsed && typeof parsed === "object" && "enabled" in parsed
          ? (parsed as { enabled?: unknown }).enabled
          : parsed
      )
    } catch {
      return false
    }
  }

  if (typeof raw === "object" && raw && "enabled" in raw) {
    return Boolean((raw as { enabled?: unknown }).enabled)
  }

  return false
}

export function buildCyberModeMenuAction(enabled: boolean) {
  return enabled
    ? { name: "关闭炫酷模式", color: "#19be6b" }
    : { name: "炫酷模式", color: "#22c55e" }
}

export function shouldShowDetailBackgroundImage(input: {
  cyberModeEnabled: boolean
  detailBackgroundImageUrl: string
}) {
  return !input.cyberModeEnabled && String(input.detailBackgroundImageUrl || "").trim().length > 0
}

export function deriveCyberEffectPhase(input: {
  cyberModeEnabled: boolean
  runtimeStatus: string
  hasLiveMessage: boolean
  lastStreamEndedAt: number
  now: number
}): CyberEffectPhase {
  if (!input.cyberModeEnabled) return "idle"
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
