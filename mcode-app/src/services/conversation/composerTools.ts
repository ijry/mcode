import type {
  AgentOptionsSnapshot,
  SessionConfigOptionInfo,
  SessionModeStateInfo,
} from "@/types/acp"
import { normalizeAgentType } from "@/services/conversation/agentType"

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
/**
 * agent **配置**（modes / configOptions / selectedValues）缓存的 TTL。
 *
 * 短，因为它描述的是「这个 agent 此刻支持哪些选项」—— 远端换个版本就变了，拿旧的去渲染
 * 会给出已经不存在的模型选项。
 *
 * 与下面的 {@link AGENT_LIST_CACHE_TTL_MS} 刻意不同，见那条注释。
 */
const CREATE_AGENT_CACHE_TTL_MS = 5 * 60 * 1000
const CREATE_AGENT_LIST_CACHE_STORAGE_KEY = "mcode_create_agent_list_cache_v1"
const CREATE_AGENT_SELECTION_STORAGE_KEY = "mcode_create_agent_selection_v1"
/**
 * agent **列表**（这台连接上装了哪些智能体）缓存的 TTL —— **24 小时，不是 5 分钟**。
 *
 * 两个 TTL 差 288 倍，是有意的：装了哪些 agent 是用户在电脑上手动改的，一天内几乎不变；
 * 而配置项会随适配器版本变。列表缓存短了的表现是「每次打开新建弹层都要重新拉一遍列表」，
 * 弹层于是每次都先空一下 —— 不报错，只是慢。
 *
 * **这两个常量原本同名**（各自文件里都叫 `CREATE_AGENT_CACHE_TTL_MS`），列表那份在
 * `pages/conversations/index.vue`。合并到本模块时若让列表复用上面那个默认值，24 小时会
 * 静默缩成 5 分钟。所以这里显式导出，并在读取处显式传参。
 */
export const AGENT_LIST_CACHE_TTL_MS = 24 * 60 * 60 * 1000

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

function normalizeContextScope(scope?: string | number | null) {
  return String(scope ?? "").trim()
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
  projectPath?: string,
  scope?: string | number | null
): string {
  const key = [
    String(connectionKeyValue || "").trim(),
    String(agentType || "").trim().toLowerCase(),
    normalizeProjectPath(projectPath),
  ]
  const normalizedScope = normalizeContextScope(scope)
  if (normalizedScope) {
    key.push(normalizedScope)
  }
  return JSON.stringify(key)
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

// ─── agent 列表缓存与「上次选了哪个 agent」记忆 ──────────────────────────────
//
// 这两组从 `pages/conversations/index.vue` 搬来（新建会话弹层用）。它们与上面的 agent
// **配置**缓存是不同的东西，注意 TTL 差 288 倍（见 AGENT_LIST_CACHE_TTL_MS 的说明）。

/** 一个可选 agent 在新建弹层里的展示项。 */
export interface AgentListOption {
  label: string
  value: string
  description?: string
}

interface CachedAgentListEntry {
  updatedAt: number
  options: AgentListOption[]
}

interface StoredSelectedAgentEntry {
  updatedAt: number
  agentType: string
}

function readAgentListCacheMap() {
  return normalizeStorageRecord<CachedAgentListEntry>(
    uni.getStorageSync(CREATE_AGENT_LIST_CACHE_STORAGE_KEY)
  )
}

function writeAgentListCacheMap(next: Record<string, CachedAgentListEntry>) {
  uni.setStorageSync(CREATE_AGENT_LIST_CACHE_STORAGE_KEY, next)
}

function readSelectedAgentMap() {
  return normalizeStorageRecord<StoredSelectedAgentEntry>(
    uni.getStorageSync(CREATE_AGENT_SELECTION_STORAGE_KEY)
  )
}

function writeSelectedAgentMap(next: Record<string, StoredSelectedAgentEntry>) {
  uni.setStorageSync(CREATE_AGENT_SELECTION_STORAGE_KEY, next)
}

/**
 * 读这台连接上缓存的 agent 列表；过期或没有则返回 null（调用方去拉远端）。
 *
 * TTL **显式传 {@link AGENT_LIST_CACHE_TTL_MS}**，不吃 `isFreshCache` 的默认值 ——
 * 那个默认值是给 agent 配置用的 5 分钟。
 */
export function readFreshAgentListCache(connectionKey: string): AgentListOption[] | null {
  if (!connectionKey) return null
  const cacheMap = readAgentListCacheMap()
  const hit = cacheMap[connectionKey]
  if (!hit) return null
  if (!isFreshCache(Number(hit.updatedAt || 0), AGENT_LIST_CACHE_TTL_MS)) {
    delete cacheMap[connectionKey]
    writeAgentListCacheMap(cacheMap)
    return null
  }
  return Array.isArray(hit.options) ? hit.options : null
}

export function persistAgentListCache(connectionKey: string, options: AgentListOption[]) {
  // 空 key 会把所有连接的缓存塌到同一个槽位上 —— 宁可不缓存。
  if (!connectionKey) return
  const cacheMap = readAgentListCacheMap()
  cacheMap[connectionKey] = { updatedAt: Date.now(), options }
  writeAgentListCacheMap(cacheMap)
}

/**
 * 读这台连接上「用户上次选的 agent」。
 *
 * **没有 TTL**：上次挑的智能体不该因为放了一天就被忘掉。与列表缓存刻意不同。
 * 读写两侧都归一化 —— 不然存进去的别名（`codex_cli`）与下次比对用的 canonical 值
 * （`codex`）对不上，「记住上次选择」会静默失效。
 */
export function readPersistedSelectedAgentType(connectionKey: string): string {
  if (!connectionKey) return ""
  const hit = readSelectedAgentMap()[connectionKey]
  return hit?.agentType ? normalizeAgentType(hit.agentType) : ""
}

export function persistSelectedAgentType(connectionKey: string, agentType: string) {
  if (!connectionKey || !agentType) return
  const selectionMap = readSelectedAgentMap()
  selectionMap[connectionKey] = {
    updatedAt: Date.now(),
    agentType: normalizeAgentType(agentType),
  }
  writeSelectedAgentMap(selectionMap)
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

export function hasSessionModeOptions(modes: SessionModeStateInfo | null): boolean {
  return Boolean(modes && Array.isArray(modes.available_modes) && modes.available_modes.length > 0)
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

export function removeSessionModeConfigMirror(
  configOptions: SessionConfigOptionInfo[],
  modes: SessionModeStateInfo | null
) {
  if (!modes?.available_modes?.length) return configOptions
  return configOptions.filter((option) => normalizeLabel(option.id) !== "mode")
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
  const modes = snapshot?.modes ?? null
  const rawConfigOptions = Array.isArray(snapshot?.config_options) ? snapshot.config_options : []
  const configOptions = removeSessionModeConfigMirror(rawConfigOptions, modes)
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
