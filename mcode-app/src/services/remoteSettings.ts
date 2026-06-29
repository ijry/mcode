import type { CodegGateway } from "@/services/gateway"

export type AgentType =
  | "claude_code"
  | "codex"
  | "open_code"
  | "gemini"
  | "open_claw"
  | "cline"
  | "hermes"

export type ModelProviderAgentType = "claude_code" | "codex" | "gemini"

export type AgentInstallEventKind = "started" | "log" | "completed" | "failed"

export interface AcpAgentInfo {
  agent_type: AgentType
  registry_id: string
  registry_version: string | null
  name: string
  description: string
  available: boolean
  distribution_type: string
  enabled: boolean
  sort_order: number
  installed_version: string | null
  env: Record<string, string>
  config_json: string | null
  config_file_path: string | null
  opencode_auth_json: string | null
  codex_auth_json: string | null
  codex_config_toml: string | null
  cline_secrets_json: string | null
  hermes_config_yaml: string | null
  model_provider_id: number | null
}

export interface AcpAgentStatus {
  agent_type: AgentType
  available: boolean
  enabled: boolean
  installed_version: string | null
}

export interface ModelProviderInfo {
  id: number
  name: string
  api_url: string
  api_key: string
  api_key_masked: string
  agent_type: ModelProviderAgentType
  model: string | null
  created_at: string
  updated_at: string
}

export interface UpdateModelProviderResult {
  provider: ModelProviderInfo
  affectedRunningSessions: number
}

export interface AgentInstallEvent {
  task_id: string
  kind: AgentInstallEventKind
  payload: string
}

export interface AcpAgentsUpdatedEvent {
  reason: string
  agent_type?: AgentType | null
}

export interface GlobalEventFrame {
  channel: string
  payload: unknown
}

export interface AgentConfigUpdate {
  config_json?: string | null
  opencode_auth_json?: string | null
  codex_auth_json?: string | null
  codex_config_toml?: string | null
}

export interface AgentEnvUpdate {
  enabled: boolean
  env: Record<string, string>
  modelProviderId?: number | null
}

export interface CreateModelProviderPayload {
  name: string
  apiUrl: string
  apiKey: string
  agentType: ModelProviderAgentType
  model?: string | null
}

export interface UpdateModelProviderPayload {
  id: number
  name?: string | null
  apiUrl?: string | null
  apiKey?: string | null
  agentType?: ModelProviderAgentType | null
  model?: string | null
}

export type AgentTone = "success" | "error" | "warning" | "info"

export interface AgentAvailabilityPresentation {
  label: string
  tone: AgentTone
}

export interface AgentDistributionPresentation {
  label: string
  actionLabel: string
}

export interface AgentInstallProgressState {
  status: "idle" | "running" | "success" | "failed"
  progress: number
  stage: string
  latestLog: string
  logCount: number
}

export const AGENT_INSTALL_EVENT_CHANNEL = "app://agent-install"
export const ACP_AGENTS_UPDATED_EVENT_CHANNEL = "app://acp-agents-updated"

export const MODEL_PROVIDER_AGENT_TYPES: ModelProviderAgentType[] = [
  "claude_code",
  "codex",
  "gemini",
]

export const AGENT_LABELS: Record<AgentType, string> = {
  claude_code: "Claude Code",
  codex: "Codex",
  open_code: "OpenCode",
  gemini: "Gemini CLI",
  open_claw: "OpenClaw",
  cline: "Cline",
  hermes: "Hermes Agent",
}

export const AGENT_DISPLAY_ORDER: AgentType[] = [
  "codex",
  "claude_code",
  "open_code",
  "gemini",
  "open_claw",
  "cline",
  "hermes",
]

export function buildConnectionAgentsRoute(params: { connectionId: string }) {
  return `/pages/connection-agents/index?connectionId=${encodeURIComponent(params.connectionId)}`
}

export function buildModelProvidersRoute(params: { connectionId: string }) {
  return `/pages/model-providers/index?connectionId=${encodeURIComponent(params.connectionId)}`
}

export function parseEnvText(text: string): Record<string, string> {
  const env: Record<string, string> = {}
  String(text || "")
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) return
      const separatorIndex = trimmed.indexOf("=")
      if (separatorIndex <= 0) return
      const key = trimmed.slice(0, separatorIndex).trim()
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return
      env[key] = trimmed.slice(separatorIndex + 1)
    })
  return env
}

export function serializeEnvText(env: Record<string, string> | null | undefined): string {
  return Object.entries(env || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value ?? ""}`)
    .join("\n")
}

export function createAgentTaskId(prefix: string, agentType?: AgentType) {
  const suffix = Math.random().toString(36).slice(2, 10)
  return [
    "mcode",
    normalizeTaskPart(prefix),
    agentType ? normalizeTaskPart(agentType) : "",
    Date.now().toString(36),
    suffix,
  ]
    .filter(Boolean)
    .join("-")
}

export function normalizeGlobalEventFrame(raw: unknown): GlobalEventFrame | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>

  if (record.channel === "acp://event" && record.payload) {
    return normalizeGlobalEventFrame(record.payload)
  }

  const channel = typeof record.channel === "string" ? record.channel.trim() : ""
  if (!channel) return null
  return {
    channel,
    payload: "payload" in record ? record.payload : raw,
  }
}

export function normalizeAgentInstallEvent(raw: unknown): AgentInstallEvent | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  const taskId = pickString(record.task_id, record.taskId)
  const kind = pickString(record.kind)
  if (!taskId || !isAgentInstallEventKind(kind)) return null
  return {
    task_id: taskId,
    kind,
    payload: pickString(record.payload, record.message),
  }
}

export function normalizeAgentsUpdatedEvent(raw: unknown): AcpAgentsUpdatedEvent | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  return {
    reason: pickString(record.reason) || "updated",
    agent_type: isAgentType(record.agent_type) ? record.agent_type : null,
  }
}

export function buildAgentInstallProgressState(params: {
  status: AgentInstallProgressState["status"]
  logs: string[]
}): AgentInstallProgressState {
  const logs = params.logs.map((line) => String(line || "").trim()).filter(Boolean)
  const latestLog = logs[logs.length - 1] || ""

  if (params.status === "success") {
    return {
      status: params.status,
      progress: 100,
      stage: "安装完成",
      latestLog,
      logCount: logs.length,
    }
  }

  if (params.status === "failed") {
    return {
      status: params.status,
      progress: Math.max(extractProgressPercent(logs), 4),
      stage: "安装失败",
      latestLog,
      logCount: logs.length,
    }
  }

  if (params.status === "idle") {
    return {
      status: params.status,
      progress: 0,
      stage: "未开始",
      latestLog,
      logCount: logs.length,
    }
  }

  const parsedPercent = extractProgressPercent(logs)
  const fallback = Math.min(92, 8 + logs.length * 7)
  return {
    status: params.status,
    progress: Math.max(parsedPercent, fallback),
    stage: inferInstallStage(latestLog, logs.length),
    latestLog,
    logCount: logs.length,
  }
}

export function sortAgents(agents: AcpAgentInfo[]): AcpAgentInfo[] {
  return [...agents].sort(
    (a, b) => a.sort_order - b.sort_order || getAgentLabel(a.agent_type).localeCompare(getAgentLabel(b.agent_type))
  )
}

export function getAgentLabel(agentType: AgentType) {
  return AGENT_LABELS[agentType] || agentType
}

export function getAgentAvailabilityPresentation(
  agent: Pick<AcpAgentInfo, "available" | "enabled" | "installed_version">
): AgentAvailabilityPresentation {
  if (!agent.enabled) {
    return { label: "已停用", tone: "warning" }
  }
  if (!agent.available) {
    return { label: "不可用", tone: "error" }
  }
  if (agent.installed_version) {
    return { label: `可用 · ${agent.installed_version}`, tone: "success" }
  }
  return { label: "可用", tone: "success" }
}

export function getAgentDistributionPresentation(
  distributionType: string
): AgentDistributionPresentation {
  const normalized = String(distributionType || "").toLowerCase()
  if (normalized.includes("npx") || normalized.includes("npm")) {
    return { label: "NPX / npm", actionLabel: "Prepare" }
  }
  if (normalized.includes("uv")) {
    return { label: "uv tool", actionLabel: "安装 uv" }
  }
  if (normalized.includes("binary") || normalized.includes("github")) {
    return { label: "二进制", actionLabel: "下载" }
  }
  return { label: distributionType || "未知分发", actionLabel: "准备" }
}

export function getAgentToneColor(tone: AgentTone) {
  if (tone === "success") return "var(--up-success, #19be6b)"
  if (tone === "error") return "var(--up-error, #fa3534)"
  if (tone === "warning") return "var(--up-warning, #f9ae3d)"
  return "var(--up-primary, #2979ff)"
}

export function isModelProviderAgentType(value: unknown): value is ModelProviderAgentType {
  return MODEL_PROVIDER_AGENT_TYPES.includes(value as ModelProviderAgentType)
}

export async function listRemoteAgents(gateway: CodegGateway): Promise<AcpAgentInfo[]> {
  return sortAgents(await gateway.call<AcpAgentInfo[]>("acp_list_agents"))
}

export async function getRemoteAgentStatus(
  gateway: CodegGateway,
  agentType: AgentType
): Promise<AcpAgentStatus> {
  return gateway.call<AcpAgentStatus>("acp_get_agent_status", { agentType })
}

export async function updateRemoteAgentEnv(
  gateway: CodegGateway,
  agentType: AgentType,
  params: AgentEnvUpdate
): Promise<number> {
  return gateway.call<number>("acp_update_agent_env", {
    agentType,
    enabled: params.enabled,
    env: params.env,
    modelProviderId: params.modelProviderId ?? null,
  })
}

export async function updateRemoteAgentConfig(
  gateway: CodegGateway,
  agentType: AgentType,
  params: AgentConfigUpdate
): Promise<number> {
  return gateway.call<number>("acp_update_agent_config", {
    agentType,
    configJson: params.config_json ?? null,
    opencodeAuthJson: params.opencode_auth_json ?? null,
    codexAuthJson: params.codex_auth_json ?? null,
    codexConfigToml: params.codex_config_toml ?? null,
  })
}

export async function reorderRemoteAgents(
  gateway: CodegGateway,
  agentTypes: AgentType[]
): Promise<void> {
  return gateway.call<void>("acp_reorder_agents", { agentTypes })
}

export async function downloadRemoteAgentBinary(
  gateway: CodegGateway,
  agentType: AgentType,
  taskId: string,
  version?: string | null
): Promise<void> {
  return gateway.call<void>("acp_download_agent_binary", {
    agentType,
    version: version ?? null,
    taskId,
  })
}

export async function installRemoteUvTool(
  gateway: CodegGateway,
  taskId: string
): Promise<void> {
  return gateway.call<void>("acp_install_uv_tool", { taskId })
}

export async function prepareRemoteNpxAgent(
  gateway: CodegGateway,
  agentType: AgentType,
  registryVersion: string | null | undefined,
  taskId: string,
  cleanFirst = false,
  version?: string | null
): Promise<string> {
  return gateway.call<string>("acp_prepare_npx_agent", {
    agentType,
    registryVersion: registryVersion ?? null,
    version: version ?? null,
    cleanFirst,
    taskId,
  })
}

export async function uninstallRemoteAgent(
  gateway: CodegGateway,
  agentType: AgentType,
  taskId: string
): Promise<void> {
  return gateway.call<void>("acp_uninstall_agent", { agentType, taskId })
}

export async function listRemoteModelProviders(
  gateway: CodegGateway
): Promise<ModelProviderInfo[]> {
  return gateway.call<ModelProviderInfo[]>("list_model_providers")
}

export async function createRemoteModelProvider(
  gateway: CodegGateway,
  params: CreateModelProviderPayload
): Promise<ModelProviderInfo> {
  return gateway.call<ModelProviderInfo>("create_model_provider", {
    name: params.name,
    apiUrl: params.apiUrl,
    apiKey: params.apiKey,
    agentType: params.agentType,
    model: params.model ?? null,
  })
}

export async function updateRemoteModelProvider(
  gateway: CodegGateway,
  params: UpdateModelProviderPayload
): Promise<UpdateModelProviderResult> {
  return gateway.call<UpdateModelProviderResult>("update_model_provider", {
    id: params.id,
    name: params.name ?? null,
    apiUrl: params.apiUrl ?? null,
    apiKey: params.apiKey ?? null,
    agentType: params.agentType ?? null,
    model: params.model ?? null,
  })
}

export async function deleteRemoteModelProvider(
  gateway: CodegGateway,
  id: number
): Promise<void> {
  return gateway.call<void>("delete_model_provider", { id })
}

function isAgentInstallEventKind(value: string): value is AgentInstallEventKind {
  return (
    value === "started" ||
    value === "log" ||
    value === "completed" ||
    value === "failed"
  )
}

function isAgentType(value: unknown): value is AgentType {
  return (
    value === "claude_code" ||
    value === "codex" ||
    value === "open_code" ||
    value === "gemini" ||
    value === "open_claw" ||
    value === "cline" ||
    value === "hermes"
  )
}

function normalizeTaskPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

function extractProgressPercent(logs: string[]) {
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const match = logs[index].match(/(^|[^\d])(\d{1,3})(?:\.\d+)?\s*%/)
    if (!match) continue
    const value = Number(match[2])
    if (Number.isFinite(value)) {
      return clampProgress(value)
    }
  }
  return 0
}

function inferInstallStage(latestLog: string, logCount: number) {
  const normalized = latestLog.toLowerCase()
  if (!latestLog) return "等待远端响应"
  if (normalized.includes("download") || normalized.includes("fetch")) return "正在下载"
  if (normalized.includes("extract") || normalized.includes("unpack")) return "正在解压"
  if (normalized.includes("install")) return "正在安装"
  if (normalized.includes("prepare") || normalized.includes("uvx") || normalized.includes("--version")) {
    return "正在准备智能体"
  }
  if (normalized.includes("uninstall") || normalized.includes("remove")) return "正在卸载"
  return logCount <= 1 ? "任务已提交" : "执行中"
}

function clampProgress(value: number) {
  if (value < 0) return 0
  if (value > 100) return 100
  return Math.round(value)
}
