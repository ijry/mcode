const mockEnsureConversationSchema = jest.fn();
const mockGetConversationSummaryById = jest.fn();
const mockReplaceCompletedTurns = jest.fn();
const mockUpsertConversationSummary = jest.fn();

jest.mock("@/services/db/migrations", () => ({
  ensureConversationSchema: mockEnsureConversationSchema,
}));

jest.mock("@/services/db/repositories/conversationRepository", () => ({
  getConversationSummaryById: mockGetConversationSummaryById,
  replaceCompletedTurns: mockReplaceCompletedTurns,
  upsertConversationSummary: mockUpsertConversationSummary,
}));

describe("conversationDetailPersistence", () => {
  beforeEach(() => {
    mockEnsureConversationSchema.mockReset();
    mockGetConversationSummaryById.mockReset();
    mockReplaceCompletedTurns.mockReset();
    mockUpsertConversationSummary.mockReset();
  });

  it("replaces the SQLite cache with the fetched tail window only", async () => {
    const persistence = await import(
      "@/services/conversation/conversationDetailPersistence"
    );

    const persisted = await persistence.persistConversationDetailSnapshot({
      instanceKey: "direct::phone",
      conversationId: 24,
      fallbackFolderId: 5,
      detail: {
        title: "当前会话",
        turns: [
          {
            id: "user-tail",
            role: "user",
            timestamp: 100,
            content: [{ type: "text", text: "latest question" }],
          },
          {
            id: "assistant-tail",
            role: "assistant",
            timestamp: 101,
            content: [{ type: "text", text: "latest answer" }],
          },
        ],
      },
    });

    expect(persisted.persistedTurnCount).toBe(2);
    expect(mockEnsureConversationSchema).toHaveBeenCalledTimes(1);
    expect(mockReplaceCompletedTurns).toHaveBeenCalledWith(
      24,
      expect.arrayContaining([
        expect.objectContaining({
          conversationId: 24,
          instanceKey: "direct::phone",
          dedupeKey: "remote:user-tail",
          role: "user",
          createdAt: 100,
        }),
        expect.objectContaining({
          conversationId: 24,
          instanceKey: "direct::phone",
          dedupeKey: "remote:assistant-tail",
          role: "assistant",
          createdAt: 101,
        }),
      ]),
    );
    expect((persistence as Record<string, unknown>).persistConversationTurns).toBeUndefined();
  });
});
