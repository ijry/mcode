import { acpApi } from "@/api/acp"
import {
  buildConnectionKey,
  readStoredConnections,
  resolveConnectionContext,
} from "@/services/connectionContext"
import {
  applyConversationTabBarBadge,
  fetchOngoingActiveSessionCount,
  getOngoingActiveSessionCount,
} from "@/services/conversation/tabbarActiveSessions"

/**
 * 底部 tab「会话」角标的**自治**维护者。
 *
 * 为什么必须是自治的：这套逻辑原先整体活在 `pages/conversations/index.vue` 里 ——
 * 拉取 (`refreshActiveSessionTabBadge`)、订阅 (`ensureActiveSessionsSubscription`)、
 * 设值全都挂在那个页面的 `onShow` / `onUnload` 上。而 App 冷启动落在 tabBar 第 0 项
 * 「连接」页，**会话页从未挂载**，于是订阅从未建立、角标从来不显示，直到用户手动切一次
 * 会话页才第一次出现；`onUnload` 又会把订阅全部拆掉。
 *
 * 角标恰恰是「用户**不在**会话页时」才有意义的东西，所以它的生命周期不能绑在那个页面上。
 * 这个模块由 `App.vue` 的 `onLaunch` / `onShow` 驱动，与任何页面无关。
 *
 * 与页面侧的关系：页面**不再**自己订阅或清理，只在需要时调 `refreshConversationTabBadge()`
 * 触发一次立即重算（例如下拉刷新、新建会话后）。计数的权威副本在本模块的 `countByInstance` 里。
 */

const countByInstance = new Map<string, number>()
const disposeByInstance = new Map<string, () => void>()
const lastBridgeStateByInstance = new Map<string, string>()

let refreshPromise: Promise<void> | null = null
let started = false

function sumCounts() {
  let total = 0
  countByInstance.forEach((count) => {
    total += Math.max(0, Number(count) || 0)
  })
  return total
}

async function pushBadge() {
  await applyConversationTabBarBadge(sumCounts())
}

function readConnectedMap(): Record<string, boolean> {
  const raw = uni.getStorageSync("mcode_connected_map")
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  return raw as Record<string, boolean>
}

function getConnectedConnections() {
  const connectedMap = readConnectedMap()
  return readStoredConnections().filter((conn) =>
    Boolean(connectedMap[buildConnectionKey(conn)])
  )
}

/**
 * 订阅 `pet://sessions` 推送，保持角标实时。
 *
 * 这里**没有**「页面可见」门禁 —— 页面侧那份原本也没有（门禁只管要不要顺带刷新列表），
 * 但订阅本身活在页面生命周期里就等于有了隐式门禁。搬到这里之后它才真正常驻。
 *
 * 同时订阅桥接健康：断线期间 `pet://sessions` 与其它事件一样被直接丢弃（服务端无订阅者
 * 时不入队、帧上没有 event id），所以重连后必须重新拉一次真实计数，否则角标会一直停在
 * 断线前的旧值。判据与会话列表那条共用同一套语义（挡掉首连的合成 `idle`）。
 */
function ensureInstanceSubscriptions(instanceKey: string) {
  if (!instanceKey || disposeByInstance.has(instanceKey)) return

  const disposeSessions = acpApi.subscribeGlobalEvent(
    "pet://sessions",
    (payload) => {
      countByInstance.set(instanceKey, getOngoingActiveSessionCount(payload))
      void pushBadge()
    },
    instanceKey
  )

  const disposeHealth = acpApi.subscribeRealtimeBridgeHealth((health) => {
    const previousState = lastBridgeStateByInstance.get(instanceKey) || ""
    lastBridgeStateByInstance.set(instanceKey, health.state)
    if (
      health.state === "connected" &&
      previousState &&
      previousState !== "connected" &&
      previousState !== "idle"
    ) {
      void refreshConversationTabBadge()
    }
  }, instanceKey)

  disposeByInstance.set(instanceKey, () => {
    disposeSessions()
    disposeHealth()
  })
}

async function refreshInternal() {
  const conns = getConnectedConnections()
  if (conns.length === 0) {
    countByInstance.clear()
    await pushBadge()
    return
  }

  const results = await Promise.allSettled(
    conns.map(async (conn) => {
      const resolved = await resolveConnectionContext(conn)
      const instanceKey = resolved.gateway.getRemoteInstanceDescriptor().instanceKey
      ensureInstanceSubscriptions(instanceKey)
      return {
        instanceKey,
        count: await fetchOngoingActiveSessionCount(resolved.gateway),
      }
    })
  )

  // 只覆盖成功拿到的实例，失败的保留上一次的值 —— 一次网络抖动不该让角标归零。
  results.forEach((result) => {
    if (result.status === "fulfilled") {
      countByInstance.set(result.value.instanceKey, result.value.count)
      return
    }
    console.warn("[tabbar-badge] refresh skipped", result.reason)
  })
  await pushBadge()
}

/**
 * 重算一次角标。并发调用会共享同一次在飞的请求。
 */
export async function refreshConversationTabBadge() {
  if (refreshPromise) return await refreshPromise
  refreshPromise = refreshInternal()
  try {
    await refreshPromise
  } catch (error) {
    console.warn("[tabbar-badge] refresh failed", error)
  } finally {
    refreshPromise = null
  }
}

/**
 * 由 `App.vue` 的 `onLaunch` 调用一次。幂等 —— `onShow` 走
 * `refreshConversationTabBadge()` 即可，不要重复 start。
 */
export function startConversationTabBadgeService() {
  if (started) return
  started = true
  void refreshConversationTabBadge()
}

/** 供测试重置模块级状态。 */
export function __resetConversationTabBadgeServiceForTest() {
  disposeByInstance.forEach((dispose) => dispose())
  disposeByInstance.clear()
  countByInstance.clear()
  lastBridgeStateByInstance.clear()
  refreshPromise = null
  started = false
}
