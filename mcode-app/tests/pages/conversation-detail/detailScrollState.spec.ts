import {
  bottomAnchorId,
  getOldestCursorFromPersistedTurns,
  messageAnchorId,
  resolveInitialTurnLimit,
  resolveNearBottomState,
  resolveRenderAnchorId,
  resolveScrollRestoreAction,
  resolveViewportSyncAction,
  restoreHistoryCursorFromCache,
} from "@/pages/conversation-detail/detailScrollState"
import type { PersistedTurnWithParts } from "@/services/db/repositories/conversationRepository"

const turn = (patch: Partial<PersistedTurnWithParts>): PersistedTurnWithParts => ({
  id: "turn",
  conversationId: 1,
  instanceKey: "instance",
  dedupeKey: "dedupe",
  role: "assistant",
  createdAt: 100,
  sortKey: 100,
  status: "completed",
  version: 1,
  parts: [],
  ...patch,
})

describe("detailScrollState", () => {
  it("resolves initial turn limit from cache, live count, and minimum batch", () => {
    expect(resolveInitialTurnLimit({
      cachedLoadedTurnCount: 30,
      currentLoadedCount: 12,
      minimumBatch: 20,
    })).toBe(30)
    expect(resolveInitialTurnLimit({
      cachedLoadedTurnCount: Number.NaN,
      currentLoadedCount: 12,
      minimumBatch: 20,
    })).toBe(20)
    expect(resolveInitialTurnLimit({
      cachedLoadedTurnCount: 10,
      currentLoadedCount: 42,
      minimumBatch: 20,
    })).toBe(42)
  })

  it("builds history cursors from persisted turns and cached state", () => {
    expect(getOldestCursorFromPersistedTurns([
      turn({ id: "newer", sortKey: 20 }),
      turn({ id: "older", sortKey: 10 }),
    ])).toEqual({ id: "older", sortKey: 10 })

    expect(getOldestCursorFromPersistedTurns([
      turn({ id: "fallback", sortKey: null as any, seq: 9 as any, createdAt: 3 }),
    ])).toEqual({ id: "fallback", sortKey: 9 })

    expect(getOldestCursorFromPersistedTurns([])).toBeNull()
    expect(restoreHistoryCursorFromCache({
      oldestLoadedSeq: 7,
      firstMessageId: "first",
    })).toEqual({ id: "first", sortKey: 7 })
    expect(restoreHistoryCursorFromCache({
      oldestLoadedSeq: 0,
      firstMessageId: "first",
    })).toBeNull()
  })

  it("normalizes message anchors and render anchors", () => {
    expect(messageAnchorId("turn:1/a b")).toBe("msg-turn_1_a_b")
    expect(messageAnchorId("turn:1/a b", 42)).toBe("msg-42-turn_1_a_b")
    expect(bottomAnchorId()).toBe("message-list-bottom")
    expect(bottomAnchorId("conv:42")).toBe("message-list-bottom-conv_42")
    expect(resolveRenderAnchorId({
      messageId: "source-b",
      items: [{ anchorId: "merged", sourceIds: ["source-a", "source-b"] }],
    })).toBe("merged")
    expect(resolveRenderAnchorId({
      messageId: "source-c",
      items: [{ anchorId: "merged", sourceIds: ["source-a", "source-b"] }],
    })).toBe("source-c")
    expect(resolveRenderAnchorId({ messageId: " ", items: [] })).toBe("")
  })

  it("chooses scroll restore actions with the same priority as the page", () => {
    expect(resolveScrollRestoreAction({
      hasCachedViewState: false,
      persistedAnchor: "",
    })).toEqual({ type: "bottom" })
    expect(resolveScrollRestoreAction({
      hasCachedViewState: true,
      cachedNearBottom: true,
      cachedScrollTop: 120,
    })).toEqual({ type: "bottom" })
    expect(resolveScrollRestoreAction({
      hasCachedViewState: true,
      cachedScrollTop: 120,
      cachedAnchorMessageId: "anchor",
    })).toEqual({ type: "scrollTop", scrollTop: 120 })
    expect(resolveScrollRestoreAction({
      hasCachedViewState: true,
      cachedAnchorMessageId: "cached-anchor",
      persistedAnchor: "persisted-anchor",
    })).toEqual({ type: "anchor", anchorMessageId: "cached-anchor" })
    expect(resolveScrollRestoreAction({
      hasCachedViewState: true,
      persistedAnchor: "persisted-anchor",
    })).toEqual({ type: "anchor", anchorMessageId: "persisted-anchor" })
  })

  it("chooses viewport sync actions without restoring stale scrollTop by default", () => {
    expect(resolveViewportSyncAction({
      isRestoringScroll: true,
      forceBottom: true,
      shouldAutoFollowBottom: true,
      lastMeasuredScrollTop: 240,
    })).toEqual({ type: "none" })

    expect(resolveViewportSyncAction({
      forceBottom: true,
      shouldAutoFollowBottom: false,
      lastMeasuredScrollTop: 240,
    })).toEqual({ type: "bottom" })

    expect(resolveViewportSyncAction({
      shouldAutoFollowBottom: true,
      lastMeasuredScrollTop: 240,
    })).toEqual({ type: "bottom" })

    expect(resolveViewportSyncAction({
      shouldAutoFollowBottom: false,
      lastMeasuredScrollTop: 240,
    })).toEqual({ type: "none" })

    expect(resolveViewportSyncAction({
      shouldAutoFollowBottom: false,
      allowScrollTopRestore: true,
      lastMeasuredScrollTop: 240,
    })).toEqual({ type: "scrollTop", scrollTop: 240 })
  })

  it("resolves near-bottom state from explicit or measured fallback viewport height", () => {
    expect(resolveNearBottomState({
      scrollTop: 200,
      scrollHeight: 1200,
      viewportHeight: 500,
      threshold: 72,
    })).toEqual({
      canMeasure: true,
      nearBottom: false,
      distanceToBottom: 500,
    })

    expect(resolveNearBottomState({
      scrollTop: 640,
      scrollHeight: 1200,
      viewportHeight: 500,
      threshold: 72,
    })).toEqual({
      canMeasure: true,
      nearBottom: true,
      distanceToBottom: 60,
    })

    expect(resolveNearBottomState({
      scrollTop: 200,
      scrollHeight: 1200,
      viewportHeight: 0,
      fallbackViewportHeight: 500,
      threshold: 72,
    })).toEqual({
      canMeasure: true,
      nearBottom: false,
      distanceToBottom: 500,
    })

    expect(resolveNearBottomState({
      scrollTop: 200,
      scrollHeight: 1200,
      viewportHeight: 0,
      fallbackViewportHeight: 0,
    })).toEqual({
      canMeasure: false,
      nearBottom: false,
      distanceToBottom: 0,
    })
  })
})
