import type { OpenedTabItem } from "@/types/acp"
import { normalizeOpenedTabsList } from "@/services/conversation/pcTabSyncService"
import { normalizeAgentType } from "@/services/conversation/agentType"

export const MOBILE_DETAIL_TABS_STORAGE_PREFIX = "mcode_mobile_detail_tabs"

interface EnsureMobileDetailTabInput {
  instanceKey: string
  folderId: number
  conversationId: number
  agentType?: string
}

function storageKey(instanceKey: string) {
  return `${MOBILE_DETAIL_TABS_STORAGE_PREFIX}:${String(instanceKey || "").trim()}`
}

export function readMobileDetailTabs(instanceKey: string): OpenedTabItem[] {
  const key = storageKey(instanceKey)
  if (!key) return []
  const raw = uni.getStorageSync(key)
  const parsed = typeof raw === "string" ? parseJsonArray(raw) : raw
  const tabs = normalizeOpenedTabsList(parsed)
  uni.setStorageSync(key, JSON.stringify(tabs))
  return tabs
}

export function writeMobileDetailTabs(instanceKey: string, tabs: OpenedTabItem[]) {
  const key = storageKey(instanceKey)
  const normalized = normalizeOpenedTabsList(tabs).map((tab, index) => ({
    ...tab,
    position: index,
  }))
  uni.setStorageSync(key, JSON.stringify(normalized))
  return normalized
}

export function ensureMobileDetailTab(input: EnsureMobileDetailTabInput) {
  const instanceKey = String(input.instanceKey || "").trim()
  const folderId = Number(input.folderId || 0)
  const conversationId = Number(input.conversationId || 0)
  if (!instanceKey || !folderId || !conversationId) return []

  const tabs = readMobileDetailTabs(instanceKey)
  const existingIndex = tabs.findIndex(
    (tab) => Number(tab.conversation_id || 0) === conversationId
  )
  const nextTabs = tabs.map((tab, index) => ({
    ...tab,
    position: index,
    is_active: index === existingIndex,
  }))

  if (existingIndex >= 0) {
    return writeMobileDetailTabs(instanceKey, nextTabs)
  }

  return writeMobileDetailTabs(instanceKey, nextTabs.concat({
    id: resolveNextTabId(nextTabs),
    folder_id: folderId,
    conversation_id: conversationId,
    agent_type: normalizeAgentType(input.agentType),
    position: nextTabs.length,
    is_active: true,
    is_pinned: false,
  }))
}

export function activateMobileDetailTab(instanceKey: string, conversationId: number) {
  const normalizedConversationId = Number(conversationId || 0)
  const tabs = readMobileDetailTabs(instanceKey)
  if (!normalizedConversationId) return tabs
  return writeMobileDetailTabs(
    instanceKey,
    tabs.map((tab) => ({
      ...tab,
      is_active: Number(tab.conversation_id || 0) === normalizedConversationId,
    }))
  )
}

export function closeMobileDetailTab(instanceKey: string, conversationId: number) {
  const normalizedConversationId = Number(conversationId || 0)
  const tabs = readMobileDetailTabs(instanceKey)
  if (!normalizedConversationId) return tabs
  const remaining = tabs.filter(
    (tab) => Number(tab.conversation_id || 0) !== normalizedConversationId
  )
  if (remaining.length > 0 && !remaining.some((tab) => tab.is_active)) {
    remaining[Math.max(0, remaining.length - 1)] = {
      ...remaining[Math.max(0, remaining.length - 1)],
      is_active: true,
    }
  }
  return writeMobileDetailTabs(instanceKey, remaining)
}

function parseJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function resolveNextTabId(items: OpenedTabItem[]) {
  return items.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1
}

