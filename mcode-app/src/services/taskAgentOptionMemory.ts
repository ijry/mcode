import { normalizeAgentType } from "@/services/conversation/agentType"

/**
 * 「上次为这个 agent 配好的智能体选项」—— 本机记忆，按 (连接, agent) 分桶。
 *
 * ## 为什么需要它
 *
 * 新建任务时「智能体选项」（授权模式 / 模型 / 推理程度）今天只有两个来源：文件夹的
 * `work_task_settings` 生效行，和探测快照里各选项的 `current_value`。两者都不是「我上次
 * 挑的那份」：
 *
 * - `work_task_settings` 是**每文件夹 / 全局**的共享默认值，一行只存一个 agent 的选项
 *   （换 agent 时 `mode_id` / `config_values` 会被清空），而且要显式保存一次。它记不住
 *   「给 codex 选的是什么、给 claude_code 选的是什么」。
 * - 探测快照的 `current_value` 是**远端此刻**的默认值，与用户的偏好无关。
 *
 * 于是每次下单都要重新点一遍模型和推理程度。这个模块补上中间那一层：**本机、按 agent
 * 分桶的上次选择**，插在「任务自己的覆盖值」之后、「文件夹生效设置」之前。
 *
 * ## 与既有三个 agent 相关 storage key 的关系
 *
 * `services/conversation/composerTools.ts` 有四个 key，本模块与其中两个刻意分开：
 *
 * | key | 存什么 | 为什么不复用 |
 * |---|---|---|
 * | `mcode_create_agent_config_cache_v1` | 探测**快照**，5 分钟 TTL | 那是「这个 agent 支持什么」，不是「我选了什么」 |
 * | `mcode_create_agent_config_selection_v1` | 新建会话/会话详情 composer 的选择 | 那份按 **(连接, agent, 项目路径, 会话)** 分桶，语义是「这条会话里的现场选择」；任务不在客户端起会话，也不该被在会话页的临时选择带着走 |
 *
 * 本模块因此**不按项目路径分桶**：模型 / 推理程度 / 授权模式是 agent 级的概念，同一个
 * agent 换个项目仍然是同一套偏好。快照里已经不存在的取值由
 * `createReadyDetailAgentConfigState` 在投影时自然丢掉，所以跨项目套用是安全的。
 *
 * **没有 TTL**：上次挑的配置不该因为放了一天就被忘掉（与 `mcode_create_agent_selection_v1`
 * 「上次选了哪个 agent」同一条理由，也与上面那份 5 分钟 TTL 的快照缓存刻意不同）。
 *
 * `agentType` 在读写两侧都过 `normalizeAgentType`：否则存进去的别名（`codex_cli`）与下次
 * 比对用的 canonical 值（`codex`）对不上，「记住上次配置」会静默失效 —— 这个坑
 * `persistSelectedAgentType` 已经记录过一次。
 */

const STORAGE_KEY = "mcode_task_agent_options_v1"

/** 一个 agent 的上次选择。字段名沿用落库那份（snake_case），避免中间再翻译一次。 */
export interface TaskAgentOptionMemoryEntry {
  mode_id: string | null
  config_values: Record<string, string>
  /**
   * 上次保存时记下的人类可读名字。探测失败时它是摘要行唯一还能说出人话的东西 ——
   * 显示原始 id 会让用户以为配置坏了。形状与 `WorkTaskConfig.label_snapshot` 相同。
   */
  label_snapshot: Record<string, unknown> | null
}

interface StoredEntry extends TaskAgentOptionMemoryEntry {
  updatedAt: number
}

/**
 * 桶键。**不含项目路径**（见模块头部说明），含 instanceKey 是因为不同电脑上装的 agent
 * 版本与可选取值都可能不同。
 */
function buildMemoryKey(instanceKey: string, agentType: string): string {
  const normalizedInstance = String(instanceKey || "").trim()
  const normalizedAgent = normalizeAgentType(agentType)
  if (!normalizedInstance || !normalizedAgent) return ""
  return `${normalizedInstance}::${normalizedAgent}`
}

function readMap(): Record<string, StoredEntry> {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY)
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
    return raw as Record<string, StoredEntry>
  } catch (error) {
    console.warn("read task agent option memory skipped", error)
    return {}
  }
}

function writeMap(next: Record<string, StoredEntry>) {
  try {
    uni.setStorageSync(STORAGE_KEY, next)
  } catch (error) {
    console.warn("persist task agent option memory skipped", error)
  }
}

/**
 * 读这台连接上这个 agent 的上次选择；没有记录返回 null。
 *
 * 返回 null 与返回一份空选择是**两件事**：前者表示「没记过」（调用方继续用文件夹生效
 * 设置），后者会被当成一份「显式选了空」的覆盖。
 */
export function readTaskAgentOptionMemory(
  instanceKey: string,
  agentType: string
): TaskAgentOptionMemoryEntry | null {
  const key = buildMemoryKey(instanceKey, agentType)
  if (!key) return null
  const hit = readMap()[key]
  if (!hit || typeof hit !== "object") return null
  const entry: TaskAgentOptionMemoryEntry = {
    mode_id: normalizeId(hit.mode_id),
    config_values: normalizeStringMap(hit.config_values),
    label_snapshot: normalizeLabelSnapshot(hit.label_snapshot),
  }
  // 一份什么都没有的记录等于没记过 —— 别让它盖住文件夹生效设置。
  if (!entry.mode_id && Object.keys(entry.config_values).length === 0) return null
  return entry
}

/** 记下这台连接上这个 agent 的选择。空选择直接删除该桶，不留一条空记录。 */
export function writeTaskAgentOptionMemory(
  instanceKey: string,
  agentType: string,
  entry: TaskAgentOptionMemoryEntry
) {
  const key = buildMemoryKey(instanceKey, agentType)
  if (!key) return
  const mode_id = normalizeId(entry.mode_id)
  const config_values = normalizeStringMap(entry.config_values)
  const map = readMap()
  if (!mode_id && Object.keys(config_values).length === 0) {
    if (!(key in map)) return
    delete map[key]
    writeMap(map)
    return
  }
  map[key] = {
    updatedAt: Date.now(),
    mode_id,
    config_values,
    label_snapshot: normalizeLabelSnapshot(entry.label_snapshot),
  }
  writeMap(map)
}

function normalizeId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function normalizeStringMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {}
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const normalizedKey = String(key || "").trim()
    if (normalizedKey && typeof value === "string" && value.trim()) {
      next[normalizedKey] = value.trim()
    }
  }
  return next
}

function normalizeLabelSnapshot(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  return input as Record<string, unknown>
}
