// ACP (Agent Client Protocol) 类型定义

export type PromptInputBlock =
  | { type: "text"; text: string }
  | {
      type: "image"
      data: string
      mime_type: string
      uri?: string | null
    }
  | {
      type: "resource"
      uri: string
      mime_type?: string | null
      text?: string | null
      blob?: string | null
    }
  | {
      type: "resource_link"
      uri: string
      name: string
      mime_type?: string | null
      description?: string | null
    }

export interface MessageTurn {
  id: string
  /**
   * 与服务端 `TurnRole` 对齐的三种角色（`models/message.rs` 的 `enum TurnRole`）。
   *
   * `system` 是**全部解析器共有**的第三种角色，不是 Claude 特例：上下文压缩摘要
   * （`This session is being continued from a previous conversation`，见
   * `parsers/claude.rs` 的 `is_context_continuation`）在 JSONL 里是 `type: "user"`，
   * 但解析器会把它改判成 System，因为它是注入的系统上下文而非用户输入。
   *
   * 归一化时必须显式识别它。漏掉会落到 assistant 分支，把压缩摘要当成 agent 回复
   * 渲染出来 —— 用户会看到一大段「会话被压缩」的内部说明。
   */
  role: "user" | "assistant" | "system"
  content: ContentPart[]
  timestamp: number
  status?: "pending" | "streaming" | "completed" | "error"
  error?: string
  usage?: TurnUsage | null
  /**
   * 与来源无关的稳定去重键，取值与 SQLite `conversation_turns.dedupe_key` 完全一致。
   *
   * `id` 会随来源变化：同一条逻辑轮次在 SQLite 里是 `turn:<hash>`，在服务端载荷里
   * 是解析器的 `turn-N`，实时事件里又是 ACP `message_id`。只按 `id` 去重时，本地
   * 缓存水合与远端对账会把同一条轮次当成两条，导致详情页用户/助手消息各重复一次。
   *
   * 仅由「服务端载荷」与「SQLite 行」两个来源填充 —— 二者跑的是同一个
   * `buildTurnDedupeKey`，对已完成轮次结果逐字节相同，因此可安全折叠。实时/流式
   * 轮次不填充，继续沿用 `inFlightUserTurnId` + message_id 那套权威机制，避免误合
   * 并连续发送的相同文本。
   */
  dedupeKey?: string
}

export interface ContentPart {
  type: "text" | "thinking" | "tool_call" | "tool_result" | "image" | "plan"
  text?: string
  thinking?: string
  tool_call?: ToolCall
  tool_result?: ToolResult
  image?: ImageContent
  plan?: PlanContent
}

export interface ToolCall {
  id: string
  name: string
  input: Record<string, any>
  status?: "running" | "completed" | "error"
  output?: string
  error?: string
  rawOutput?: string
  /**
   * ACP `_meta` 原样透传。`meta.claudeCode.subagent === true` 是子智能体的权威标记。
   */
  meta?: Record<string, any> | null
  /**
   * `tool_result` 上的 `agent_stats`（服务端 `AgentExecutionStats`），**保持
   * snake_case 原样** —— 字段名映射集中在 `subagentToolCall.normalizeSubagentStats`，
   * 这样 6 处归一化都只做哑透传，服务端加字段时不用逐处跟改。
   */
  agentStats?: Record<string, any> | null
}

export interface GoalRunContentPart {
  type: "goal_run"
  start: ToolCall
  end?: ToolCall | null
  items: ContentPart[]
  isRunning: boolean
}

export type GoalDisplayPart = ContentPart | GoalRunContentPart

/** 原生子智能体调用：单独渲染成默认折叠的胶囊，不并进通用工具组。 */
export interface SubagentCallContentPart {
  type: "subagent_call"
  tool_call: ToolCall
}

/** 相邻普通工具调用的合成分组。 */
export interface ToolCallGroupContentPart {
  type: "tool_call_group"
  tool_calls: ToolCall[]
}

export type BubbleDisplayPart =
  | GoalDisplayPart
  | SubagentCallContentPart
  | ToolCallGroupContentPart

export interface ToolResult {
  tool_call_id: string
  output: string
  is_error?: boolean
}

export interface ImageContent {
  url: string
  alt?: string
}

export interface PlanContent {
  steps: PlanStep[]
  status?: "pending" | "approved" | "rejected"
}

export interface PlanStep {
  description: string
  completed?: boolean
}

export interface LiveMessage {
  id?: string
  role: "assistant"
  content: ContentPart[]
  isStreaming: boolean
  timestamp: number
  isPlaceholderThinking?: boolean
}

export interface ConnectionInfo {
  id: string
  agentType: string
  sessionId: string
  status: "connecting" | "connected" | "prompting" | "disconnected" | "error"
  modes?: ModeInfo[]
  currentMode?: string
  workingDir?: string
  capabilities?: string[]
}

export interface ModeInfo {
  id: string
  name: string
  description?: string
}

export interface SessionModeInfo {
  id: string
  name: string
  description?: string | null
}

export interface SessionModeStateInfo {
  current_mode_id: string
  available_modes: SessionModeInfo[]
}

export interface SessionConfigOptionValueInfo {
  value: string
  name: string
  description?: string | null
}

export interface SessionConfigOptionGroupInfo {
  group: string
  name: string
  options: SessionConfigOptionValueInfo[]
}

export interface SessionConfigOptionKindInfo {
  type: "select"
  current_value: string
  options: SessionConfigOptionValueInfo[]
  groups: SessionConfigOptionGroupInfo[]
}

export interface SessionConfigOptionInfo {
  id: string
  name: string
  description?: string | null
  category?: string | null
  kind: SessionConfigOptionKindInfo
}

export interface AgentOptionsSnapshot {
  modes: SessionModeStateInfo | null
  config_options: SessionConfigOptionInfo[]
}

export interface AcpAgentInfo {
  agent_type: string
  name: string
  description?: string | null
  available?: boolean
  enabled?: boolean
  sort_order?: number | null
}

export interface EventEnvelope {
  type:
    | "stream_batch"
    | "tool_call"
    | "tool_call_update"
    | "status_changed"
    | "user_message"
    | "turn_complete"
    | "turn_cancel_requested"
    | "turn_cancelled"
    | "turn_cancel_failed"
    | "turn_queued"
    | "turn_queue_updated"
    | "turn_queue_reordered"
    | "turn_queue_priority_changed"
    | "turn_dequeued"
    | "turn_started"
    | "turn_queue_cancelled"
    | "turn_queue_failed"
    | "usage_update"
    | "permission_request"
    | "permission_resolved"
    | "question_request"
    | "question_resolved"
    | "api_retry"
    | "session_failure"
    /**
     * 本轮补充意见便签的提交 / 被读取（见 `FeedbackNote`）。
     *
     * 线上载荷是**平铺**的（服务端 `EventEnvelope` 用 `#[serde(flatten)]`：
     * `{seq, connection_id, type, item}` / `{..., ids, delivered_at}`），所以
     * `normalizeAcpEventRecord` 里**必须**有显式 case —— `normalizeEventEnvelope` 的兜底
     * 透传要求 `"data" in record`，这两个事件永远不满足。
     */
    | "feedback_submitted"
    | "feedback_consumed"
    | "error"
  connectionId: string
  seq?: number
  data: any
}

export interface GlobalConversationSummaryPayload {
  id: number
  folder_id?: number
  title?: string
  agent_type?: string
  external_id?: string | null
  connection_id?: string | null
  status?: string
  updated_at?: string
  last_message_at?: string
  deleted_at?: string | null
}

export type GlobalConversationChangeEvent =
  | { kind: "upsert"; summary: GlobalConversationSummaryPayload }
  | { kind: "deleted"; id: number }
  | { kind: "status"; id: number; status: string }

export interface OpenedTabItem {
  id: number
  folder_id: number
  conversation_id?: number | null
  agent_type?: string
  position?: number
  is_active?: boolean
  is_pinned?: boolean
}

export interface OpenedTabsSnapshot {
  instanceKey: string
  version: number
  items: OpenedTabItem[]
}

export interface OpenedTabsChangedPayload {
  version: number
  origin: string
  tabs: OpenedTabItem[]
}

export interface ConversationConnectionInfo {
  connection_id: string
  event_seq: number
}

export interface StreamBatchEvent {
  delta: string
  contentType: "text" | "thinking" | "plan"
  /**
   * `_meta.claudeCode.parentToolUseId`：这段内容属于某个子智能体 tool call，而不是
   * 主线程。有值时必须路由进那个胶囊自己的实时缓冲，**不能**追加进父气泡 ——
   * 否则子智能体的整段会话会把父气泡撑到极长（这正是本次要修的现象）。
   * 无该能力的 agent 完全不会带这个字段。
   */
  parentToolUseId?: string
}

export interface ToolCallEvent {
  id: string
  name: string
  input: Record<string, any>
  status?: "running" | "completed" | "error"
  output?: string
  error?: string
  rawOutput?: string
  /** ACP `_meta`，`meta.claudeCode.subagent === true` 是子智能体的权威标记。 */
  meta?: Record<string, any> | null
}

export interface ToolCallUpdateEvent {
  id: string
  output?: string
  error?: string
  status?: "running" | "completed" | "error"
  meta?: Record<string, any> | null
}

export interface StatusChangedEvent {
  status: "idle" | "connecting" | "connected" | "thinking" | "running_tool" | "waiting_permission" | "waiting_question" | "error"
  message?: string
  scope?: "connection" | "conversation"
}

export interface TurnCompleteEvent {
  conversationId: number
  turnId: string
  timestamp: number
}

export interface TurnCancelRequestedEvent {
  sessionId?: string | null
  activeTurnId?: string | null
  activeTurnOwnerClientId?: string | null
  cancelRequestedByClientId?: string | null
  cancelRequestedAtMs?: number | null
  reason?: string | null
}

export interface TurnCancelledEvent {
  sessionId?: string | null
  activeTurnId?: string | null
  cancelRequestedByClientId?: string | null
  status?: string | null
}

export interface TurnCancelFailedEvent {
  sessionId?: string | null
  activeTurnId?: string | null
  cancelRequestedByClientId?: string | null
  message?: string | null
}

export interface TurnQueueEvent {
  sessionId?: string | null
  queueItemId?: string | null
  queuePosition?: number | null
  queueLength?: number | null
  priorityTier?: string | null
  sourceClientId?: string | null
  sourceDeviceName?: string | null
  promptPreview?: string | null
  createdAtMs?: number | null
  activeTurnId?: string | null
  message?: string | null
  runtime?: string | null
  agentType?: string | null
  queueSnapshot?: TurnQueueEvent[] | null
}

export interface UsageUpdateEvent {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface ApiRetryEvent {
  sessionId?: string
  attempt?: number | null
  maxRetries?: number | null
  error?: string
  errorStatus?: number | null
  retryDelayMs?: number | null
}

export interface RealtimeBridgeHealth {
  instanceKey: string
  state: "idle" | "connected" | "reconnecting" | "error" | "polling"
  reason?: "close" | "error"
  reconnectAttempt: number
  nextRetryDelayMs?: number | null
  updatedAt: number
  recoveryIssue?: "replay_miss" | null
  lastRelayEventId?: number | null
  replayWindowStart?: number | null
  requestedLastEventId?: number | null
  recoveryMessage?: string | null
}

/**
 * 一条 JetBrains AIR 结构化会话失败记录。
 *
 * 来自 `session_info_update._meta.jetbrains.air.sessionFailure`
 * （claude-agent-acp 0.67+ / codex-acp 1.2+），codeg 在 `build_client_capabilities`
 * 里声明了 `clientCapabilities._meta.jetbrains.air` 才会收到。
 *
 * **它替代了 codex 的老失败通道**：声明 AIR 之后 `_meta.codex.error` → `TurnRetrying`
 * 与 warning 文本块都不再发，`severity: "warning"` 的记录接过了重试横幅这个角色
 * （`codeg-plus/src-tauri/src/acp/types.rs:330-338`）。Claude 侧 AIR 只承载**终止性**
 * 失败，它的重试仍走 `_claude/sdkMessage` 旁路 —— 那条不进快照。
 *
 * 三条契约必须照做，漏一条就会出现重复行或幽灵记录：
 *
 * 1. **线上只有 upsert**，没有 resolve、没有墓碑。同一条记录靠 `id` + `revision`
 *    （每个 id 从 1 开始）原地修订。
 * 2. **合并必须单调**：`revision <= 已存的` 一律丢弃。适配器会在 `session/load` 时
 *    重播仍然活跃的失败，不丢就会把状态抖回旧值。
 * 3. **`resolved` 是客户端推断的**，永远不在线上。`warning` 记录在下一次成功的回合
 *    结束时翻成已解决；`error` 记录**故意保持活跃**（codex 靠它防止迟到的重复通知
 *    追加出重复行）。
 *
 * `category` / `severity` / `actions` 保持纯字符串：服务端刻意留了扩展空间，将来加了
 * 新取值时应当退化成兜底渲染，而不是解析失败。
 */
export interface SessionFailureRecord {
  id: string
  revision: number
  /** `connection|access|limit|request|service|unknown`，将来可能更多。 */
  category: string
  /** `"warning"`（瞬态、会自愈）或 `"error"`（终止性）。 */
  severity: string
  /**
   * 适配器写的用户可读文案（claude 直接转发模型自己的话，codex 限长 240 字符）。
   * **可能是空的** —— 那时要退回 category 的本地化标签。
   */
  title: string
  details?: string
  /** 建议的恢复动作，目前是 `retry|login|new_session` 的子集。 */
  actions: string[]
  /** 客户端推断的生命周期，不在线上。见类型说明第 3 条。 */
  resolved: boolean
}

/**
 * 一条「本轮补充意见」便签（服务端 `acp/feedback.rs` 的 `FeedbackItem`）。
 *
 * **它是轮次级的瞬态 steering，不是历史。** 服务端刻意不持久化
 * （`feedback.rs:6`：「are real-time steering, not durable history, so they are
 * intentionally NOT persisted」），并在下一轮的 `UserMessage` 事件里整表清空。
 * mcode 跟着这个契约走：不进时间线、不进 SQLite、不参与轮次去重。
 *
 * 两态的含义要看**通道**，这是最容易接错线的地方：
 *
 * | 通道 | 出生状态 | 谁把它翻成 delivered |
 * | --- | --- | --- |
 * | native `_session/steering`（mcode 走这条） | **`delivered`**（`new_delivered`，`feedback.rs:76`） | 没有人 —— 出生即已送达 |
 * | pull `check_user_feedback` | `pending`（`new_pending`） | agent 主动调工具时的 `FeedbackConsumed` |
 *
 * 所以 **mcode 自己插入的便签永远不会收到 `feedback_consumed`**。native 便签必须
 * 从出生就是 `delivered`，否则 `read_pending_feedback`（只返回 `Pending`，
 * `manager.rs:2585`）会把同一段文本再喂给 agent 一遍 —— 那个「只读 Pending」正是
 * 推/拉两条通道之间的互斥。
 *
 * 那还接 `feedback_consumed` 做什么：**别人的便签**。桌面端在同一会话里走 pull 通道
 * 发的便签会广播过来，它才有「等待读取 → 已读取」这两帧。
 */
export interface FeedbackNote {
  id: string
  text: string
  /** 毫秒时间戳（线上是 ISO 串）。 */
  createdAt: number
  status: "pending" | "delivered"
  /** agent 读到它的时刻；`pending` 时为 null。 */
  deliveredAt: number | null
}

export interface RuntimeErrorEvent {
  message: string
  code?: string
  agentType?: string
  /**
   * 诊断证据：agent 的 stderr 尾巴 + codeg 解析失败的 update 摘要。
   *
   * 只有 codeg **推断**出来的错误才带它（`turn_failed_empty*` 那一族 —— agent 报告成功
   * 但线上根本没有错误信息）。服务端在源头就已脱敏并限长
   * （`codeg-plus/src-tauri/src/acp/stderr_tail.rs`），注释明确说它会被渲染到 UI 并在
   * server 模式下推过 WebSocket，所以可以直接显示。
   *
   * 可能很长（stderr 尾巴），UI 必须默认折叠。
   */
  details?: string
}

export interface PermissionRequest {
  id: string
  type: "command" | "file_change" | "network" | "plan"
  description: string
  details: any
  options: PermissionOption[]
}

export interface PermissionResolvedEvent {
  requestId: string
  responderClientId?: string | null
}

export interface QuestionResolvedEvent {
  questionId: string
  responderClientId?: string | null
}

export interface PermissionOption {
  id: string
  label: string
  description?: string
}

export interface QuestionOption {
  label: string
  description: string
}

export interface QuestionSpec {
  id: string
  question: string
  header: string
  multi_select: boolean
  options: QuestionOption[]
}

export interface PendingQuestionState {
  question_id: string
  questions: QuestionSpec[]
  created_at: string
}

export interface QuestionAnswerItem {
  questionId: string
  labels: string[]
}

export interface QuestionAnswer {
  answers: QuestionAnswerItem[]
  declined: boolean
}

export interface UploadAttachmentResult {
  path: string
  name: string
  size: number
  url?: string
}

export interface ConversationHistoryWindow {
  turns_offset: number
  turns_total: number
  assistant_turns_before_offset: number
  prefix_hash: string
  uncovered_prefix_max_ts?: number | null
}

export interface ConversationTurnsPage extends ConversationHistoryWindow {
  turns: MessageTurn[]
  prefix_hash_before_index: string
}

export interface ConversationDetail {
  id: number
  folderId: number
  title: string
  agentType: string
  sessionId?: string
  createdAt: number
  updatedAt: number
  turns: MessageTurn[]
  in_flight_user_turn_id?: string | null
  inFlightUserTurnId?: string | null
  sessionStats?: ConversationSessionStats | null
  session_stats?: ConversationSessionStats | null
}

export interface TurnUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

export interface ConversationSessionStats {
  total_usage?: TurnUsage | null
  total_tokens?: number | null
  context_window_used_tokens?: number | null
  context_window_max_tokens?: number | null
  context_window_usage_percent?: number | null
}

export interface SessionStats {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  turnCount: number
}
