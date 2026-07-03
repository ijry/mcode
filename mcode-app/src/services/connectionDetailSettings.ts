import type { CodegGateway } from "@/services/gateway"

export type AppLocale =
  | "en"
  | "zh_cn"
  | "zh_tw"
  | "ja"
  | "ko"
  | "es"
  | "de"
  | "fr"
  | "pt"
  | "ar"

export type LanguageMode = "system" | "manual"

export interface SystemLanguageSettings {
  mode: LanguageMode
  language: AppLocale
}

export interface DelegationSettings {
  enabled: boolean
  depth_limit: number
  completed_cache_max_mb: number
  agent_defaults?: Record<string, unknown>
}

export interface QuickMessage {
  id: number
  title: string
  content: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface BooleanToolSettings {
  enabled: boolean
}

const LOCALES = new Set<AppLocale>([
  "en",
  "zh_cn",
  "zh_tw",
  "ja",
  "ko",
  "es",
  "de",
  "fr",
  "pt",
  "ar",
])

export function normalizeLanguageSettings(input: unknown): SystemLanguageSettings {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {}
  const mode = raw.mode === "manual" ? "manual" : "system"
  const language = LOCALES.has(raw.language as AppLocale) ? (raw.language as AppLocale) : "en"
  return { mode, language }
}

export function normalizeDelegationSettings(input: unknown): DelegationSettings {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {}
  return {
    enabled: Boolean(raw.enabled),
    depth_limit: clampInt(raw.depth_limit, 1, 8, 1),
    completed_cache_max_mb: Math.max(0, Math.trunc(Number(raw.completed_cache_max_mb || 0))),
    ...(raw.agent_defaults && typeof raw.agent_defaults === "object"
      ? { agent_defaults: raw.agent_defaults as Record<string, unknown> }
      : {}),
  }
}

export function normalizeBooleanToolSettings(input: unknown): BooleanToolSettings {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {}
  return { enabled: Boolean(raw.enabled) }
}

export async function getRemoteLanguageSettings(gateway: CodegGateway) {
  return normalizeLanguageSettings(await gateway.call("get_system_language_settings"))
}

export async function updateRemoteLanguageSettings(
  gateway: CodegGateway,
  settings: SystemLanguageSettings
) {
  return normalizeLanguageSettings(
    await gateway.call("update_system_language_settings", { settings })
  )
}

export async function getRemoteDelegationSettings(gateway: CodegGateway) {
  return normalizeDelegationSettings(await gateway.call("get_delegation_settings"))
}

export async function setRemoteDelegationSettings(
  gateway: CodegGateway,
  settings: DelegationSettings
) {
  return normalizeDelegationSettings(await gateway.call("set_delegation_settings", { settings }))
}

export const listRemoteQuickMessages = (gateway: CodegGateway) =>
  gateway.call<QuickMessage[]>("quick_messages_list")

export const createRemoteQuickMessage = (
  gateway: CodegGateway,
  payload: Pick<QuickMessage, "title" | "content">
) => gateway.call<QuickMessage>("quick_messages_create", payload)

export const updateRemoteQuickMessage = (
  gateway: CodegGateway,
  payload: Pick<QuickMessage, "id"> & Partial<Pick<QuickMessage, "title" | "content">>
) =>
  gateway.call<QuickMessage>("quick_messages_update", {
    id: payload.id,
    title: payload.title ?? null,
    content: payload.content ?? null,
  })

export const deleteRemoteQuickMessage = (gateway: CodegGateway, id: number) =>
  gateway.call<void>("quick_messages_delete", { id })

export const getRemoteFeedbackSettings = async (gateway: CodegGateway) =>
  normalizeBooleanToolSettings(await gateway.call("get_feedback_settings"))

export const setRemoteFeedbackSettings = async (
  gateway: CodegGateway,
  settings: BooleanToolSettings
) => normalizeBooleanToolSettings(await gateway.call("set_feedback_settings", { settings }))

export const getRemoteQuestionSettings = async (gateway: CodegGateway) =>
  normalizeBooleanToolSettings(await gateway.call("get_question_settings"))

export const setRemoteQuestionSettings = async (
  gateway: CodegGateway,
  settings: BooleanToolSettings
) => normalizeBooleanToolSettings(await gateway.call("set_question_settings", { settings }))

export function isUnsupportedSettingsCommand(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "")
  return /unsupported|not found|404|unknown command|no handler/i.test(message)
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const next = Math.trunc(Number(value))
  if (!Number.isFinite(next)) return fallback
  return Math.min(max, Math.max(min, next))
}
