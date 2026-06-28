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
  attachMode: "stream" | "legacy"
  closed?: boolean
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

  const binding: ConversationRealtimeBinding = {
    conversationId: input.conversationId,
    instanceKey: input.instanceKey,
    connectionId: input.connectionId,
    lastAppliedSeq: input.sinceSeq ?? null,
    attachMode: "legacy",
    closed: false,
  }
  bindings.set(input.conversationId, binding)

  const reattach = () => {
    const activeBinding = bindings.get(input.conversationId)
    if (
      !activeBinding ||
      activeBinding.closed ||
      activeBinding.connectionId !== input.connectionId ||
      activeBinding.instanceKey !== input.instanceKey
    ) {
      return
    }
    const transport = acpApi.getRealtimeTransport(input.instanceKey)
    const newSubscription = transport?.attach(
      input.connectionId,
      {
        sinceSeq:
          activeBinding.lastAppliedSeq == null ? undefined : activeBinding.lastAppliedSeq,
      },
      streamHandlers
    )
    if (!newSubscription) {
      return
    }
    activeBinding.attachMode = "stream"
    activeBinding.unsubscribe = () => {
      activeBinding.closed = true
      newSubscription.detach()
    }
  }

  const streamHandlers = {
    onSnapshot: (_snapshot: unknown, eventSeq: number) => {
      const activeBinding = bindings.get(input.conversationId)
      if (activeBinding) {
        activeBinding.lastAppliedSeq = eventSeq
      }
    },
    onReplay: (events: unknown[], highWaterSeq: number) => {
      const activeBinding = bindings.get(input.conversationId)
      if (activeBinding) {
        activeBinding.lastAppliedSeq = highWaterSeq
      }
      events.forEach((event) => routeNormalizedRealtimeEvent(input.conversationId, event))
    },
    onEvent: (event: unknown) => {
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
    onDetached: (reason: string, detail: { lastAppliedSeq?: number | null }) => {
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
      if (reason === "lagged" || reason === "server_shutdown") {
        reattach()
      }
    },
  }

  let unsubscribe: (() => void) | undefined
  if (acpApi.canUseAttachTransport(input.instanceKey)) {
    const transport = acpApi.getRealtimeTransport(input.instanceKey)
    const subscription = transport?.attach(input.connectionId, { sinceSeq: input.sinceSeq }, streamHandlers)
    if (subscription) {
      binding.attachMode = "stream"
      unsubscribe = () => {
        binding.closed = true
        subscription.detach()
      }
    }
  }

  if (!unsubscribe) {
    binding.attachMode = "legacy"
    unsubscribe = acpApi.subscribeEvents(
      input.connectionId,
      (event) => routeRealtimeEvent(input.conversationId, event),
      input.instanceKey
    )
  }

  binding.unsubscribe = unsubscribe
  return binding
}

export function detachConversationRealtime(conversationId: number) {
  const binding = bindings.get(conversationId)
  if (!binding) return
  binding.closed = true
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

export async function calibrateActiveConversationsForInstance(instanceKey: string) {
  const active = Array.from(bindings.values()).filter(
    (binding) => !binding.closed && binding.instanceKey === instanceKey
  )
  await Promise.all(active.map(async (binding) => {
    try {
      await calibrateAfterReplayGap(binding.conversationId)
    } catch (error) {
      console.warn("[conversation-realtime] replay miss calibration skipped", {
        conversationId: binding.conversationId,
        instanceKey,
        error,
      })
    }
  }))
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
    await markSummaryPendingReview(binding.instanceKey, binding.connectionId, conversationId)
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

async function markSummaryPendingReview(
  instanceKey: string,
  connectionId: string,
  conversationId: number
) {
  const current = await readCurrentSummary(instanceKey, conversationId)
  if (!current) {
    console.warn("[conversation-summary] turn_complete status update skipped: missing current summary", {
      conversationId,
      connectionId,
      instanceKey,
    })
    return
  }

  await upsertConversationSummary({
    ...current,
    connectionId,
    status: normalizeConversationSummaryStatus("pending_review"),
    updatedAt: Date.now(),
  })
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
