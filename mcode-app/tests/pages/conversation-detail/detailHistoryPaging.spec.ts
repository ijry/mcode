import {
  buildOlderHistoryRequest,
  buildTailHistoryRequest,
  canApplyOlderHistoryPage,
  hasOlderConversationHistory,
  prependHistoryPageTurns,
  requireConversationHistoryWindow,
  requireConversationTurnsPage,
} from "@/pages/conversation-detail/detailHistoryPaging"

describe("conversation history paging protocol", () => {
  const turn = (id: string, timestamp = "2026-08-17T00:00:00.000Z") =>
    ({ id, role: "user", blocks: [], timestamp } as any)

  it("builds iOS-compatible requests", () => {
    expect(buildTailHistoryRequest(42)).toEqual({ conversationId: 42, tailTurns: 30 })
    expect(buildOlderHistoryRequest(42, 60)).toEqual({ conversationId: 42, beforeIndex: 60, limit: 30 })
  })

  it("uses the server offset as the has-more authority", () => {
    expect(hasOlderConversationHistory({
      turns_offset: 0,
      turns_total: 12,
      assistant_turns_before_offset: 0,
      prefix_hash: "seed",
    })).toBe(false)
    expect(hasOlderConversationHistory({
      turns_offset: 1,
      turns_total: 12,
      assistant_turns_before_offset: 1,
      prefix_hash: "seed",
    })).toBe(true)
  })

  it("parses numeric metadata and optional timestamps", () => {
    expect(requireConversationHistoryWindow({
      turns_offset: "30",
      turns_total: "60",
      assistant_turns_before_offset: "15",
      prefix_hash: "seed",
      uncoveredPrefixMaxTimestamp: "2026-08-17T00:00:00.000Z",
    })).toEqual(expect.objectContaining({
      turns_offset: 30,
      turns_total: 60,
      assistant_turns_before_offset: 15,
      prefix_hash: "seed",
      uncovered_prefix_max_ts: Date.parse("2026-08-17T00:00:00.000Z"),
    }))
  })

  it("requires metadata and gives an actionable upgrade error", () => {
    expect(() => requireConversationHistoryWindow({ turns: [] })).toThrow("请升级 CodeG")
  })

  it("requires a seam hash for older pages and validates it", () => {
    const raw = {
      turns_offset: 30,
      turns_total: 60,
      assistant_turns_before_offset: 15,
      prefix_hash: "new-prefix",
      prefix_hash_before_index: "current-prefix",
      turns: [turn("old")],
    }
    const page = requireConversationTurnsPage(raw)
    const current = { ...page, prefix_hash: "current-prefix" }
    expect(canApplyOlderHistoryPage(current, page)).toBe(true)
    expect(canApplyOlderHistoryPage({ ...current, prefix_hash: "changed" }, page)).toBe(false)
    expect(() => requireConversationTurnsPage({ ...raw, prefix_hash_before_index: "" })).toThrow("请升级 CodeG")
  })

  it("prepends older turns, deduplicates the seam, and does not mutate inputs", () => {
    const current = [turn("seam"), turn("new")]
    const older = [turn("old"), turn("seam")]
    const merged = prependHistoryPageTurns(current, older)
    expect(merged.map((item) => item.id)).toEqual(["old", "seam", "new"])
    expect(current.map((item) => item.id)).toEqual(["seam", "new"])
    expect(older.map((item) => item.id)).toEqual(["old", "seam"])
  })
})
