import { acpApi } from "@/api/acp"
import { connectionSessionManager } from "./connectionSessionManager"
import type { EventEnvelope } from "@/types/acp"

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
