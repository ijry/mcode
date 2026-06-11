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

  it("pages older turns with a stable composite cursor", async () => {
    mockQuery
      .mockResolvedValueOnce([
        {
          id: "turn-b",
          conversationId: 7,
          instanceKey: "direct::one",
          dedupeKey: "remote:b",
          role: "assistant",
          createdAt: 1000,
          seq: 1000,
          sortKey: 1000,
          status: "completed",
          version: 1,
        },
      ])
      .mockResolvedValueOnce([])

    const { getOlderTurns } = await import("@/services/db/repositories/conversationRepository")
    const rows = await getOlderTurns(7, { sortKey: 1000, id: "turn-c" }, 20)

    expect(rows.map((row) => row.id)).toEqual(["turn-b"])
    expect(mockQuery.mock.calls[0][0]).toContain("COALESCE(seq, created_at) = ? AND id < ?")
    expect(mockQuery.mock.calls[0][0]).toContain("ORDER BY COALESCE(seq, created_at) DESC, id DESC")
    expect(mockQuery.mock.calls[0][1]).toEqual([7, 1000, 1000, "turn-c", 20])
  })
})
