const mockQuery = jest.fn()
const mockExecute = jest.fn()
const mockTransaction = jest.fn()

jest.mock("@/services/db/sqlite", () => ({
  sqliteDriver: {
    execute: mockExecute,
    query: mockQuery,
    transaction: mockTransaction,
  },
}))

describe("conversationRepository", () => {
  beforeEach(() => {
    mockExecute.mockReset()
    mockQuery.mockReset()
    mockTransaction.mockReset()
  })

  it("atomically replaces a conversation cache with its tail window", async () => {
    mockTransaction.mockImplementation(async (work) => await work())
    mockQuery.mockResolvedValue([])

    const repository = await import("@/services/db/repositories/conversationRepository")
    await repository.replaceCompletedTurns(7, [
      {
        id: "tail-turn",
        conversationId: 7,
        instanceKey: "direct::one",
        dedupeKey: "remote:tail-turn",
        role: "assistant",
        createdAt: 1000,
        seq: 1000,
        status: "completed",
        version: 1,
        parts: [],
      },
    ])

    expect(mockTransaction).toHaveBeenCalledTimes(1)
    expect(mockExecute.mock.calls[0]).toEqual([
      "DELETE FROM conversation_parts WHERE conversation_id = ?",
      [7],
    ])
    expect(mockExecute.mock.calls[1]).toEqual([
      "DELETE FROM conversation_turns WHERE conversation_id = ?",
      [7],
    ])
    expect(mockExecute.mock.calls.slice(2)).toEqual(
      expect.arrayContaining([
        [expect.stringContaining("INSERT INTO conversation_turns"), expect.any(Array)],
      ]),
    )
    expect((repository as Record<string, unknown>).getOlderTurns).toBeUndefined()
    expect((repository as Record<string, unknown>).countConversationTurns).toBeUndefined()
  })
})
