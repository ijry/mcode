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
    expect(mockExecute.mock.calls[0][1][9]).toBe(12)
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
