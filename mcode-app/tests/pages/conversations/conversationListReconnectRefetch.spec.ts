import {
  shouldRefetchAfterBridgeRecovered,
} from "@/services/conversation/conversationListRefresh"
import fs from "node:fs"
import path from "node:path"

/**
 * 断开重连后必须重新获取会话列表。
 *
 * 服务端的 `/ws/events` 在没有订阅者时**根本不入队**事件（codeg-plus
 * `web/event_bridge.rs` 的 `receiver_count() > 0` 短路），而且 `WebEvent` 上没有任何
 * event id。所以断线期间的 `conversation://changed` 全部永久丢失，客户端拿不到任何
 * 缺口信号 —— 唯一可靠的补救是「重连成功时重新拉一次权威数据」。
 */
describe("bridge recovery refetch predicate", () => {
  it("fires when a broken bridge comes back", () => {
    for (const previousState of ["error", "reconnecting", "polling"] as const) {
      expect(
        shouldRefetchAfterBridgeRecovered({ previousState, nextState: "connected" })
      ).toBe(true)
    }
  })

  it("does not fire on the very first connect", () => {
    // 订阅后的第一次回调没有「上一个状态」。把它当重连会让每次冷启动都多一次全量重取。
    expect(
      shouldRefetchAfterBridgeRecovered({ previousState: null, nextState: "connected" })
    ).toBe(false)
    expect(
      shouldRefetchAfterBridgeRecovered({ previousState: undefined, nextState: "connected" })
    ).toBe(false)
  })

  it("treats the synthetic idle seed as first connect, not recovery", () => {
    // `subscribeRealtimeBridgeHealth` 在订阅瞬间会推一个合成的 `idle`（桥接还不存在时
    // 的默认值）。紧随其后的 `connected` 是**首连**。少了这条守卫，任何在桥接建立前
    // 挂载的订阅者都会误触发一次重取。
    expect(
      shouldRefetchAfterBridgeRecovered({ previousState: "idle", nextState: "connected" })
    ).toBe(false)
  })

  it("does not fire on repeated connected notifications", () => {
    // 同一次连接可能发出两次 `connected`：socket 在 `await connectEvents` 期间就已打开
    // 时，`onReady` 的同步回调与随后的 `isOpen()` 分支都会发一遍。
    expect(
      shouldRefetchAfterBridgeRecovered({ previousState: "connected", nextState: "connected" })
    ).toBe(false)
  })

  it("ignores every non-connected transition", () => {
    for (const nextState of ["idle", "reconnecting", "error", "polling"] as const) {
      expect(
        shouldRefetchAfterBridgeRecovered({ previousState: "connected", nextState })
      ).toBe(false)
    }
  })
})

describe("conversation list reconnect wiring", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../../src/pages/conversations/index.vue"),
    "utf8"
  )

  it("refetches authoritatively on bridge recovery and bulk import", () => {
    expect(source).toContain("shouldRefetchAfterBridgeRecovered")
    expect(source).toContain("acpApi.subscribeRealtimeBridgeHealth")
    expect(source).toContain('"conversations://bulk-changed"')
    expect(source).toContain('refreshConnectionGroupAuthoritative(instanceKey, "bridge_recovered")')
    expect(source).toContain('refreshConnectionGroupAuthoritative(instanceKey, "bulk_changed")')

    // 判据必须用「记住的上一个状态」，不能用 health.reconnectAttempt —— 它在
    // `onReady` 里先归零再发 health，所以每个 connected 都是 0，首连与第十次重连
    // 无法区分。
    expect(source).toContain("lastBridgeStateMap")
    expect(source).not.toContain("health.reconnectAttempt")
  })

  it("reconciles stale summaries only on the authoritative path", () => {
    // 权威重取传 reconcile，其它路径不传。单条 `conversation://changed` 不携带
    // 「该 folder 的全集」，拿它对账等于按一条消息删掉整个 folder。
    expect(source).toContain("markMissingConversationSummariesDeleted")
    expect(source).toContain("reconcileFolderIds")
    expect(source).toContain("{ reconcile: true }")

    // 对账范围必须来自本次请求过的 folder（`fetchRemoteConversations` 就是拿
    // `folders.map(f => f.id)` 当 folderIds 的），不能是整个实例。
    expect(source).toMatch(
      /reconcileFolderIds: options\?\.reconcile[\s\S]*folders\.map\(\(folder\) => Number\(folder\.id\)\)/
    )
  })

  it("disposes the new subscriptions on unload", () => {
    // 订阅活在 acpApi 的 globalListeners 里，跨 socket 重连存活。页面不清理就会在
    // 反复进出列表页后累积多份回调，一次重连触发 N 次全量重取。
    expect(source).toContain("disposeBridgeHealthMap.forEach((dispose) => dispose())")
    expect(source).toContain("disposeBulkChangedMap.forEach((dispose) => dispose())")
    expect(source).toContain("lastBridgeStateMap.clear()")
  })
})
