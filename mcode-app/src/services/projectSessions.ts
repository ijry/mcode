import type { CodegGateway } from "@/services/gateway"
import {
  isActiveConversationSummaryStatus,
  normalizeConversationSummaryStatus,
} from "@/services/conversation/conversationSummaryStatus"
import {
  listConversationSummaries,
  type ConversationSummaryRecord,
} from "@/services/db/repositories/conversationRepository"

export interface RemoteProjectRecord {
  id: number
  name: string
  path: string
}

export interface RemoteConversationRecord {
  id: number
  title: string
  folderId: number
  agentType: string
  status: string
  updatedAt: string
  externalId?: string | null
}

export interface ProjectListItem extends RemoteProjectRecord {
  totalSessions: number
  activeSessions: number
}

export async function loadRemoteProjects(gateway: CodegGateway): Promise<RemoteProjectRecord[]> {
  const raw = await gateway.call<unknown>("list_open_folder_details")
  return normalizeList(raw)
    .map(normalizeProjectRecord)
    .filter((item): item is RemoteProjectRecord => Boolean(item))
}

export async function buildProjectListItems(
  instanceKey: string,
  projects: RemoteProjectRecord[]
): Promise<ProjectListItem[]> {
  const summaryBuckets = await Promise.all(
    projects.map(async (project) => ({
      projectId: project.id,
      rows: await safeListConversationSummaries(instanceKey, project.id),
    }))
  )
  const summaryMap = new Map<number, ConversationSummaryRecord[]>()
  summaryBuckets.forEach((bucket) => {
    summaryMap.set(bucket.projectId, bucket.rows)
  })

  return projects.map((project) => {
    const rows = summaryMap.get(project.id) || []
    const activeSessions = rows.filter((row) => {
      const status = normalizeConversationSummaryStatus(row.status)
      return isActiveConversationSummaryStatus(status) || status === "pending_review"
    }).length

    return {
      ...project,
      totalSessions: rows.length,
      activeSessions,
    }
  })
}

export async function loadRemoteProjectConversations(
  gateway: CodegGateway,
  folderId: number
): Promise<RemoteConversationRecord[]> {
  const raw = await gateway.call<unknown>("list_all_conversations", {
    folderIds: [folderId],
  })
  return normalizeList(raw)
    .map(normalizeConversationRecord)
    .filter((item): item is RemoteConversationRecord => Boolean(item))
    // 服务端默认已经是 `updated_at DESC`（codeg-plus `conversation_service::list_all`
    // 的 `_ => order_by_desc(UpdatedAt)`），所以这行**看起来**冗余 —— 但它不是：
    // `parseTimestamp` 还负责统一「远端历史上出现过数值 epoch 与 ISO 串混用」的口径，
    // 而且它让本函数的返回顺序成为自身契约，不随服务端默认排序的改动而漂移。
    .sort((left, right) => parseTimestamp(right.updatedAt) - parseTimestamp(left.updatedAt))
}

function normalizeProjectRecord(input: unknown): RemoteProjectRecord | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  const id = Number(raw.id || 0)
  if (!Number.isFinite(id) || id <= 0) return null

  const path = pickString(raw.path)
  return {
    id,
    name: pickString(raw.name) || path || `项目 #${id}`,
    path,
  }
}

function normalizeConversationRecord(input: unknown): RemoteConversationRecord | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  const id = Number(raw.id || 0)
  if (!Number.isFinite(id) || id <= 0) return null

  const folderId = Number(raw.folder_id || raw.folderId || 0)
  const updatedAt = pickString(raw.updated_at, raw.last_message_at, raw.lastMessageAt)

  return {
    id,
    title: pickString(raw.title) || `会话 #${id}`,
    folderId: Number.isFinite(folderId) && folderId > 0 ? folderId : 0,
    agentType: pickString(raw.agent_type, raw.agentType) || "claude_code",
    status: normalizeConversationSummaryStatus(pickString(raw.status) || "unknown"),
    updatedAt: updatedAt || new Date(0).toISOString(),
    externalId: pickString(raw.external_id, raw.externalId) || null,
  }
}

async function safeListConversationSummaries(instanceKey: string, folderId: number) {
  try {
    return await listConversationSummaries(instanceKey, folderId)
  } catch {
    return []
  }
}

function normalizeList(input: unknown): any[] {
  if (Array.isArray(input)) return input
  if (input && typeof input === "object" && Array.isArray((input as any).data)) {
    return (input as any).data
  }
  return []
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

function parseTimestamp(value?: string) {
  const next = value ? new Date(value).getTime() : 0
  return Number.isFinite(next) ? next : 0
}
