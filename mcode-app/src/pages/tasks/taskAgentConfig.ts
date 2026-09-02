import {
  createEmptyDetailAgentConfigState,
  createReadyDetailAgentConfigState,
  hasSessionModeOptions,
  type DetailAgentConfigState,
} from "@/services/conversation/composerTools"
import { AGENT_LABELS } from "@/services/remoteSettings"
import type { AgentOptionsSnapshot, SessionConfigOptionInfo } from "@/types/acp"

/**
 * 任务的「智能体选项」（授权模式 / 模型 / 推理程度……）在**存储形状**与**界面状态**
 * 之间的换算。
 *
 * 为什么单独一个模块：这套东西同时出现在三处 —— 任务编辑弹层（本任务的覆盖值）、
 * 任务设置弹层（文件夹默认值）、详情页头部（展示已定下来的那份）。三处存的是同一对
 * 字段（`mode_id` + `config_values`），落点不同（`work_task.config` 与
 * `work_task_settings.config`）。判定写在这里是为了两个弹层不会对「什么算选中」
 * 给出不同答案。
 *
 * 界面状态直接复用 `services/conversation/composerTools` 的
 * {@link DetailAgentConfigState} —— 与新建会话弹层、会话详情 composer 是同一个形状，
 * 因此 `acp_describe_agent_options` 的快照归一化（含**去掉 `mode` 这个镜像配置项**，
 * 见 `docs/mcode-architecture-notes/2026-07-03-p53-detail-mode-config-replay.md`）
 * 只有一份实现。
 *
 * 与 PC 端的对应物是 `codeg-plus/src/components/automations/agent-config-section.tsx`
 * 的 `effectiveSelections` / `snapshotLabels`。**字段名逐字沿用服务端**（snake_case），
 * 因为它们直接落进不透明 JSON 列。
 */

/** 落进 `work_task.config` / `work_task_settings.config` 的那两个字段。 */
export interface TaskAgentConfigSelection {
  mode_id: string | null
  config_values: Record<string, string>
}

/** 「继承 / 未配置」的取值。`mode_id` 为 null 且 `config_values` 为空即为此意。 */
export const INHERITED_TASK_AGENT_SELECTION: TaskAgentConfigSelection = {
  mode_id: null,
  config_values: {},
}

/**
 * 从存储记录里读出这一对字段。`config` 与 `settings` 两种记录的字段名相同，所以
 * 一个函数吃两种 —— 读取方一律带 `?.` 兜底（`config` 列解析失败时是 null）。
 */
export function readTaskAgentSelection(
  record?: { mode_id?: string | null; config_values?: Record<string, string> | null } | null
): TaskAgentConfigSelection {
  return {
    mode_id: normalizeId(record?.mode_id),
    config_values: normalizeStringMap(record?.config_values),
  }
}

/** 这份选择是不是「什么都没定」（即继承上一层）。 */
export function isInheritedTaskAgentSelection(selection: TaskAgentConfigSelection): boolean {
  return !selection.mode_id && Object.keys(selection.config_values).length === 0
}

/**
 * 探测快照 + 存储里的那份选择 → 界面状态。
 *
 * 存储那份走 `previousState` 传进去，所以它会被**投影**到快照上：仍然存在的取值保留，
 * 已经消失的取值退回该选项的当前值。刻意**不读**新建会话弹层那份持久化选择
 * （`readPersistedAgentConfigSelection`）—— 任务的选择来自服务端记录，不是本机上次
 * 在 composer 里挑的东西。
 */
export function taskAgentConfigStateFromSnapshot(
  snapshot: AgentOptionsSnapshot,
  stored: TaskAgentConfigSelection
): DetailAgentConfigState {
  return createReadyDetailAgentConfigState(snapshot, {
    selectedModeId: stored.mode_id,
    selectedValues: stored.config_values,
  })
}

/** 探测失败 / 尚未探测时的界面状态。 */
export function taskAgentConfigPlaceholderState(
  status: DetailAgentConfigState["status"],
  message = ""
): DetailAgentConfigState {
  return { ...createEmptyDetailAgentConfigState(message), status }
}

/**
 * 只保留**真的能选**的配置项。
 *
 * 远端的配置项种类不止 select 一种（ACP 的 unstable boolean kind 也在往外发，Cline
 * 的 `auto_approve` 就是），而 `types/acp.ts` 的 `SessionConfigOptionKindInfo` 只声明了
 * select。没有取值列表的选项在 chip 界面里会渲染成一个**空的**分组标题 —— 一行看不懂
 * 也点不动的字。过滤掉比画出来好：漏掉一个开关只是少一个功能，画一个空组是个 bug。
 */
export function selectableTaskConfigOptions(
  options: SessionConfigOptionInfo[]
): SessionConfigOptionInfo[] {
  return (Array.isArray(options) ? options : []).filter(
    (option) => Array.isArray(option?.kind?.options) && option.kind.options.length > 0
  )
}

/** 这个 agent 到底有没有可配的东西（决定要不要把配置行画出来）。 */
export function hasTaskAgentConfigChoices(state: DetailAgentConfigState): boolean {
  return (
    hasSessionModeOptions(state.modes) ||
    selectableTaskConfigOptions(state.configOptions).length > 0
  )
}

/**
 * 界面上**正在显示**的那份具体选择 —— 保存时写这一份，而不是 `selectedValues` 原样。
 *
 * 这是 PC 端 `effectiveSelections` 的同一条规则：界面没有「继承」这个选项，每个下拉
 * 显示的都是一个具体值（用户没动过时显示的是该选项的 `current_value`），所以存下来的
 * 也必须是那个具体值。存空值等于「跟随远端默认」，而远端默认**将来会变** —— 用户看到
 * 的是 `gpt-5-codex`，半年后同一个任务却跑在别的模型上。
 *
 * 两条与 PC 端不同或需要小心的地方：
 * - **探测没落地就原样返回存储值**（`status !== "ready"`）。此时界面一个具体值都没显示过，
 *   凭一次读取失败去改写记录里的配置是最坏的结果。
 * - **快照里没有的取值一律保留**。可能是 PC 端配的、这台机器上的 agent 版本还不认的选项；
 *   一次探测读不到它不代表它该被删掉。
 */
export function effectiveTaskAgentSelection(
  state: DetailAgentConfigState,
  stored: TaskAgentConfigSelection
): TaskAgentConfigSelection {
  if (state.status !== "ready") {
    return { mode_id: stored.mode_id, config_values: { ...stored.config_values } }
  }

  const config_values: Record<string, string> = {}
  for (const option of selectableTaskConfigOptions(state.configOptions)) {
    const effective = state.selectedValues[option.id] || option.kind.current_value
    if (effective) config_values[option.id] = effective
  }
  // 兜底：快照没有广告过的取值不丢。
  for (const [id, value] of Object.entries(stored.config_values)) {
    if (!(id in config_values) && value) config_values[id] = value
  }

  /*
   * 有会话模式就把它定下来。
   *
   * PC 端多一道 `!hasOptions` 的闸（它在有配置项时**不画**独立的模式行），mcode-app
   * 两个渠道是同时画的 —— `removeSessionModeConfigMirror` 已经把重复的那个 `mode`
   * 配置项摘掉了，所以这里不需要那道闸。既然画出来了，就得能存下来。
   */
  const mode_id = hasSessionModeOptions(state.modes)
    ? state.selectedModeId || state.modes?.current_mode_id || null
    : stored.mode_id

  return { mode_id, config_values }
}

/**
 * 保存时顺手记下的**人类可读名字**（`label_snapshot`）。
 *
 * 存的是名字而不是只存 id，因为详情页要显示「Claude Code · Opus 4.6」这种东西，而
 * 那时候未必还能探测到 agent（可能已被卸载，或选项集换了版本）。与 PC 端
 * `snapshotLabels` 同形，两端读的是同一份 JSON。
 */
export function taskAgentLabelSnapshot(input: {
  agentType: string
  state: DetailAgentConfigState
  selection: TaskAgentConfigSelection
}): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {
    agent_label: taskAgentLabel(input.agentType),
  }

  const modeName = findModeLabel(input.state, input.selection.mode_id)
  if (modeName) snapshot.mode_label = modeName

  const config_labels: Record<string, string> = {}
  for (const option of selectableTaskConfigOptions(input.state.configOptions)) {
    const value = input.selection.config_values[option.id]
    if (!value) continue
    const name = findValueLabel(option, value)
    if (name) config_labels[option.id] = name
  }
  if (Object.keys(config_labels).length > 0) snapshot.config_labels = config_labels

  return snapshot
}

/** agent 类型 → 界面标签。复用 `remoteSettings.AGENT_LABELS` 那份唯一映射。 */
export function taskAgentLabel(agentType?: string | null): string {
  const value = String(agentType || "").trim()
  if (!value) return ""
  return (AGENT_LABELS as Record<string, string>)[value] || value
}

/**
 * 配置行上那一句摘要（「Agent · Opus 4.6 · 高」）。
 *
 * `fallbackLabels` 传上一次保存下来的 `label_snapshot`：探测失败时它是唯一还能说出
 * 人话的东西，否则只能显示一串原始 id（或者干脆什么都不显示，让用户以为没配过）。
 */
export function taskAgentConfigSummary(input: {
  state: DetailAgentConfigState
  stored: TaskAgentConfigSelection
  fallbackLabels?: Record<string, unknown> | null
}): string {
  if (input.state.status === "loading") return "正在读取可用配置..."

  const parts: string[] = []
  if (input.state.status === "ready") {
    const modeName = findModeLabel(input.state, input.state.selectedModeId)
    if (modeName) parts.push(modeName)
    for (const option of selectableTaskConfigOptions(input.state.configOptions)) {
      const name = findValueLabel(option, input.state.selectedValues[option.id])
      if (name) parts.push(name)
    }
  } else {
    parts.push(...storedSelectionLabels(input.stored, input.fallbackLabels))
  }

  if (parts.length > 0) return parts.join(" · ")
  return input.state.message || "使用远端默认配置"
}

/** 选中一个会话模式。 */
export function withTaskAgentMode(
  state: DetailAgentConfigState,
  modeId: string
): DetailAgentConfigState {
  return { ...state, selectedModeId: modeId }
}

/** 选中某个配置项的取值。 */
export function withTaskAgentConfigValue(
  state: DetailAgentConfigState,
  configId: string,
  valueId: string
): DetailAgentConfigState {
  return {
    ...state,
    selectedValues: { ...state.selectedValues, [configId]: valueId },
  }
}

/** 探测不到时，尽量用上次存下来的名字说话；没有名字就退回原始 id。 */
function storedSelectionLabels(
  stored: TaskAgentConfigSelection,
  fallbackLabels?: Record<string, unknown> | null
): string[] {
  const labels = fallbackLabels && typeof fallbackLabels === "object" ? fallbackLabels : {}
  const configLabels = normalizeStringMap((labels as Record<string, unknown>).config_labels)
  const parts: string[] = []

  const modeLabel = normalizeId((labels as Record<string, unknown>).mode_label)
  if (stored.mode_id) parts.push(modeLabel || stored.mode_id)
  for (const [id, value] of Object.entries(stored.config_values)) {
    if (!value) continue
    parts.push(configLabels[id] || value)
  }
  return parts
}

function findModeLabel(state: DetailAgentConfigState, modeId: string | null): string {
  if (!modeId) return ""
  const modes = state.modes?.available_modes
  if (!Array.isArray(modes)) return ""
  return modes.find((mode) => mode.id === modeId)?.name || ""
}

/** 取值名。**先查分组再查平铺列表** —— 分组形态下平铺列表是服务端摊平出来的副本。 */
function findValueLabel(option: SessionConfigOptionInfo, value?: string): string {
  if (!value) return ""
  for (const group of Array.isArray(option.kind?.groups) ? option.kind.groups : []) {
    const hit = (Array.isArray(group?.options) ? group.options : []).find(
      (item) => item.value === value
    )
    if (hit?.name) return hit.name
  }
  const flat = Array.isArray(option.kind?.options) ? option.kind.options : []
  return flat.find((item) => item.value === value)?.name || ""
}

function normalizeId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function normalizeStringMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {}
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim()) next[key.trim()] = value.trim()
  }
  return next
}
