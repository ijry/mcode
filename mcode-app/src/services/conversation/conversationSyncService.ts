import { acpApi } from "@/api/acp"
import { connectionSessionManager } from "./connectionSessionManager"
import type { EventEnvelope } from "@/types/acp"
import { ensureConversationSchema } from "@/services/db/migrations"
import {
  getConversationSummaryById,
  upsertConversationSummary,
} from "@/services/db/repositories/conversationRepository"
import { persistConversationDetailSnapshot } from "./conversationDetailPersistence"

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

function routeNormalizedRealtimeEvent(conversationId: number, rawEvent: unknown) {
  const normalized = acpApi.normalizeRealtimeEvent(rawEvent)
  if (!normalized) return
  routeRealtimeEvent(conversationId, normalized)
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
          events.forEach((event) => routeNormalizedRealtimeEvent(input.conversationId, event))
        },
        onEvent: (event) => {
          routeNormalizedRealtimeEvent(input.conversationId, event)
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
  return await calibrateConversationDetailInternal(conversationId, true)
}

async function calibrateConversationDetailInternal(
  conversationId: number,
  persistTurns: boolean
) {
  const detail = await acpApi.getFolderConversation(conversationId)
  const binding = bindings.get(conversationId)
  if (binding?.instanceKey) {
    await persistConversationDetailSnapshot({
      instanceKey: binding.instanceKey,
      conversationId,
      detail,
      fallbackConnectionId: binding.connectionId,
      persistTurns,
    }).catch((error) => {
      console.warn("persist calibrated conversation detail skipped", error)
    })
  }
  return detail
}

export async function calibrateAfterTurnComplete(conversationId: number) {
  return await calibrateConversationDetailInternal(conversationId, false)
}

export async function calibrateAfterReplayGap(conversationId: number) {
  return await calibrateConversationDetailInternal(conversationId, true)
}

async function mirrorConversationSummary(conversationId: number, event: EventEnvelope) {
  const binding = bindings.get(conversationId)
  if (!binding) return

  if (event.type === "status_changed") {
    await updateSummaryStatus(binding.instanceKey, binding.connectionId, conversationId, event.data?.status)
    return
  }

  if (event.type === "turn_complete") {
    await refreshSummaryFromCalibration(conversationId)
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
  const normalizedStatus = mapRuntimeStatusToSummaryStatus(nextStatus, current.status)
  await upsertConversationSummary({
    ...current,
    connectionId,
    status: normalizedStatus,
    updatedAt: Date.now(),
  })
}

async function refreshSummaryFromCalibration(conversationId: number) {
  try {
    await calibrateAfterTurnComplete(conversationId)
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

function mapRuntimeStatusToSummaryStatus(nextStatus: unknown, currentStatus: string) {
  const status = String(nextStatus || "").trim().toLowerCase()
  if (
    status === "thinking" ||
    status === "running_tool" ||
    status === "waiting_permission" ||
    status === "connecting" ||
    status === "connected"
  ) {
    return "in_progress"
  }
  if (status === "error") {
    return "failed"
  }
  if (status === "idle") {
    return currentStatus || "pending_review"
  }
  return currentStatus || "pending_review"
}
