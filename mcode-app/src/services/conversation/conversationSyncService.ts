import { acpApi } from "@/api/acp"
import { connectionSessionManager } from "./connectionSessionManager"
import type { EventEnvelope } from "@/types/acp"
import { ensureConversationSchema } from "@/services/db/migrations"
import {
  getConversationSummaryById,
  upsertConversationSummary,
} from "@/services/db/repositories/conversationRepository"

type ConversationEventHandler = (event: EventEnvelope) => void

interface ConversationRealtimeBinding {
  conversationId: number
  instanceKey: string
  connectionId: string
  unsubscribe?: () => void
}

const bindings = new Map<number, ConversationRealtimeBinding>()
const handlers = new Map<number, ConversationEventHandler>()

function routeRealtimeEvent(conversationId: number, event: EventEnvelope) {
  void mirrorConversationSummary(conversationId, event)
  const handler = handlers.get(conversationId)
  if (handler) {
    handler(event)
  }
}

export function bindConversationEventHandler(
  conversationId: number,
  handler: ConversationEventHandler
) {
  handlers.set(conversationId, handler)
}

export function unbindConversationEventHandler(conversationId: number) {
  handlers.delete(conversationId)
}

export async function attachConversationRealtime(input: {
  conversationId: number
  instanceKey: string
  connectionId: string
  sinceSeq?: number
}) {
  const current = bindings.get(input.conversationId)
  if (current?.connectionId === input.connectionId) {
    return current
  }

  if (current?.unsubscribe) {
    current.unsubscribe()
  }

  await acpApi.ensureRealtimeBridge(input.instanceKey).catch(() => {})

  let unsubscribe: (() => void) | undefined
  if (acpApi.canUseAttachTransport(input.instanceKey)) {
    const transport = acpApi.getRealtimeTransport(input.instanceKey)
    const subscription = transport?.attach(
      input.connectionId,
      { sinceSeq: input.sinceSeq },
      {
        onSnapshot: () => {},
        onReplay: (events) => {
          events.forEach((event) => routeRealtimeEvent(input.conversationId, event as EventEnvelope))
        },
        onEvent: (event) => {
          routeRealtimeEvent(input.conversationId, event as EventEnvelope)
        },
        onDetached: () => {},
      }
    )
    if (subscription) {
      unsubscribe = () => subscription.detach()
    }
  }

  if (!unsubscribe) {
    unsubscribe = acpApi.subscribeEvents(
      input.connectionId,
      (event) => routeRealtimeEvent(input.conversationId, event),
      input.instanceKey
    )
  }

  const binding: ConversationRealtimeBinding = {
    conversationId: input.conversationId,
    instanceKey: input.instanceKey,
    connectionId: input.connectionId,
    unsubscribe,
  }
  bindings.set(input.conversationId, binding)
  return binding
}

export function detachConversationRealtime(conversationId: number) {
  const binding = bindings.get(conversationId)
  if (!binding) return
  binding.unsubscribe?.()
  bindings.delete(conversationId)
}

export function getConversationRealtimeBinding(conversationId: number) {
  return bindings.get(conversationId) ?? null
}

export function getConversationIdByConnectionId(connectionId: string) {
  const managed = connectionSessionManager.getByConnectionId(connectionId)
  return managed?.conversationId ?? null
}

export async function calibrateConversationDetail(conversationId: number) {
  return await acpApi.getFolderConversation(conversationId)
}

export async function calibrateAfterTurnComplete(conversationId: number) {
  return await calibrateConversationDetail(conversationId)
}

export async function calibrateAfterReplayGap(conversationId: number) {
  return await calibrateConversationDetail(conversationId)
}

async function mirrorConversationSummary(conversationId: number, event: EventEnvelope) {
  const binding = bindings.get(conversationId)
  if (!binding) return

  if (event.type === "status_changed") {
    await updateSummaryStatus(binding.instanceKey, binding.connectionId, conversationId, event.data?.status)
    return
  }

  if (event.type === "turn_complete") {
    await refreshSummaryFromCalibration(binding.instanceKey, binding.connectionId, conversationId)
  }
}

async function updateSummaryStatus(
  instanceKey: string,
  connectionId: string,
  conversationId: number,
  nextStatus: unknown
) {
  const current = await readCurrentSummary(instanceKey, conversationId)
  if (!current) return
  await upsertConversationSummary({
    ...current,
    connectionId,
    status: String(nextStatus || current.status || "idle"),
    updatedAt: Date.now(),
  })
}

async function refreshSummaryFromCalibration(
  instanceKey: string,
  connectionId: string,
  conversationId: number
) {
  try {
    const detail = await calibrateAfterTurnComplete(conversationId)
    const rawDetail = detail as Record<string, any>
    const current = await readCurrentSummary(instanceKey, conversationId)
    if (!current) return
    const summary = rawDetail.summary && typeof rawDetail.summary === "object" ? rawDetail.summary : {}
    const updatedAt = parseTimestamp(rawDetail.updatedAt, rawDetail.updated_at, summary?.updated_at)
    await upsertConversationSummary({
      ...current,
      title: firstString(rawDetail.title, rawDetail.conversationTitle, summary?.title, current.title) || current.title,
      agentType: firstString(rawDetail.agentType, rawDetail.agent_type, summary?.agent_type, current.agentType) || current.agentType,
      externalId: firstString(rawDetail.sessionId, rawDetail.session_id, summary?.external_id, current.externalId) || current.externalId || null,
      connectionId,
      status: firstString(rawDetail.status, summary?.status, current.status) || current.status,
      lastMessageAt: updatedAt,
      updatedAt,
    })
  } catch (error) {
    console.warn("refresh conversation summary from calibration skipped", error)
  }
}

async function readCurrentSummary(instanceKey: string, conversationId: number) {
  try {
    await ensureConversationSchema()
    return await getConversationSummaryById(instanceKey, conversationId)
  } catch (error) {
    console.warn("read current summary skipped", error)
    return null
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

function parseTimestamp(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value
    }
    if (typeof value === "string" && value.trim()) {
      const timestamp = new Date(value).getTime()
      if (Number.isFinite(timestamp)) {
        return timestamp
      }
    }
  }
  return Date.now()
}
