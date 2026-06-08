import type { ConversationSummaryRecord } from "@/services/db/repositories/conversationRepository"
import { normalizeConversationSummaryStatus } from "@/services/conversation/conversationSummaryStatus"

const RECENT_ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000

export interface ConversationOverviewConversation {
  id: number
  title?: string
  agent_type?: string
  updated_at?: string
  last_message_at?: string
  lastMessageAt?: string
  folder_id?: number
  status?: string
  external_id?: string
  externalId?: string
}

export interface ConversationOverviewProject {
  id: number
  name: string
  path: string
  conversations?: ConversationOverviewConversation[]
}

export interface ConversationOverviewOpenedTab {
  id: number
  folder_id: number
  conversation_id?: number | null
  agent_type?: string
  position?: number
  is_active?: boolean
  is_pinned?: boolean
}

export interface ConversationOverviewCard {
  tabId: number
  conversationId?: number
  folderId: number
  projectName: string
  agentType: string
  title: string
  updatedAt?: string
  status: string
  isActive: boolean
}

export interface ConnectionConversationSnapshot {
  key: string
  name: string
  mode: "direct" | "relay"
  url: string
  projects: ConversationOverviewProject[]
  openTabCards: ConversationOverviewCard[]
  recentActiveCards: ConversationOverviewCard[]
  loadError: string | null
}

interface BuildSnapshotInput {
  connectionKey: string
  connectionName: string
  mode: "direct" | "relay"
  url: string
  folders: ConversationOverviewProject[]
  tabs: ConversationOverviewOpenedTab[]
  conversations: ConversationOverviewConversation[]
  now?: number
}

export function buildConnectionConversationSnapshot(
  input: BuildSnapshotInput
): ConnectionConversationSnapshot {
  const folderMap = new Map<number, ConversationOverviewProject>()
  input.folders.forEach((folder) => {
    folderMap.set(folder.id, folder)
  })

  const conversations = input.conversations.filter((conversation) => Number(conversation.id) > 0)
  const convMap = new Map<number, ConversationOverviewConversation>()
  conversations.forEach((conversation) => {
    convMap.set(conversation.id, conversation)
  })

  const openTabCards = input.tabs
    .map((tab) => {
      const conversation = tab.conversation_id ? convMap.get(tab.conversation_id) : undefined
      const project = folderMap.get(tab.folder_id)
      return {
        tabId: tab.id,
        conversationId: tab.conversation_id || undefined,
        folderId: tab.folder_id,
        projectName: project?.name || project?.path || "未命名项目",
        agentType: normalizeAgentType(tab.agent_type || conversation?.agent_type),
        title: conversation?.title || `标签会话 #${tab.id}`,
        updatedAt:
          conversation?.updated_at ||
          firstString(conversation?.last_message_at, conversation?.lastMessageAt) ||
          undefined,
        status: normalizeConversationStatus(conversation?.status),
        isActive: Boolean(tab.is_active),
      } satisfies ConversationOverviewCard
    })
    .sort((a, b) => {
      const activeDiff = Number(b.isActive) - Number(a.isActive)
      if (activeDiff !== 0) return activeDiff
      return Number(a.tabId) - Number(b.tabId)
    })

  const openedConversationIds = new Set(
    openTabCards
      .map((card) => Number(card.conversationId || 0))
      .filter((conversationId) => conversationId > 0)
  )
  const recentActiveThreshold = getRecentActiveThreshold(input.now ?? Date.now())

  const recentActiveCards = conversations
    .filter((conversation) => {
      if (openedConversationIds.has(conversation.id)) return false
      return getConversationActivityTimestamp(conversation) >= recentActiveThreshold
    })
    .sort(
      (left, right) =>
        getConversationActivityTimestamp(right) - getConversationActivityTimestamp(left)
    )
    .map((conversation) => {
      const project = folderMap.get(Number(conversation.folder_id || 0))
      return {
        tabId: -conversation.id,
        conversationId: conversation.id,
        folderId: Number(conversation.folder_id || 0),
        projectName: project?.name || project?.path || "未命名项目",
        agentType: normalizeAgentType(conversation.agent_type),
        title: conversation.title || `会话 #${conversation.id}`,
        updatedAt:
          conversation.updated_at ||
          firstString(conversation.last_message_at, conversation.lastMessageAt) ||
          undefined,
        status: normalizeConversationStatus(conversation.status),
        isActive: false,
      } satisfies ConversationOverviewCard
    })

  const projects = input.folders.map((folder) => ({
    ...folder,
    conversations: conversations.filter((conversation) => conversation.folder_id === folder.id),
  }))

  return {
    key: input.connectionKey,
    name: input.connectionName,
    mode: input.mode,
    url: input.url,
    projects,
    openTabCards,
    recentActiveCards,
    loadError: null,
  }
}

export function mapConversationSummaryRecordToConversation(
  record: ConversationSummaryRecord
): ConversationOverviewConversation {
  return {
    id: record.id,
    title: record.title,
    agent_type: normalizeAgentType(record.agentType),
    updated_at: formatTimestamp(record.updatedAt),
    last_message_at: formatTimestamp(record.lastMessageAt),
    folder_id: record.folderId,
    status: normalizeConversationStatus(record.status),
  }
}

export function mapConversationToSummaryRecord(
  instanceKey: string,
  conversation: ConversationOverviewConversation,
  now = Date.now()
): ConversationSummaryRecord {
  const lastMessageAt =
    parseTimestamp(conversation.last_message_at, conversation.lastMessageAt, conversation.updated_at) ||
    now
  const updatedAt =
    parseTimestamp(conversation.updated_at, conversation.last_message_at, conversation.lastMessageAt) ||
    lastMessageAt

  return {
    id: conversation.id,
    instanceKey,
    folderId: Number(conversation.folder_id || 0),
    title: conversation.title || "未命名会话",
    agentType: normalizeAgentType(conversation.agent_type),
    externalId: firstString(conversation.external_id, conversation.externalId) || null,
    connectionId: null,
    status: normalizeConversationStatus(conversation.status),
    lastTurnId: null,
    lastMessageAt,
    unreadCount: 0,
    isPinned: false,
    deletedAt: null,
    updatedAt,
  }
}

export function getConversationActivityTimestamp(
  conversation: Pick<
    ConversationOverviewConversation,
    "updated_at" | "last_message_at" | "lastMessageAt"
  >
) {
  return (
    parseTimestamp(
      conversation.last_message_at,
      conversation.lastMessageAt,
      conversation.updated_at
    ) || 0
  )
}

function getRecentActiveThreshold(now: number) {
  if (!Number.isFinite(now)) return 0
  // Keep late-night activity visible after midnight instead of resetting at 00:00.
  return Math.max(0, now - RECENT_ACTIVE_WINDOW_MS)
}

function normalizeAgentType(value?: string): string {
  const raw = String(value || "").trim().toLowerCase().replace(/[\s-]/g, "_")
  if (!raw) return "claude_code"
  if (raw === "claudecode") return "claude_code"
  if (raw === "codex_cli") return "codex"
  if (raw === "gemini_cli" || raw === "google_gemini" || raw === "gemini_code") return "gemini"
  if (raw === "cline_cli") return "cline"
  if (raw === "opencode") return "open_code"
  if (raw === "open_code_cli") return "open_code"
  if (raw === "openclaw") return "open_claw"
  if (raw === "open_claw_cli") return "open_claw"
  return raw
}

function normalizeConversationStatus(value?: string): string {
  return normalizeConversationSummaryStatus(value)
}

function parseTimestamp(...values: Array<string | number | undefined>) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = new Date(value).getTime()
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }
  return 0
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

function formatTimestamp(value: number) {
  return new Date(value).toISOString()
}
