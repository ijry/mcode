import type { RealtimeBridgeHealth } from "@/types/acp"

let conversationListDirty = false

export function markConversationListDirty() {
  conversationListDirty = true
}

export function consumeConversationListDirty() {
  const dirty = conversationListDirty
  conversationListDirty = false
  return dirty
}

export function peekConversationListDirty() {
  return conversationListDirty
}

/**
 * 判断一次 bridge health 变化是否代表「**重连**成功」，因而需要重新拉一次权威数据。
 *
 * 为什么需要这个判据：服务端的 `/ws/events` 在没有订阅者时**根本不入队**事件
 * （codeg-plus `web/event_bridge.rs` 的 `receiver_count() > 0` 短路），且 `WebEvent`
 * 上没有任何 event id。所以断线期间的 `conversation://changed` 全部永久丢失，客户端
 * 拿不到任何缺口信号 —— 唯一的补救是重连后重新全量获取。
 *
 * **不能用 `reconnectAttempt` 判断**：`api/acp.ts` 的 `onReady` 里先把它归零、**再**发
 * health，所以任何 `state === "connected"` 的 health 都是 `reconnectAttempt: 0`，
 * 首连与第十次重连在这个字段上完全无法区分。只能由订阅方自己记住上一个状态。
 *
 * 两个守卫都是必须的，缺任何一个都会在**首连**误触发一次全量重取：
 * - `previousState` 为空 → 这是订阅后的第一次回调，不是重连；
 * - `previousState === "idle"` → `subscribeRealtimeBridgeHealth` 在订阅瞬间会推一个
 *   合成的 `idle`（桥接还不存在时的默认值），紧跟着的 `connected` 是**首连**。
 *
 * 判据形状与详情页已验证的那份保持一致（`pages/conversation-detail/index.vue` 的
 * `markBridgeRecovered` 分支），避免两处对「什么算恢复」给出不同答案。
 */
export function shouldRefetchAfterBridgeRecovered(input: {
  previousState?: RealtimeBridgeHealth["state"] | null
  nextState: RealtimeBridgeHealth["state"]
}): boolean {
  if (input.nextState !== "connected") return false

  const previousState = input.previousState
  if (!previousState) return false
  if (previousState === "connected") return false
  if (previousState === "idle") return false

  return true
}
