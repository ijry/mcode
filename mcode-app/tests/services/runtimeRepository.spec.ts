const mockExecute = jest.fn()
const mockQuery = jest.fn()

jest.mock("@/services/db/sqlite", () => ({
  sqliteDriver: {
    execute: mockExecute,
    query: mockQuery,
  },
}))

describe("runtimeRepository", () => {
  beforeEach(() => {
    mockExecute.mockReset()
    mockQuery.mockReset()
  })

  it("reads runtime by instance key and conversation id", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        conversationId: 7,
        instanceKey: "direct::one",
        connectionId: "conn-one",
        isActive: 1,
      },
    ])

    const { getRuntime } = await import("@/services/db/repositories/runtimeRepository")
    const row = await getRuntime("direct::one", 7)

    expect(row?.connectionId).toBe("conn-one")
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("WHERE instance_key = ? AND conversation_id = ?"), [
      "direct::one",
      7,
    ])
  })

  it("saves runtime with a composite conflict target", async () => {
    const { saveRuntime } = await import("@/services/db/repositories/runtimeRepository")

    await saveRuntime({
      conversationId: 7,
      instanceKey: "direct::one",
      connectionId: "conn-one",
      draftQueueJson: "[]",
      attachmentsJson: "[]",
      composerText: "draft",
      isActive: true,
    })

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT(instance_key, conversation_id) DO UPDATE SET"),
      expect.arrayContaining([7, "direct::one", "conn-one"])
    )
    expect(mockExecute.mock.calls[0][0]).not.toContain("optimistic_json")
  })

  it("preserves existing fields only for the same instance when saving draft state", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        conversationId: 7,
        instanceKey: "direct::one",
        connectionId: "conn-one",
        liveMessageJson: "{\"role\":\"assistant\"}",
        lastAppliedSeq: 12,
        isActive: 1,
      },
    ])

    const { saveDraftState } = await import("@/services/db/repositories/runtimeRepository")
    await saveDraftState({
      conversationId: 7,
      instanceKey: "direct::one",
      composerText: "next",
      draftQueueJson: "[]",
      attachmentsJson: "[]",
    })

    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ["direct::one", 7])
    expect(mockExecute).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([7, "direct::one", "conn-one", "{\"role\":\"assistant\"}"])
    )
    expect(mockExecute.mock.calls[0][0]).not.toContain("optimistic_json")
    expect(mockExecute.mock.calls[0][1][8]).toBe(12)
  })

  // ── saveRuntimeCheckpoint ──────────────────────────────────────────────
  //
  // 断点（live/seq/isActive）与草稿（composer_text / attachments_json /
  // draft_queue_json）由**两个不同的组件**写：断点在 index.vue（它持有 runtime
  // session），草稿在 ConversationDetailInteractivePane.vue（它持有输入框）。
  //
  // `saveDraftState` 对草稿三列是**无条件覆盖**，所以 index.vue 不能用它写断点 ——
  // 它手里的 inputText 永远是空的（输入框已抽走），一写就把 pane 刚落的草稿擦成空串。
  // 这组测试锁住「写断点绝不碰草稿」。
  it("preserves the draft columns when saving only a checkpoint", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        conversationId: 7,
        instanceKey: "direct::one",
        connectionId: "conn-old",
        composerText: "用户正在打的草稿",
        attachmentsJson: '[{"id":"att-1"}]',
        draftQueueJson: '[{"id":"draft-1"}]',
        scrollAnchor: "anchor-9",
        lastAppliedSeq: 5,
        isActive: 1,
      },
    ])

    const { saveRuntimeCheckpoint } = await import("@/services/db/repositories/runtimeRepository")
    await saveRuntimeCheckpoint({
      conversationId: 7,
      instanceKey: "direct::one",
      connectionId: "conn-new",
      liveMessageJson: '{"role":"assistant"}',
      lastAppliedSeq: 12,
      isActive: true,
    })

    const params = mockExecute.mock.calls[0][1]
    // 草稿三列必须是从当前行读回来的原值，而不是 null / 空串。
    expect(params).toContain("用户正在打的草稿")
    expect(params).toContain('[{"id":"att-1"}]')
    expect(params).toContain('[{"id":"draft-1"}]')
    // 断点三列取新值。
    expect(params).toContain('{"role":"assistant"}')
    expect(params).toContain("conn-new")
    expect(params[8]).toBe(12)
  })

  it("keeps the scroll anchor it did not ask to change", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        conversationId: 7,
        instanceKey: "direct::one",
        scrollAnchor: "anchor-9",
        isActive: 1,
      },
    ])

    const { saveRuntimeCheckpoint } = await import("@/services/db/repositories/runtimeRepository")
    await saveRuntimeCheckpoint({
      conversationId: 7,
      instanceKey: "direct::one",
      isActive: true,
    })

    expect(mockExecute.mock.calls[0][1]).toContain("anchor-9")
  })

  it("writes a checkpoint even when no row exists yet", async () => {
    // 首次落断点（这条会话还没有 runtime 行）：草稿三列没有可继承的值，写 null 而不是崩。
    mockQuery.mockResolvedValueOnce([])

    const { saveRuntimeCheckpoint } = await import("@/services/db/repositories/runtimeRepository")
    await saveRuntimeCheckpoint({
      conversationId: 7,
      instanceKey: "direct::one",
      lastAppliedSeq: 3,
      isActive: false,
    })

    expect(mockExecute).toHaveBeenCalledTimes(1)
    expect(mockExecute.mock.calls[0][1][8]).toBe(3)
  })

  it("clears runtime by instance key and conversation id", async () => {
    const { clearRuntime } = await import("@/services/db/repositories/runtimeRepository")
    await clearRuntime("direct::one", 7)

    expect(mockExecute).toHaveBeenCalledWith(
      "DELETE FROM conversation_runtime WHERE instance_key = ? AND conversation_id = ?",
      ["direct::one", 7]
    )
  })
})
