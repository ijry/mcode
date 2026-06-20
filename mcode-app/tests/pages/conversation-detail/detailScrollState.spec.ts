import {
  bottomAnchorId,
  getOldestCursorFromPersistedTurns,
  messageAnchorId,
  resolveInitialTurnLimit,
  resolveRenderAnchorId,
  resolveScrollRestoreAction,
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
    expect(bottomAnchorId()).toBe("message-list-bottom")
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
})
