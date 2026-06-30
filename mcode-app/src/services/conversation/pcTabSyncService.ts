import type { CodegGateway } from "@/services/gateway"
import {
  getOpenedTabsSnapshot,
  replaceOpenedTabsSnapshot,
} from "@/services/conversation/openedTabsRealtimeCache"
import type { OpenedTabItem, OpenedTabsSnapshot } from "@/types/acp"

type TabActivationMode = "allow" | "preserve"

interface EnsureConversationTabInput {
  instanceKey: string
  gateway: CodegGateway
  folderId: number
  conversationId: number
  agentType?: string
  activation?: TabActivationMode
  origin?: string
}

interface SaveOpenedTabsResult {
  accepted?: boolean
  version?: number
  tabs?: OpenedTabItem[]
  items?: OpenedTabItem[]
}

const MAX_SAVE_RETRIES = 2

export async function ensureConversationTab(input: EnsureConversationTabInput) {
  const instanceKey = String(input.instanceKey || "").trim()
  const folderId = Number(input.folderId || 0)
  const conversationId = Number(input.conversationId || 0)
  if (!instanceKey || !folderId || !conversationId) {
    return null
  }

  for (let attempt = 0; attempt <= MAX_SAVE_RETRIES; attempt += 1) {
    const baseSnapshot = await readOpenedTabsSnapshot(instanceKey, input.gateway)
    const nextItems = buildNextTabs({
      currentItems: baseSnapshot.items,
      folderId,
      conversationId,
      agentType: normalizeAgentType(input.agentType),
      activation: input.activation || "preserve",
    })
    if (sameTabSnapshot(baseSnapshot.items, nextItems)) {
      return baseSnapshot
    }
    const saved = await input.gateway.call<SaveOpenedTabsResult>("save_opened_tabs", {
      expectedVersion: baseSnapshot.version,
      items: nextItems,
      origin: input.origin || "mcode-mobile",
    })
    const accepted = saved?.accepted !== false
    const savedVersion = Number(saved?.version || 0)
    const savedItems = normalizeOpenedTabsList(saved?.tabs ?? saved?.items ?? nextItems)
    if (accepted) {
      replaceOpenedTabsSnapshot(instanceKey, savedVersion || baseSnapshot.version + 1, savedItems, input.origin || "mcode-mobile")
      return {
        instanceKey,
        version: savedVersion || baseSnapshot.version + 1,
        items: savedItems,
      } satisfies OpenedTabsSnapshot
    }
  }

  return await readOpenedTabsSnapshot(instanceKey, input.gateway, true)
}

export async function ensureConversationTabForPrompt(input: EnsureConversationTabInput) {
  return await ensureConversationTab({
    ...input,
    activation: input.activation || "preserve",
  })
}

export async function closeConversationTab(input: {
  instanceKey: string
  gateway: CodegGateway
  conversationId: number
  origin?: string
}) {
  const instanceKey = String(input.instanceKey || "").trim()
  const conversationId = Number(input.conversationId || 0)
  if (!instanceKey || !conversationId) {
    return null
  }
  const baseSnapshot = await readOpenedTabsSnapshot(instanceKey, input.gateway)
  const nextItems = baseSnapshot.items
    .filter((item) => Number(item.conversation_id || 0) !== conversationId)
    .map((item, index) => ({
      ...item,
      position: index,
    }))
  const saved = await input.gateway.call<SaveOpenedTabsResult>("save_opened_tabs", {
    expectedVersion: baseSnapshot.version,
    items: nextItems,
    origin: input.origin || "mcode-mobile",
  })
  const savedVersion = Number(saved?.version || 0)
  const savedItems = normalizeOpenedTabsList(saved?.tabs ?? saved?.items ?? nextItems)
  replaceOpenedTabsSnapshot(
    instanceKey,
    savedVersion || baseSnapshot.version + 1,
    savedItems,
    input.origin || "mcode-mobile",
  )
  return {
    instanceKey,
    version: savedVersion || baseSnapshot.version + 1,
    items: savedItems,
  } satisfies OpenedTabsSnapshot
}

async function readOpenedTabsSnapshot(
  instanceKey: string,
  gateway: CodegGateway,
  forceRemote = false
): Promise<OpenedTabsSnapshot> {
  const cached = !forceRemote ? getOpenedTabsSnapshot(instanceKey) : null
  if (cached) {
    return cached
  }
  const raw = await gateway.call<unknown>("list_opened_tabs")
  const snapshot = normalizeOpenedTabsSnapshot(instanceKey, raw)
  replaceOpenedTabsSnapshot(instanceKey, snapshot.version, snapshot.items, "server")
  return snapshot
}

function buildNextTabs(input: {
  currentItems: OpenedTabItem[]
  folderId: number
  conversationId: number
  agentType: string
  activation: TabActivationMode
}) {
  const existing = input.currentItems.find(
    (item) => Number(item.conversation_id || 0) === input.conversationId
  )
  const allowActivation = input.activation === "allow"
  const items = input.currentItems.map((item, index) => ({
    ...item,
    position: typeof item.position === "number" ? item.position : index,
    is_active: allowActivation ? Number(item.conversation_id || 0) === input.conversationId : Boolean(item.is_active),
  }))
  if (existing) {
    return items.map((item) =>
      Number(item.conversation_id || 0) === input.conversationId
        ? {
            ...item,
            folder_id: input.folderId,
            agent_type: input.agentType || item.agent_type,
            is_active: allowActivation ? true : Boolean(item.is_active),
          }
        : item
    )
  }
  const nextId = resolveNextTabId(items)
  return items.concat({
    id: nextId,
    folder_id: input.folderId,
    conversation_id: input.conversationId,
    agent_type: input.agentType || "claude_code",
    position: items.length,
    is_active: allowActivation,
    is_pinned: false,
  })
}

function normalizeOpenedTabsSnapshot(instanceKey: string, raw: unknown): OpenedTabsSnapshot {
  if (Array.isArray(raw)) {
    return {
      instanceKey,
      version: 0,
      items: normalizeOpenedTabsList(raw),
    }
  }
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    instanceKey,
    version: Number(record.version || 0),
    items: normalizeOpenedTabsList(record.items),
  }
}

export function normalizeOpenedTabsList(raw: unknown): OpenedTabItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item, index) => {
      const record = item && typeof item === "object" ? (item as Record<string, unknown>) : null
      if (!record) return null
      const id = Number(record.id || index + 1)
      const folderId = Number(record.folder_id || record.folderId || 0)
      if (!id || !folderId) return null
      return {
        id,
        folder_id: folderId,
        conversation_id:
          record.conversation_id == null && record.conversationId == null
            ? null
            : Number(record.conversation_id || record.conversationId || 0) || null,
        agent_type: normalizeString(record.agent_type, record.agentType) || undefined,
        position:
          typeof record.position === "number" ? record.position : Number(record.position || index),
        is_active: Boolean(record.is_active ?? record.isActive),
        is_pinned: Boolean(record.is_pinned ?? record.isPinned),
      } satisfies OpenedTabItem
    })
    .filter((item): item is OpenedTabItem => Boolean(item))
}

export function resolveConversationTabIndex(items: OpenedTabItem[], conversationId: number) {
  return (Array.isArray(items) ? items : []).findIndex(
    (item) => Number(item.conversation_id || 0) === Number(conversationId || 0)
  )
}

function sameTabSnapshot(left: OpenedTabItem[], right: OpenedTabItem[]) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function resolveNextTabId(items: OpenedTabItem[]) {
  return items.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1
}

function normalizeAgentType(value?: string) {
  const normalized = normalizeString(value).toLowerCase().replace(/[\s-]/g, "_")
  return normalized || "claude_code"
}

function normalizeString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}
