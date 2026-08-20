import type { ContentPart, ToolCall } from "@/types/acp"

/**
 * 原生子智能体（Claude `Task`/`Agent`、Codex `spawn_agent`、Grok `spawn_subagent`、
 * Cursor `task`）的识别与展示。
 *
 * 这些调用在协议上就是普通的 `tool_use` + `tool_result`，只是 `tool_result` 上挂了
 * `agent_stats`（服务端 `models/message.rs` 的 `AgentExecutionStats`）。不识别的话
 * 一个子智能体任务会被并进「调用 N 个工具」的通用分组里，而它的正文/思考在实时路径
 * 会被整段塞进父气泡 —— 这就是「mcode 直接展示太长了」的成因。
 *
 * **不覆盖** codeg 自研的 `delegate_to_agent` 委派：参考实现里那类卡片刻意永不展开，
 * 在 mcode 里也已经是一个折叠的工具组，不造成长度问题。
 */

// ---------------------------------------------------------------------------
// 识别
// ---------------------------------------------------------------------------

/**
 * 精确匹配才算「发起子智能体」的工具名。
 *
 * `task` **只能精确相等，绝不可前缀匹配** —— 这是不污染计划面板的关键：
 * `TaskCreate` / `TaskUpdate` / `TaskList` 归一后是 `taskcreate` / `taskupdate` /
 * `tasklist`，都不等于 `task`。
 *
 * `agent` 这一项同时覆盖实时路径：服务端 `resolve_rewritten_title` 在认出子智能体时
 * 会把 title 改写成字面量 `"agent"`，而 `api/acp.ts` 的 `ToolCall.name` 是 title 优先。
 */
const SUBAGENT_LAUNCH_NAMES = new Set([
  "agent",
  "task",
  "spawn_agent",
  "spawn_subagent",
])

/**
 * 明确**不是**发起子智能体的工具，必须先判且优先于 freeform 的词段兜底。
 *
 * 参考实现靠别名表把 `wait_agent`/`close_agent` 先映射成 `"task"` 再做名字匹配，
 * 我们匹配的是原始名、不继承那层保护，所以必须自己拒 —— 否则每个 `wait_agent`
 * 都会被兜底判成发起、长出一个假胶囊。`delegate_to_agent` 一族属于另一套委派系统，
 * 本模块不接管。
 */
const SUBAGENT_DENY_NAMES = new Set([
  "wait_agent",
  "close_agent",
  "update_plan",
  "delegate_to_agent",
  "get_delegation_status",
  "cancel_delegation",
  "background_task",
  "background_cancel",
  "background_output",
])

function canonicalToolName(name?: string | null): string {
  return String(name || "")
    .trim()
    .toLowerCase()
    .split("__")
    .pop()!                     // 剥掉 `mcp__<server>__` 前缀
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
}

export function isSubagentToolName(name?: string | null): boolean {
  const canonical = canonicalToolName(name)
  if (!canonical) return false
  if (SUBAGENT_DENY_NAMES.has(canonical)) return false
  if (SUBAGENT_LAUNCH_NAMES.has(canonical)) return true
  // freeform 兜底：接住 `call_omo_agent` 一类自定义名字。
  //
  // **不要写成 `/\bagent\b/`。** `canonicalToolName` 把所有分隔符都归一成 `_`，而 `_`
  // 在正则里算单词字符，于是 `\b` 在 snake_case 内部永远不成立 —— `call_omo_agent`、
  // `wait_agent` 全都匹配不上，整个兜底是死代码，连 DENY 列表「挡住 wait_agent 假胶囊」
  // 的理由都落在一个从不触发的分支上。按 `_` 切开逐段精确比较才是这里真正想表达的。
  //
  // 代价是 `agent_list` 一类「操作 agent 而非发起 agent」的名字也会中；这是 heuristic
  // 层面固有的误收风险，出现了就加进 DENY —— 那正是 DENY 存在的意义。
  return canonical.split("_").includes("agent")
}

/**
 * `_meta.claudeCode.subagent === true` 是权威标记，严格比较 —— 字符串 `"true"` 不算。
 */
export function claudeCodeMarksSubagent(meta?: Record<string, any> | null): boolean {
  const claudeCode = recordFromUnknown(meta?.claudeCode)
  return claudeCode?.subagent === true
}

function inputMarksSubagent(input: Record<string, any> | null): boolean {
  if (!input) return false
  return "subagent_type" in input || "subagentType" in input
}

/**
 * 判定顺序本身是语义的一部分：权威标记 → DENY → input 形状 → 工具名。
 */
export function isSubagentToolCall(toolCall?: ToolCall | null): boolean {
  if (!toolCall) return false
  if (claudeCodeMarksSubagent(toolCall.meta)) return true

  const canonical = canonicalToolName(toolCall.name)
  if (canonical && SUBAGENT_DENY_NAMES.has(canonical)) return false

  if (inputMarksSubagent(recordFromUnknown(toolCall.input))) return true
  return isSubagentToolName(toolCall.name)
}

export function isSubagentPart(part?: ContentPart | null): boolean {
  if (!part || part.type !== "tool_call") return false
  return isSubagentToolCall(part.tool_call)
}

// ---------------------------------------------------------------------------
// 解析 input
// ---------------------------------------------------------------------------

export interface SubagentLaunch {
  subagentType: string | null
  description: string | null
  prompt: string | null
  model: string | null
}

export function parseSubagentLaunch(toolCall: ToolCall): SubagentLaunch {
  const input = recordFromUnknown(toolCall.input)
  return {
    // `agent_type` 是 Codex `spawn_agent` 的拼法。
    subagentType: stringField(input, ["subagent_type", "subagentType", "agent_type", "agentType"]),
    description: stringField(input, ["description", "task", "title"]),
    prompt: stringField(input, ["prompt", "instructions", "message"]),
    model: stringField(input, ["model"]),
  }
}

// ---------------------------------------------------------------------------
// 解析 agent_stats
// ---------------------------------------------------------------------------

export interface SubagentToolCallSummary {
  toolName: string
  inputPreview: string | null
  outputPreview: string | null
  isError: boolean
}

export interface SubagentStats {
  agentType: string | null
  status: string | null
  totalDurationMs: number | null
  totalTokens: number | null
  totalToolUseCount: number | null
  childSessionId: string | null
  toolCalls: SubagentToolCallSummary[]
  /**
   * `clampSubagentStats` 裁掉的条数。必须透出来，否则展开后看到的是「掐头的列表」
   * 却没有任何提示 —— 用户会以为子智能体只跑了这几个工具。
   */
  toolCallsTruncated: number | null
}

/**
 * `ToolCall.agentStats` 存的是服务端原样的 snake_case，字段名映射只发生在这里 ——
 * 这样 6 处归一化都只做哑透传，服务端加字段时一行都不用改。
 */
export function normalizeSubagentStats(raw: unknown): SubagentStats | null {
  const stats = recordFromUnknown(raw)
  if (!stats) return null

  const rawToolCalls = Array.isArray(stats.tool_calls)
    ? stats.tool_calls
    : Array.isArray((stats as any).toolCalls)
      ? (stats as any).toolCalls
      : []

  return {
    agentType: stringField(stats, ["agent_type", "agentType"]),
    status: stringField(stats, ["status"]),
    totalDurationMs: numberField(stats, ["total_duration_ms", "totalDurationMs"]),
    totalTokens: numberField(stats, ["total_tokens", "totalTokens"]),
    totalToolUseCount: numberField(stats, ["total_tool_use_count", "totalToolUseCount"]),
    childSessionId: stringField(stats, ["child_session_id", "childSessionId"]),
    toolCallsTruncated: numberField(stats, ["tool_calls_truncated", "toolCallsTruncated"]),
    toolCalls: (rawToolCalls as unknown[])
      .map((item) => {
        const entry = recordFromUnknown(item)
        if (!entry) return null
        const toolName = stringField(entry, ["tool_name", "toolName"])
        if (!toolName) return null
        return {
          toolName,
          inputPreview: stringField(entry, ["input_preview", "inputPreview"]),
          outputPreview: stringField(entry, ["output_preview", "outputPreview"]),
          isError: entry.is_error === true || (entry as any).isError === true,
        }
      })
      .filter((item): item is SubagentToolCallSummary => item !== null),
  }
}

const DEFAULT_STATS_MAX_TOOL_CALLS = 30
const DEFAULT_STATS_MAX_PREVIEW_CHARS = 400

/**
 * 落库前裁剪。`agentStats` 会跟着 `tool_call` 整体进 SQLite（`toPersistedPartPayload`
 * 存的是整个对象），一个跑了几百个工具的子智能体会把单行撑得很大。6 处归一化共用
 * 这一份，改上限只改一处。
 *
 * **保持 snake_case 输出**，因为它就是要被原样存起来的形状。
 */
export function clampSubagentStats(
  raw: unknown,
  limits?: { maxToolCalls?: number; maxPreviewChars?: number }
): Record<string, any> | null {
  const stats = recordFromUnknown(raw)
  if (!stats) return null

  const maxToolCalls = limits?.maxToolCalls ?? DEFAULT_STATS_MAX_TOOL_CALLS
  const maxPreviewChars = limits?.maxPreviewChars ?? DEFAULT_STATS_MAX_PREVIEW_CHARS
  const next: Record<string, any> = { ...stats }

  const rawToolCalls = Array.isArray(stats.tool_calls) ? stats.tool_calls : null
  if (rawToolCalls) {
    // 留尾部：越晚的工具调用越接近最终结果。
    const kept = maxToolCalls > 0 ? rawToolCalls.slice(-maxToolCalls) : []
    next.tool_calls = kept.map((item) => {
      const entry = recordFromUnknown(item)
      if (!entry) return item
      return {
        ...entry,
        input_preview: clampText(entry.input_preview, maxPreviewChars),
        output_preview: clampText(entry.output_preview, maxPreviewChars),
      }
    })
    if (rawToolCalls.length > kept.length) {
      next.tool_calls_truncated = rawToolCalls.length - kept.length
    }
  }

  return next
}

function clampText(value: unknown, max: number) {
  if (typeof value !== "string") return value
  if (max <= 0 || value.length <= max) return value
  return `${value.slice(0, max)}…`
}

// ---------------------------------------------------------------------------
// 展示
// ---------------------------------------------------------------------------

export type SubagentCapsuleState = "pending" | "running" | "completed" | "error"

export interface SubagentCapsuleView {
  title: string
  state: SubagentCapsuleState
  isRunning: boolean
  isError: boolean
  durationText: string
  hasBody: boolean
  launch: SubagentLaunch
  stats: SubagentStats | null
  transcriptTail: string
}

const DEFAULT_TRANSCRIPT_TAIL_CHARS = 4000

export function formatSubagentDuration(ms?: number | null): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return ""
  if (ms < 1000) return `${Math.round(ms)}ms`
  const totalSeconds = ms / 1000
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.round(totalSeconds - minutes * 60)
  if (seconds === 0) return `${minutes}m`
  return `${minutes}m${seconds}s`
}

export function buildSubagentCapsuleView(input: {
  toolCall: ToolCall
  transcript?: string | null
  transcriptTailChars?: number
}): SubagentCapsuleView {
  const { toolCall } = input
  const launch = parseSubagentLaunch(toolCall)
  const stats = normalizeSubagentStats(toolCall.agentStats)

  // 状态一律以 `ToolCall.status` 为准（用户看的就是这个 tool call）。
  // `agent_stats.status` 是子智能体自己的状态，可能不一致，只作 body 里的一行明细。
  const status = toolCall.status
  const state: SubagentCapsuleState =
    status === "error" ? "error" : status === "completed" ? "completed" : status === "running" ? "running" : "pending"

  const transcriptTail = clampTail(input.transcript, input.transcriptTailChars ?? DEFAULT_TRANSCRIPT_TAIL_CHARS)

  return {
    title: buildTitle(launch, stats),
    state,
    // `pending` 不转圈：附着快照里 pending 的调用会永久转圈。
    isRunning: state === "running",
    isError: state === "error",
    durationText: formatSubagentDuration(stats?.totalDurationMs),
    hasBody: Boolean(
      launch.prompt ||
        transcriptTail ||
        stats?.toolCalls.length ||
        (toolCall.output || "").trim() ||
        (toolCall.error || "").trim()
    ),
    launch,
    stats,
    transcriptTail,
  }
}

function buildTitle(launch: SubagentLaunch, stats: SubagentStats | null): string {
  const type = launch.subagentType || stats?.agentType
  // 绝不把占位文案拼在已有真实内容前面。
  if (type) return launch.description ? `${type}: ${launch.description}` : type
  return launch.description || "子智能体"
}

function clampTail(value?: string | null, max = DEFAULT_TRANSCRIPT_TAIL_CHARS) {
  const text = String(value || "")
  if (!text) return ""
  if (max <= 0 || text.length <= max) return text
  return text.slice(-max)
}

// ---------------------------------------------------------------------------
// 小工具（与 goalToolCall.ts 同形，各模块自持一份以保持纯粹）
// ---------------------------------------------------------------------------

function recordFromUnknown(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, any>
}

function stringField(obj: Record<string, any> | null, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj?.[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}

function numberField(obj: Record<string, any> | null, keys: string[]): number | null {
  for (const key of keys) {
    const value = obj?.[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
  }
  return null
}
