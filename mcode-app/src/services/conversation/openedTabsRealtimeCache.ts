import type {
  OpenedTabItem,
  OpenedTabsChangedPayload,
  OpenedTabsSnapshot,
} from "@/types/acp"

interface CacheEntry extends OpenedTabsSnapshot {
  updatedAt: number
  lastOrigin: string | null
}

const snapshots = new Map<string, CacheEntry>()

export function applyOpenedTabsSnapshot(
  instanceKey: string,
  payload: OpenedTabsChangedPayload
) {
  const normalizedKey = String(instanceKey || "").trim()
  if (!normalizedKey) return null
  const current = snapshots.get(normalizedKey)
  if (
    current &&
    Number.isFinite(current.version) &&
    Number.isFinite(payload.version) &&
    payload.version < current.version
  ) {
    return current
  }
  const next: CacheEntry = {
    instanceKey: normalizedKey,
    version: Number(payload.version || 0),
    items: Array.isArray(payload.tabs) ? payload.tabs.map(cloneTab) : [],
    updatedAt: Date.now(),
    lastOrigin: normalizeString(payload.origin) || null,
  }
  snapshots.set(normalizedKey, next)
  return next
}

export function replaceOpenedTabsSnapshot(
  instanceKey: string,
  version: number,
  items: OpenedTabItem[],
  origin?: string | null
) {
  return applyOpenedTabsSnapshot(instanceKey, {
    version,
    origin: normalizeString(origin) || "server",
    tabs: Array.isArray(items) ? items : [],
  })
}

export function getOpenedTabsSnapshot(instanceKey: string): OpenedTabsSnapshot | null {
  const entry = snapshots.get(String(instanceKey || "").trim())
  if (!entry) return null
  return {
    instanceKey: entry.instanceKey,
    version: entry.version,
    items: entry.items.map(cloneTab),
  }
}

export function resetOpenedTabsSnapshotCache() {
  snapshots.clear()
}

function cloneTab(item: OpenedTabItem): OpenedTabItem {
  return {
    id: Number(item?.id || 0),
    folder_id: Number(item?.folder_id || 0),
    conversation_id:
      item?.conversation_id == null ? null : Number(item.conversation_id || 0) || null,
    agent_type: normalizeString(item?.agent_type) || undefined,
    position: typeof item?.position === "number" ? item.position : Number(item?.position || 0),
    is_active: Boolean(item?.is_active),
    is_pinned: Boolean(item?.is_pinned),
  }
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : ""
}
