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

import { writeLocalTurnCacheEnabled } from "@/services/conversation/localTurnCachePreference";

describe("conversationDetailPersistence", () => {
  beforeEach(() => {
    mockEnsureConversationSchema.mockReset();
    mockGetConversationSummaryById.mockReset();
    mockReplaceCompletedTurns.mockReset();
    mockUpsertConversationSummary.mockReset();
    // 「本地缓存最新页消息」是实验性开关，**默认关闭**，关闭时一条轮次都不写。
    // 下面这两条讲的是「开着时写什么」，所以显式打开；关闭时不写的行为由
    // 本文件末尾那条专门的测试锁住。
    writeLocalTurnCacheEnabled(true);
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

  it("never writes empty thinking capsules into SQLite", async () => {
    const persistence = await import(
      "@/services/conversation/conversationDetailPersistence"
    );

    await persistence.persistConversationDetailSnapshot({
      instanceKey: "direct::phone",
      conversationId: 24,
      fallbackFolderId: 5,
      detail: {
        title: "当前会话",
        turns: [
          {
            id: "assistant-tail",
            role: "assistant",
            timestamp: 101,
            blocks: [
              { type: "thinking", text: "" },
              { type: "text", text: "latest answer" },
              { type: "thinking", text: "" },
            ],
          },
        ],
      },
    });

    // 空胶囊必须在写入侧就被挡住：落库了就等于把 bug 固化进缓存，
    // 清了缓存才好、重载又会读回来。展示侧的过滤只是第二道防线。
    const [, records] = mockReplaceCompletedTurns.mock.calls[0];
    expect(records[0].parts).toEqual([
      expect.objectContaining({
        partIndex: 0,
        type: "text",
        payloadJson: JSON.stringify({ text: "latest answer" }),
      }),
    ]);
  });

  it("writes the summary but no turns when the local cache toggle is off", async () => {
    writeLocalTurnCacheEnabled(false);
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
        ],
      },
    });

    expect(mockReplaceCompletedTurns).not.toHaveBeenCalled();
    expect(persisted.persistedTurnCount).toBe(0);
    // 摘要**照写**。这个开关只管轮次：把摘要一起关掉会让会话列表在离线时整个空白，
    // 那是比「详情页要等网络」严重得多的退化，也不是这个开关承诺的语义。
    expect(mockUpsertConversationSummary).toHaveBeenCalledTimes(1);
    expect(mockUpsertConversationSummary).toHaveBeenCalledWith(
      expect.objectContaining({ id: 24, instanceKey: "direct::phone", title: "当前会话" }),
    );
  });
});
