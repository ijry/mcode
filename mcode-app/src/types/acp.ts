// ACP (Agent Client Protocol) 类型定义

export interface PromptInputBlock {
  type: "text" | "image" | "resource"
  text?: string
  source?: {
    type: "base64" | "url"
    media_type?: string
    data?: string
    url?: string
  }
  resource?: {
    type: "file" | "url"
    uri: string
    name?: string
    size?: number
  }
}

export interface MessageTurn {
  id: string
  role: "user" | "assistant"
  content: ContentPart[]
  timestamp: number
  status?: "pending" | "streaming" | "completed" | "error"
  error?: string
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
}

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
    | "turn_complete"
    | "usage_update"
    | "permission_request"
    | "permission_resolved"
    | "api_retry"
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

export interface ConversationConnectionInfo {
  connection_id: string
  event_seq: number
}

export interface StreamBatchEvent {
  delta: string
  contentType: "text" | "thinking" | "plan"
}

export interface ToolCallEvent {
  id: string
  name: string
  input: Record<string, any>
}

export interface ToolCallUpdateEvent {
  id: string
  output?: string
  error?: string
  status?: "running" | "completed" | "error"
}

export interface StatusChangedEvent {
  status: "idle" | "connecting" | "connected" | "thinking" | "running_tool" | "waiting_permission" | "error"
  message?: string
  scope?: "connection" | "conversation"
}

export interface TurnCompleteEvent {
  conversationId: number
  turnId: string
  timestamp: number
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

export interface RuntimeErrorEvent {
  message: string
  code?: string
  agentType?: string
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
}

export interface PermissionOption {
  id: string
  label: string
  description?: string
}

export interface UploadAttachmentResult {
  path: string
  name: string
  size: number
  url?: string
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
}

export interface SessionStats {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  turnCount: number
}
