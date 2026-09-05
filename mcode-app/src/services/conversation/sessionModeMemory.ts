import { normalizeAgentType } from "@/services/conversation/agentType"

/**
 * 会话在这台手机上**显式选过**的授权模式 / 配置取值，用来在下一次建连时把它交回去。
 *
 * ## 为什么需要
 *
 * ACP 会话的授权模式活在 agent 进程里，而那个进程会被回收：codeg-plus 有一道
 * `acp/manager.rs::sweep_idle`（`acp/idle_sweep.rs` 定时调用）把空闲连接断掉，手机端
 * 的连接因此几分钟就被收走一次。用户下一条回复会重新建连 —— 而
 * `@agentclientprotocol/claude-agent-acp` 给**新建/恢复**的会话播种的权限模式来自
 * `~/.claude` 的 `permissions.defaultMode`（缺省即 `default`，该适配器把它显示成
 * 「Manual」）。于是「在手机上把权限切成 bypass → 回一条消息 → 又变回 Manual」。
 *
 * 客户端这一侧唯一能补的就是**建连时把用户的选择一起交上去**：`acp_connect` 的
 * `preferredModeId` / `preferredConfigValues`（codeg-plus
 * `acp/connection.rs::apply_preferred_session_options`）。此前只有新建会话弹层传这两个
 * 字段，重连一律传 `undefined`。
 *
 * ## 与「不自动重放」那条约束的关系
 *
 * `docs/mcode-architecture-notes/2026-07-03-detail-session-config-no-auto-replay.md`
 * 明确禁止在 attach / 重连时对**已有会话**发 `acp_set_mode` —— 那会把另一端刚设好的
 * 现场配置掀掉。这里不违反它，因为走的不是那条路：codeg-plus 的 `spawn_agent` 先做
 * 连接去重（`acp/manager.rs`，命中同一个 external session 就直接复用并**跳过**
 * `apply_preferred_session_options`），所以 `preferredModeId` 只在「这条连接由我们新建」
 * 时生效 —— 那时根本没有活着的会话可被打扰。
 *
 * ## 只记显式选择
 *
 * 存的是用户**点过**的那几个取值，不是界面上显示的全部。界面上未动过的取值来自探测
 * 快照的 `current_value`（远端此刻的默认值）；把它们也钉住，会让一条几天前开的会话在
 * 重连后跑在一个早已过期的默认模型上。任务那条路的规则相反（见
 * `pages/tasks/taskAgentConfig.ts` 的 `effectiveTaskAgentSelection`），因为那份是要写进
 * 记录、必须自解释的**存档**；这里是一次**会话现场**的补偿。
 */

const STORAGE_KEY = "mcode_conversation_session_mode_v1"
/**
 * 桶数上限。一个会话一条，手机上会话只增不减，不设上限就是一条永远长大的
 * localStorage 记录。超出时按 `updatedAt` 丢最旧的 —— 那些会话早就不在手边了。
 */
const MAX_ENTRIES = 120

interface StoredEntry {
  updatedAt: number
  /**
   * 记录时的 agent。读取侧要求它匹配：`conversationId` 只在单个远端实例内唯一，而
   * 手机可以连多台电脑。agent 对不上就当没记过 —— 一份跨 agent 的模式 id 毫无意义。
   */
  agentType: string
  modeId: string
  configValues: Record<string, string>
}

export interface ConversationSessionSelection {
  modeId: string
  configValues: Record<string, string>
}

function readMap(): Record<string, StoredEntry> {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY)
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
    return raw as Record<string, StoredEntry>
  } catch (error) {
    console.warn("read conversation session mode memory skipped", error)
    return {}
  }
}

function writeMap(next: Record<string, StoredEntry>) {
  try {
    uni.setStorageSync(STORAGE_KEY, prune(next))
  } catch (error) {
    console.warn("persist conversation session mode memory skipped", error)
  }
}

function prune(map: Record<string, StoredEntry>): Record<string, StoredEntry> {
  const keys = Object.keys(map)
  if (keys.length <= MAX_ENTRIES) return map
  const kept = keys
    .sort((left, right) => Number(map[right]?.updatedAt || 0) - Number(map[left]?.updatedAt || 0))
    .slice(0, MAX_ENTRIES)
  const next: Record<string, StoredEntry> = {}
  for (const key of kept) next[key] = map[key]
  return next
}

function bucketKey(conversationId: number): string {
  const id = Number(conversationId || 0)
  return id > 0 ? String(id) : ""
}

function upsert(
  conversationId: number,
  agentType: string,
  mutate: (entry: StoredEntry) => void
) {
  const key = bucketKey(conversationId)
  const normalizedAgent = normalizeAgentType(agentType)
  if (!key || !normalizedAgent) return
  const map = readMap()
  const existing = map[key]
  // agent 换了就从零开始：旧 agent 的模式 id 与取值在新 agent 上没有意义。
  const entry: StoredEntry =
    existing && typeof existing === "object" && normalizeAgentType(existing.agentType) === normalizedAgent
      ? {
          updatedAt: existing.updatedAt,
          agentType: normalizedAgent,
          modeId: normalizeText(existing.modeId),
          configValues: normalizeStringMap(existing.configValues),
        }
      : { updatedAt: 0, agentType: normalizedAgent, modeId: "", configValues: {} }
  mutate(entry)
  entry.updatedAt = Date.now()
  map[key] = entry
  writeMap(map)
}

/** 记下用户在这条会话里显式选的授权模式。 */
export function rememberConversationSessionMode(input: {
  conversationId: number
  agentType: string
  modeId: string
}) {
  const modeId = normalizeText(input.modeId)
  if (!modeId) return
  upsert(input.conversationId, input.agentType, (entry) => {
    entry.modeId = modeId
  })
}

/** 记下用户在这条会话里显式选的某个配置取值（模型 / 推理程度……）。 */
export function rememberConversationSessionConfigValue(input: {
  conversationId: number
  agentType: string
  configId: string
  valueId: string
}) {
  const configId = normalizeText(input.configId)
  const valueId = normalizeText(input.valueId)
  if (!configId || !valueId) return
  upsert(input.conversationId, input.agentType, (entry) => {
    entry.configValues = { ...entry.configValues, [configId]: valueId }
  })
}

/**
 * 读这条会话待交回的选择；没有记录、或记录属于另一个 agent 时返回 null。
 *
 * 建连路径调用（`services/conversation/connectionSessionManager.ts`），交给
 * `acp_connect` 的 `preferredModeId` / `preferredConfigValues`。
 */
export function readConversationSessionSelection(
  conversationId: number,
  agentType: string
): ConversationSessionSelection | null {
  const key = bucketKey(conversationId)
  const normalizedAgent = normalizeAgentType(agentType)
  if (!key || !normalizedAgent) return null
  const hit = readMap()[key]
  if (!hit || typeof hit !== "object") return null
  if (normalizeAgentType(hit.agentType) !== normalizedAgent) return null
  const selection: ConversationSessionSelection = {
    modeId: normalizeText(hit.modeId),
    configValues: normalizeStringMap(hit.configValues),
  }
  if (!selection.modeId && Object.keys(selection.configValues).length === 0) return null
  return selection
}

/** 会话被删除 / 本机不再持有它时清掉那一条。 */
export function forgetConversationSessionSelection(conversationId: number) {
  const key = bucketKey(conversationId)
  if (!key) return
  const map = readMap()
  if (!(key in map)) return
  delete map[key]
  writeMap(map)
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeStringMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {}
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const normalizedKey = normalizeText(key)
    const normalizedValue = normalizeText(value)
    if (normalizedKey && normalizedValue) next[normalizedKey] = normalizedValue
  }
  return next
}
