/**
 * 「待回复」状态的 App 级存储。
 *
 * 权威源是服务端 `pet://sessions` 推送（现在的 `blocked_on` 字段，兼容旧版只看 `pending`）。
 * 这层是为了让会话列表**读**成本接近零 —— 列表每张卡 `displayStatus` 计算时不必逐个 join
 * runtime（runtime 里只有前 5 张实时预览卡），直接按 `(instanceKey, conversationId)` 取即可。
 *
 * 由 `conversationTabBadgeService` 的推送/拉取处理器 ingest，保证即使列表页未挂载，状态也
 * 保持热的（那个服务已经是 `App.vue` 驱动的常驻服务，订阅全生命周期都活着）。
 *
 * ## 为什么不存 runtime
 *
 * `RuntimeSession.status` 已有 `waiting_permission` / `waiting_question`（由事件翻转），
 * 但它只覆盖**被订阅的会话**（详情页打开的、列表实时预览前 5 张），且页面可见时才订阅。
 * pet 列表是**全实例、全会话**的活跃快照，比 runtime 的覆盖面广得多。
 *
 * ## 新旧服务端兼容
 *
 * 旧版服务端没有 `blocked_on`，只有 `pending`（只认 permission），那种情况下
 * `waiting_permission` 能拿到、但 `waiting_question` 永远拿不到。归一化时兼容：
 * - `blocked_on.kind === "permission"` → `waiting_permission`
 * - `blocked_on.kind === "question"` → `waiting_question`
 * - `blocked_on.kind === "plan_approval"` → `waiting_plan_approval`
 * - 无 `blocked_on` 但有 `pending` → `waiting_permission`（旧服务端回落）
 * - 都没有 → `null`
 */

export type AwaitingKind =
  | "waiting_permission"
  | "waiting_question"
  | "waiting_plan_approval"

export interface AwaitingReplyEntry {
  kind: AwaitingKind
  requestId: string
  title?: string
}

/**
 * 每个实例的待回复 Map。外层键是 instanceKey，内层键是 conversationId。
 */
const awaitingByInstance = new Map<string, Map<number, AwaitingReplyEntry>>()

/**
 * 响应式版本号，每次 ingest 后 +1。Vue computed 依赖它来触发重算。
 *
 * 为什么用版本号而不是 reactive(Map)：Map 在 Vue 3 里改 key 不触发依赖（只有整个
 * Map 替换才触发）。版本号是最简单可靠的「有变化就通知」手段。
 */
let version = 0

export function getAwaitingReplyStoreVersion(): number {
  return version
}

/**
 * 归一化一条 pet session 行的 blocked 状态。
 *
 * 优先读 `blocked_on`（新服务端），回落 `pending`（旧服务端只认 permission）。
 */
function normalizeAwaitingEntry(session: Record<string, unknown>): AwaitingReplyEntry | null {
  const blockedOn = session.blockedOn || session.blocked_on
  if (blockedOn && typeof blockedOn === "object") {
    const kind = String((blockedOn as Record<string, unknown>).kind || "").toLowerCase()
    const requestId = String((blockedOn as Record<string, unknown>).requestId || (blockedOn as Record<string, unknown>).request_id || "")
    const title = (blockedOn as Record<string, unknown>).title as string | undefined
    if (kind && requestId) {
      if (kind === "permission") {
        return { kind: "waiting_permission", requestId, title }
      }
      if (kind === "question") {
        return { kind: "waiting_question", requestId, title }
      }
      if (kind === "plan_approval" || kind === "planapproval") {
        return { kind: "waiting_plan_approval", requestId, title }
      }
    }
  }

  // 旧服务端回落：只有 `pending` 字段（permission 专属）
  const pending = session.pending
  if (pending && typeof pending === "object") {
    const requestId = String((pending as Record<string, unknown>).requestId || (pending as Record<string, unknown>).request_id || "")
    if (requestId) {
      return { kind: "waiting_permission", requestId, title: undefined }
    }
  }

  return null
}

/**
 * 从 `pet://sessions` 载荷里提取这个实例的待回复 Map。
 *
 * `instanceKey` 必须来自 `gateway.getRemoteInstanceDescriptor().instanceKey`
 * （`conversationTabBadgeService` 那边已经拿到了，直接传）。
 */
export function ingestPetSessionsPayload(instanceKey: string, payload: unknown) {
  if (!instanceKey) return

  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {}
  const sessions = Array.isArray(record.sessions) ? record.sessions : []

  const map = new Map<number, AwaitingReplyEntry>()
  for (const session of sessions) {
    if (!session || typeof session !== "object") continue
    const conversationId = Number((session as Record<string, unknown>).conversationId || (session as Record<string, unknown>).conversation_id || 0)
    if (!Number.isFinite(conversationId) || conversationId <= 0) continue

    const entry = normalizeAwaitingEntry(session as Record<string, unknown>)
    if (entry) {
      map.set(conversationId, entry)
    }
  }

  awaitingByInstance.set(instanceKey, map)
  version += 1
}

/**
 * 查询某个会话的待回复状态。
 *
 * 返回 `null` 表示不在等待。**不区分「没等待」与「实例/会话不存在」** ——
 * 调用方只需要知道"这张卡该不该显示待回复 chip"。
 */
export function getAwaitingReply(
  instanceKey: string,
  conversationId: number
): AwaitingReplyEntry | null {
  const map = awaitingByInstance.get(instanceKey)
  if (!map) return null
  return map.get(conversationId) || null
}

/**
 * 清空某个实例的全部待回复状态（断线/切换连接时调用）。
 */
export function clearAwaitingReplyForInstance(instanceKey: string) {
  if (awaitingByInstance.delete(instanceKey)) {
    version += 1
  }
}

/**
 * 测试重置（jest 用）。
 */
export function __resetAwaitingReplyStoreForTest() {
  awaitingByInstance.clear()
  version = 0
}
