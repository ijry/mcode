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

export interface DetailConfigOptionsProjection {
  modelOption: SessionConfigOptionInfo | null
  reasoningOption: SessionConfigOptionInfo | null
  permissionOption: SessionConfigOptionInfo | null
}

interface CachedCreateAgentConfigEntry {
  updatedAt: number
  snapshot: AgentOptionsSnapshot
}

interface StoredCreateAgentConfigSelectionEntry {
  updatedAt: number
  selectedModeId: string | null
  selectedValues: Record<string, string>
}

const MODEL_KEYWORDS = ["model", "模型"]
const REASONING_KEYWORDS = ["reasoning", "thinking", "effort"]
const PERMISSION_KEYWORDS = ["permission", "approval", "sandbox", "auth"]
const CREATE_AGENT_CONFIG_CACHE_STORAGE_KEY = "mcode_create_agent_config_cache_v1"
const CREATE_AGENT_CONFIG_SELECTION_STORAGE_KEY = "mcode_create_agent_config_selection_v1"
const CREATE_AGENT_CACHE_TTL_MS = 5 * 60 * 1000

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

function normalizeStorageRecord<T>(raw: unknown): Record<string, T> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {}
  }
  return raw as Record<string, T>
}

function normalizeSelectionValues(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {}
  }
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const normalizedKey = String(key || "").trim()
    const normalizedValue = typeof value === "string" ? value.trim() : ""
    if (normalizedKey && normalizedValue) {
      next[normalizedKey] = normalizedValue
    }
  }
  return next
}

function normalizeProjectPath(path?: string) {
  return String(path || "").trim()
}

function isFreshCache(updatedAt: number, ttlMs = CREATE_AGENT_CACHE_TTL_MS): boolean {
  return Number.isFinite(updatedAt) && updatedAt > 0 && Date.now() - updatedAt < ttlMs
}

function readCreateAgentConfigCacheMap() {
  return normalizeStorageRecord<CachedCreateAgentConfigEntry>(
    uni.getStorageSync(CREATE_AGENT_CONFIG_CACHE_STORAGE_KEY)
  )
}

function writeCreateAgentConfigCacheMap(next: Record<string, CachedCreateAgentConfigEntry>) {
  uni.setStorageSync(CREATE_AGENT_CONFIG_CACHE_STORAGE_KEY, next)
}

function readCreateAgentConfigSelectionMap() {
  return normalizeStorageRecord<StoredCreateAgentConfigSelectionEntry>(
    uni.getStorageSync(CREATE_AGENT_CONFIG_SELECTION_STORAGE_KEY)
  )
}

function writeCreateAgentConfigSelectionMap(
  next: Record<string, StoredCreateAgentConfigSelectionEntry>
) {
  uni.setStorageSync(CREATE_AGENT_CONFIG_SELECTION_STORAGE_KEY, next)
}

export function buildAgentConfigContextKey(
  connectionKeyValue: string,
  agentType: string,
  projectPath?: string
): string {
  return JSON.stringify([
    String(connectionKeyValue || "").trim(),
    String(agentType || "").trim().toLowerCase(),
    normalizeProjectPath(projectPath),
  ])
}

export function readFreshAgentConfigCache(contextKey: string): AgentOptionsSnapshot | null {
  if (!contextKey) return null
  const cacheMap = readCreateAgentConfigCacheMap()
  const hit = cacheMap[contextKey]
  if (!hit) return null
  if (!isFreshCache(Number(hit.updatedAt || 0))) {
    delete cacheMap[contextKey]
    writeCreateAgentConfigCacheMap(cacheMap)
    return null
  }
  return hit.snapshot && typeof hit.snapshot === "object" ? hit.snapshot : null
}

export function persistAgentConfigCache(contextKey: string, snapshot: AgentOptionsSnapshot) {
  if (!contextKey) return
  const cacheMap = readCreateAgentConfigCacheMap()
  cacheMap[contextKey] = {
    updatedAt: Date.now(),
    snapshot,
  }
  writeCreateAgentConfigCacheMap(cacheMap)
}

export function readPersistedAgentConfigSelection(
  contextKey: string
): StoredCreateAgentConfigSelectionEntry | null {
  if (!contextKey) return null
  const selectionMap = readCreateAgentConfigSelectionMap()
  const hit = selectionMap[contextKey]
  if (!hit || typeof hit !== "object") return null
  return {
    updatedAt: Number(hit.updatedAt || 0),
    selectedModeId:
      typeof hit.selectedModeId === "string" && hit.selectedModeId.trim()
        ? hit.selectedModeId.trim()
        : null,
    selectedValues: normalizeSelectionValues(hit.selectedValues),
  }
}

export function persistAgentConfigSelection(
  contextKey: string,
  input: { selectedModeId: string | null; selectedValues: Record<string, string> }
) {
  if (!contextKey) return
  const selectionMap = readCreateAgentConfigSelectionMap()
  selectionMap[contextKey] = {
    updatedAt: Date.now(),
    selectedModeId:
      typeof input.selectedModeId === "string" && input.selectedModeId.trim()
        ? input.selectedModeId.trim()
        : null,
    selectedValues: normalizeSelectionValues(input.selectedValues),
  }
  writeCreateAgentConfigSelectionMap(selectionMap)
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

function findOptionByKeywords(
  options: SessionConfigOptionInfo[],
  keywords: string[],
  excludeIds: string[] = []
) {
  return options.find((option) => !excludeIds.includes(option.id) && containsKeyword(option, keywords)) ?? null
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

export function projectDetailConfigOptions(options: SessionConfigOptionInfo[]): DetailConfigOptionsProjection {
  const modelOption = findOptionByKeywords(options, MODEL_KEYWORDS)
  const reasoningOption = findOptionByKeywords(
    options,
    REASONING_KEYWORDS,
    modelOption ? [modelOption.id] : []
  )
  const excludeIds = [modelOption?.id, reasoningOption?.id].filter(Boolean) as string[]
  const permissionOption = findOptionByKeywords(options, PERMISSION_KEYWORDS, excludeIds)

  return {
    modelOption,
    reasoningOption,
    permissionOption,
  }
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
  const persistedSelection = previousState ?? undefined
  return {
    status: "ready",
    modes,
    configOptions,
    selectedModeId: projectSelectedModeId(modes, persistedSelection?.selectedModeId),
    selectedValues: projectSelectedValues(configOptions, persistedSelection?.selectedValues),
    message: !modes && configOptions.length === 0 ? "该智能体将使用远端默认配置" : "",
  }
}
