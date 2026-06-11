import { ensureConversationSchema } from "@/services/db/migrations"
import {
  clearCachedConversationData,
  countCachedConversationData,
} from "@/services/db/repositories/conversationRepository"
import {
  clearCachedRuntimeData,
  countCachedRuntimeData,
} from "@/services/db/repositories/runtimeRepository"
import { useConversationCacheStore } from "@/stores/conversationCache"
import { useConversationRuntimeStore } from "@/stores/conversationRuntime"

type RuntimeSessionLike = ReturnType<typeof useConversationRuntimeStore>["sessions"] extends Map<
  number,
  infer T
>
  ? T
  : never

export interface CacheInventoryItem {
  id: string
  title: string
  description: string
  count: number
  risk: "safe"
}

export interface CacheInventory {
  items: CacheInventoryItem[]
  blockedReason: string | null
  activeConversationIds: number[]
}

const STORAGE_CACHE_KEYS = [
  "mcode_create_agent_list_cache_v1",
  "mcode_create_agent_config_cache_v1",
] as const

const STORAGE_CACHE_PREFIXES = [
  "mcode_conversation_draft_snapshot:",
] as const

export async function inspectClearableCache(): Promise<CacheInventory> {
  const runtimeStore = useConversationRuntimeStore()
  const activeConversationIds = findActiveConversationIds(runtimeStore.sessions)
  if (activeConversationIds.length > 0) {
    return {
      items: [],
      activeConversationIds,
      blockedReason: `当前有 ${activeConversationIds.length} 个会话任务正在进行，请等待任务结束后再清除缓存。`,
    }
  }

  const [conversationCounts, runtimeCounts] = await readSqliteCounts()
  const hotCacheCount = Object.keys(useConversationCacheStore().byConversationId).length
  const storageCacheCount = countStorageCacheEntries()

  return {
    activeConversationIds,
    blockedReason: null,
    items: [
      {
        id: "conversation-sqlite",
        title: "对话列表与消息本地缓存",
        description: "清除后下次进入会从当前连接重新拉取，不影响服务端数据。",
        count:
          conversationCounts.folders +
          conversationCounts.conversations +
          conversationCounts.turns +
          conversationCounts.parts,
        risk: "safe",
      },
      {
        id: "runtime-sqlite",
        title: "会话运行时恢复缓存",
        description: "清除断点恢复、同步游标和草稿持久化缓存；无进行中任务时可安全重建。",
        count: runtimeCounts.runtimes + runtimeCounts.cursors,
        risk: "safe",
      },
      {
        id: "detail-memory",
        title: "会话详情页临时状态",
        description: "清除滚动位置、已加载窗口和内存态详情缓存。",
        count: hotCacheCount,
        risk: "safe",
      },
      {
        id: "storage-cache",
        title: "创建会话与草稿短期缓存",
        description: "清除 Agent 列表、Agent 配置快照和对话草稿快照；下次使用会重新获取。",
        count: storageCacheCount,
        risk: "safe",
      },
    ],
  }
}

export async function clearInspectableCache() {
  const inventory = await inspectClearableCache()
  if (inventory.blockedReason) {
    throw new Error(inventory.blockedReason)
  }

  await ensureConversationSchema()
  await clearCachedConversationData()
  await clearCachedRuntimeData()
  useConversationCacheStore().clearAll()
  useConversationRuntimeStore().clearCachedSessionState()
  clearStorageCacheEntries()
}

function findActiveConversationIds(sessions: Map<number, RuntimeSessionLike>) {
  const ids: number[] = []
  for (const [conversationId, session] of sessions) {
    if (isActiveRuntimeSession(session)) {
      ids.push(conversationId)
    }
  }
  return ids
}

function isActiveRuntimeSession(session: RuntimeSessionLike) {
  return (
    session.status === "thinking" ||
    session.status === "running_tool" ||
    session.status === "waiting_permission" ||
    session.status === "waiting_question" ||
    session.optimisticTurns.length > 0 ||
    Boolean(session.liveMessage)
  )
}

async function readSqliteCounts() {
  try {
    await ensureConversationSchema()
    return await Promise.all([
      countCachedConversationData(),
      countCachedRuntimeData(),
    ])
  } catch (error) {
    console.warn("inspect cache sqlite counts skipped", error)
    return [
      { folders: 0, conversations: 0, turns: 0, parts: 0 },
      { runtimes: 0, cursors: 0 },
    ] as const
  }
}

function countStorageCacheEntries() {
  const keys = getStorageKeys()
  return keys.filter((key) => isClearableStorageCacheKey(key)).length
}

function clearStorageCacheEntries() {
  getStorageKeys()
    .filter((key) => isClearableStorageCacheKey(key))
    .forEach((key) => {
      try {
        uni.removeStorageSync(key)
      } catch (error) {
        console.warn(`clear cache storage key skipped: ${key}`, error)
      }
    })
}

function getStorageKeys() {
  try {
    const info = uni.getStorageInfoSync()
    return Array.isArray(info.keys) ? info.keys : []
  } catch (error) {
    console.warn("inspect cache storage keys skipped", error)
    return []
  }
}

function isClearableStorageCacheKey(key: string) {
  return (
    STORAGE_CACHE_KEYS.includes(key as (typeof STORAGE_CACHE_KEYS)[number]) ||
    STORAGE_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))
  )
}
