import type {
  AgentOptionsSnapshot,
  SessionConfigOptionInfo,
  SessionModeStateInfo,
} from "@/types/acp"

export type ComposerConfigKey = "model" | "reasoning" | "permission" | ""

export interface DetailAgentConfigState {
  status: "idle" | "loading" | "ready" | "failed"
  modes: SessionModeStateInfo | null
  configOptions: SessionConfigOptionInfo[]
  selectedModeId: string | null
  selectedValues: Record<string, string>
  message: string
}

export interface ComposerTodoItem {
  id: string
  text: string
  completed: boolean
}

const REASONING_KEYWORDS = ["reasoning", "thinking", "effort"]
const PERMISSION_KEYWORDS = ["permission", "approval", "sandbox", "auth"]

export function createEmptyDetailAgentConfigState(message = ""): DetailAgentConfigState {
  return {
    status: "idle",
    modes: null,
    configOptions: [],
    selectedModeId: null,
    selectedValues: {},
    message,
  }
}

function normalizeLabel(value: unknown) {
  return String(value || "").trim().toLowerCase()
}

function containsKeyword(option: SessionConfigOptionInfo, keywords: string[]) {
  const haystack = [
    option.id,
    option.name,
    option.description,
    option.category,
  ]
    .map(normalizeLabel)
    .join(" ")

  return keywords.some((keyword) => haystack.includes(keyword))
}

export function buildDefaultSelectedValues(options: SessionConfigOptionInfo[]) {
  const selected: Record<string, string> = {}
  for (const option of options) {
    const current =
      typeof option.kind?.current_value === "string" && option.kind.current_value
        ? option.kind.current_value
        : option.kind?.options?.[0]?.value
    if (current) selected[option.id] = current
  }
  return selected
}

export function findReasoningOption(options: SessionConfigOptionInfo[]) {
  return options.find((option) => containsKeyword(option, REASONING_KEYWORDS)) ?? null
}

export function findPermissionOption(options: SessionConfigOptionInfo[]) {
  return options.find((option) => containsKeyword(option, PERMISSION_KEYWORDS)) ?? null
}

export function findModeName(modes: SessionModeStateInfo | null, selectedModeId: string | null) {
  if (!modes || !selectedModeId) return ""
  return modes.available_modes.find((mode) => mode.id === selectedModeId)?.name || ""
}

export function findSelectedOptionValueName(
  option: SessionConfigOptionInfo | null,
  selectedValues: Record<string, string>
) {
  if (!option) return ""
  const selectedValue = selectedValues[option.id]
  return option.kind.options.find((item) => item.value === selectedValue)?.name || ""
}

export function parseIncompleteTodos(raw: unknown): ComposerTodoItem[] {
  const source = Array.isArray(raw) ? raw : []
  return source
    .map((item) => ({
      id: String((item as Record<string, unknown>)?.id || ""),
      text: String((item as Record<string, unknown>)?.text || "").trim(),
      completed: Boolean((item as Record<string, unknown>)?.completed),
    }))
    .filter((item) => item.id && item.text && !item.completed)
}

function projectSelectedModeId(
  modes: SessionModeStateInfo | null,
  previousSelectedModeId?: string | null
) {
  if (!modes) return null
  if (previousSelectedModeId && modes.available_modes.some((mode) => mode.id === previousSelectedModeId)) {
    return previousSelectedModeId
  }
  return modes.current_mode_id ?? null
}

function projectSelectedValues(
  configOptions: SessionConfigOptionInfo[],
  previousSelectedValues?: Record<string, string>
) {
  const defaults = buildDefaultSelectedValues(configOptions)
  if (!previousSelectedValues) return defaults

  const next: Record<string, string> = { ...defaults }
  for (const option of configOptions) {
    const previousValue = previousSelectedValues[option.id]
    if (!previousValue) continue
    if (option.kind.options.some((item) => item.value === previousValue)) {
      next[option.id] = previousValue
    }
  }
  return next
}

export function createReadyDetailAgentConfigState(
  snapshot: AgentOptionsSnapshot,
  previousState?: Pick<DetailAgentConfigState, "selectedModeId" | "selectedValues">
): DetailAgentConfigState {
  const configOptions = Array.isArray(snapshot?.config_options) ? snapshot.config_options : []
  const modes = snapshot?.modes ?? null
  return {
    status: "ready",
    modes,
    configOptions,
    selectedModeId: projectSelectedModeId(modes, previousState?.selectedModeId),
    selectedValues: projectSelectedValues(configOptions, previousState?.selectedValues),
    message: !modes && configOptions.length === 0 ? "该智能体将使用远端默认配置" : "",
  }
}
