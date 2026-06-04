import { acpApi } from "@/api/acp"
import { connectionSessionManager } from "./connectionSessionManager"
import type { EventEnvelope } from "@/types/acp"
import { ensureConversationSchema } from "@/services/db/migrations"
import {
  getConversationSummaryById,
  upsertConversationSummary,
} from "@/services/db/repositories/conversationRepository"
import { persistConversationDetailSnapshot } from "./conversationDetailPersistence"
import {
  mapRealtimeConversationStatusToSummaryStatus,
  normalizeConversationSummaryStatus,
} from "./conversationSummaryStatus"

type ConversationEventHandler = (event: EventEnvelope) => void

interface ConversationRealtimeBinding {
  conversationId: number
  instanceKey: string
  connectionId: string
  lastAppliedSeq?: number | null
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
        onSnapshot: (_snapshot, eventSeq) => {
          const activeBinding = bindings.get(input.conversationId)
          if (activeBinding) {
            activeBinding.lastAppliedSeq = eventSeq
          }
        },
        onReplay: (events, highWaterSeq) => {
          const activeBinding = bindings.get(input.conversationId)
          if (activeBinding) {
            activeBinding.lastAppliedSeq = highWaterSeq
          }
          events.forEach((event) => routeNormalizedRealtimeEvent(input.conversationId, event))
        },
        onEvent: (event) => {
          const normalized = acpApi.normalizeRealtimeEvent(event)
          const activeBinding = bindings.get(input.conversationId)
          if (
            activeBinding &&
            normalized &&
            typeof normalized.seq === "number" &&
            Number.isFinite(normalized.seq)
          ) {
            activeBinding.lastAppliedSeq = normalized.seq
          }
          routeNormalizedRealtimeEvent(input.conversationId, event)
        },
        onDetached: (reason, detail) => {
          const activeBinding = bindings.get(input.conversationId)
          const lastAppliedSeq =
            detail.lastAppliedSeq ?? activeBinding?.lastAppliedSeq ?? input.sinceSeq ?? null
          if (activeBinding) {
            activeBinding.lastAppliedSeq = lastAppliedSeq
          }
          console.warn("[conversation-realtime] detached", {
            conversationId: input.conversationId,
            connectionId: input.connectionId,
            instanceKey: input.instanceKey,
            reason,
            lastAppliedSeq,
          })
        },
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
    lastAppliedSeq: input.sinceSeq ?? null,
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
    await updateSummaryStatus(
      binding.instanceKey,
      binding.connectionId,
      conversationId,
      event.data?.status,
      event.data?.scope
    )
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
  nextStatus: unknown,
  scope?: unknown
) {
  const current = await readCurrentSummary(instanceKey, conversationId)
  if (!current) {
    console.warn("[conversation-summary] status update skipped: missing current summary", {
      conversationId,
      connectionId,
      instanceKey,
      scope: String(scope || ""),
      rawStatus: nextStatus ?? null,
    })
    return
  }
  const normalizedStatus =
    scope === "conversation"
      ? normalizeConversationSummaryStatus(String(nextStatus || ""))
      : mapRealtimeConversationStatusToSummaryStatus(nextStatus, current.status)
  console.warn("[conversation-summary] status update", {
    conversationId,
    connectionId,
    instanceKey,
    scope: String(scope || ""),
    rawStatus: nextStatus ?? null,
    currentStatus: current.status,
    nextStatus: normalizedStatus,
    currentUpdatedAt: current.updatedAt,
  })
  await upsertConversationSummary({
    ...current,
    connectionId,
    status: normalizedStatus,
    updatedAt: Date.now(),
  })
}

async function refreshSummaryFromCalibration(conversationId: number) {
  try {
    const detail = await calibrateAfterTurnComplete(conversationId)
    console.warn("[conversation-summary] turn_complete calibration", {
      conversationId,
      detailStatus:
        detail?.status ??
        detail?.summary?.status ??
        null,
      turnCount: Array.isArray(detail?.turns) ? detail.turns.length : null,
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
