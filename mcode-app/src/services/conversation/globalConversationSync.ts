import { acpApi } from "@/api/acp"
import { createGateway } from "@/services/gateway"
import { ensureConversationSchema } from "@/services/db/migrations"
import {
  getConversationSummaryById,
  markConversationSummaryDeleted,
  patchConversationSummaryStatus,
  upsertConversationSummary,
} from "@/services/db/repositories/conversationRepository"
import { mapConversationToSummaryRecord } from "@/services/conversation/conversationOverviewSnapshot"
import { getRegisteredRemoteInstanceDescriptor } from "@/services/realtime/remoteInstanceRegistry"
import type { RelaySessionInfo } from "@/services/gateway"
import type {
  GlobalConversationChangeEvent,
  GlobalConversationSummaryPayload,
} from "@/types/acp"

const CONVERSATION_CHANGED_CHANNEL = "conversation://changed"

const unsubscribeByInstanceKey = new Map<string, () => void>()
const overviewListeners = new Set<(instanceKey: string) => void>()

export function subscribeConversationOverviewInvalidation(
  listener: (instanceKey: string) => void
) {
  overviewListeners.add(listener)
  return () => {
    overviewListeners.delete(listener)
  }
}

export async function ensureGlobalConversationSync(instanceKey: string) {
  if (!instanceKey || unsubscribeByInstanceKey.has(instanceKey)) return

  await acpApi.ensureRealtimeBridge(instanceKey)
  const unsubscribe = acpApi.subscribeGlobalEvent(
    CONVERSATION_CHANGED_CHANNEL,
    (payload) => {
      void handleConversationChanged(instanceKey, payload)
    },
    instanceKey
  )
  unsubscribeByInstanceKey.set(instanceKey, unsubscribe)
}

function notifyOverviewInvalidated(instanceKey: string) {
  overviewListeners.forEach((listener) => {
    try {
      listener(instanceKey)
    } catch (error) {
      console.error("[conversation-sync] overview invalidation failed", error)
    }
  })
}

async function handleConversationChanged(instanceKey: string, payload: unknown) {
  const event = normalizeConversationChanged(payload)
  if (!event) return

  await ensureConversationSchema()

  if (event.kind === "upsert") {
    const summary = event.summary
    const conversationId = Number(summary.id || 0)
    if (!conversationId) return
    const current = await getConversationSummaryById(instanceKey, conversationId)
    const resolvedFolderId = await resolveConversationFolderId({
      instanceKey,
      conversationId,
      incomingFolderId: firstNumber(summary.folder_id),
      currentFolderId: current?.folderId,
    })
    await upsertConversationSummary(
      mapConversationToSummaryRecord(instanceKey, {
        id: conversationId,
        title: summary.title,
        agent_type: summary.agent_type,
        updated_at: summary.updated_at,
        last_message_at: summary.last_message_at,
        folder_id: resolvedFolderId,
        status: summary.status,
        external_id: summary.external_id || undefined,
        externalId: summary.external_id || undefined,
      })
    )
    notifyOverviewInvalidated(instanceKey)
    return
  }

  if (event.kind === "deleted") {
    const conversationId = Number(event.id || 0)
    if (!conversationId) return
    await markConversationSummaryDeleted({ instanceKey, conversationId })
    notifyOverviewInvalidated(instanceKey)
    return
  }

  const conversationId = Number(event.id || 0)
  if (!conversationId) return
  const current = await getConversationSummaryById(instanceKey, conversationId)
  if (!current) return

  await patchConversationSummaryStatus({
    instanceKey,
    conversationId,
    status: event.status,
  })
  notifyOverviewInvalidated(instanceKey)
}

async function resolveConversationFolderId(input: {
  instanceKey: string
  conversationId: number
  incomingFolderId?: number
  currentFolderId?: number
}) {
  const incomingFolderId = firstNumber(input.incomingFolderId)
  if (incomingFolderId > 0) {
    return incomingFolderId
  }

  const currentFolderId = firstNumber(input.currentFolderId)
  if (currentFolderId > 0) {
    return currentFolderId
  }

  try {
    const gateway = createGatewayForInstance(input.instanceKey)
    if (!gateway) return 0
    const detail = (await gateway.call("get_folder_conversation", {
      conversationId: input.conversationId,
    })) as Record<string, unknown> | null
    const detailSummary =
      detail?.summary && typeof detail.summary === "object"
        ? (detail.summary as Record<string, unknown>)
        : null
    const detailFolderId = firstNumber(
      detail?.folderId,
      detail?.["folder_id"],
      detailSummary?.folderId,
      detailSummary?.["folder_id"]
    )
    if (detailFolderId > 0) {
      return detailFolderId
    }
  } catch (error) {
    console.warn("[conversation-sync] resolve folder id skipped", {
      instanceKey: input.instanceKey,
      conversationId: input.conversationId,
      error,
    })
  }

  return 0
}

function createGatewayForInstance(instanceKey: string) {
  const descriptor = getRegisteredRemoteInstanceDescriptor(instanceKey)
  if (!descriptor) return null

  if (descriptor.mode === "direct") {
    return createGateway({
      mode: "direct",
      directBaseUrl: descriptor.baseUrl,
    })
  }

  const session: RelaySessionInfo = {
    accessToken: descriptor.authToken || "",
    refreshToken: descriptor.refreshToken,
    targetId: descriptor.principal,
  }
  return createGateway({
    mode: "relay",
    relayUrl: descriptor.baseUrl,
    session,
  })
}

function normalizeConversationChanged(payload: unknown): GlobalConversationChangeEvent | null {
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  const kind = typeof record.kind === "string" ? record.kind.trim() : ""
  if (kind === "upsert") {
    const summary = normalizeSummaryPayload(record.summary)
    if (!summary) return null
    return { kind, summary }
  }
  if (kind === "deleted") {
    const id = Number(record.id || 0)
    if (!Number.isFinite(id) || id <= 0) return null
    return { kind, id }
  }
  if (kind === "status") {
    const id = Number(record.id || 0)
    const status = typeof record.status === "string" ? record.status.trim() : ""
    if (!Number.isFinite(id) || id <= 0 || !status) return null
    return { kind, id, status }
  }
  return null
}

function normalizeSummaryPayload(payload: unknown): GlobalConversationSummaryPayload | null {
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  const id = Number(record.id || 0)
  if (!Number.isFinite(id) || id <= 0) return null
  return {
    id,
    folder_id: firstNumber(record.folder_id, record.folderId) || 0,
    title: firstString(record.title) || undefined,
    agent_type: firstString(record.agent_type, record.agentType) || undefined,
    external_id: firstString(record.external_id, record.externalId) || null,
    connection_id: firstString(record.connection_id, record.connectionId) || null,
    status: firstString(record.status) || undefined,
    updated_at: firstString(record.updated_at, record.updatedAt) || undefined,
    last_message_at: firstString(record.last_message_at, record.lastMessageAt) || undefined,
    deleted_at: firstString(record.deleted_at, record.deletedAt) || null,
  }
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }
  return ""
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return 0
}
