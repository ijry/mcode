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

  // ——— 「缓存只存最新一页」的落盘裁剪 ———
  //
  // 两条写入路径里只有 `replaceCompletedTurns` 天然收敛（先 DELETE 整表再插）。
  // `insertCompletedTurn` 只 upsert、从不删，所以一直聊下去缓存会单调增长。
  // 读取侧的 `getNewestTurns(..., 30)` 带 LIMIT，多出来的行永远读不到 ——
  // 于是这是个**完全静默**的存储泄漏：看不出问题，只是长期占着手机存储，
  // 并被「清除缓存」页面算进条数。
  describe("pruneConversationTurnsToNewest", () => {
    it("deletes parts before turns so no orphan part rows survive", async () => {
      mockTransaction.mockImplementation(async (work) => await work())
      mockQuery.mockResolvedValue([{ id: "old-a" }, { id: "old-b" }])

      const repository = await import("@/services/db/repositories/conversationRepository")
      const removed = await repository.pruneConversationTurnsToNewest(7, 30)

      expect(removed).toBe(2)
      // schema 里 conversation_parts 是普通表、**没有外键 CASCADE**，反序执行会留下
      // 一批查不到宿主轮次的孤儿 part 行 —— 那比不裁剪更糟：占着存储，且没有任何
      // 路径会再清理它们。
      expect(mockExecute.mock.calls[0][0]).toContain("DELETE FROM conversation_parts")
      expect(mockExecute.mock.calls[0][0]).toContain("turn_id IN (?, ?)")
      expect(mockExecute.mock.calls[0][1]).toEqual(["old-a", "old-b"])
      expect(mockExecute.mock.calls[1][0]).toContain("DELETE FROM conversation_turns")
      expect(mockExecute.mock.calls[1][1]).toEqual(["old-a", "old-b"])
    })

    it("selects stale rows with the exact ordering getNewestTurns reads by", async () => {
      mockTransaction.mockImplementation(async (work) => await work())
      mockQuery.mockResolvedValue([])

      const repository = await import("@/services/db/repositories/conversationRepository")
      await repository.pruneConversationTurnsToNewest(7, 30)

      const [sql, params] = mockQuery.mock.calls[0]
      // 排序键与 `getNewestTurns` **必须逐字一致**。不一致的话「读取侧认为的最新
      // 30 条」与「裁剪侧保留的 30 条」是两个不同集合，刚写进去的轮次可能当场被
      // 裁掉 —— 用户看到刚说完的话消失。
      expect(sql).toContain("ORDER BY COALESCE(seq, created_at) DESC, id DESC")
      // `LIMIT -1 OFFSET n` = 「跳过最新 n 条，剩下的全要」。SQLite 要求带 LIMIT
      // 才能用 OFFSET，-1 表示无上限。
      expect(sql).toContain("LIMIT -1 OFFSET ?")
      expect(params).toEqual([7, 30])
    })

    it("touches nothing when the cache is already within one page", async () => {
      mockTransaction.mockImplementation(async (work) => await work())
      mockQuery.mockResolvedValue([])

      const repository = await import("@/services/db/repositories/conversationRepository")
      const removed = await repository.pruneConversationTurnsToNewest(7, 30)

      // 这是常态（每回合都会调一次）。空集必须提前返回 —— 否则会拼出
      // `IN ()` 这种语法错误的 SQL。
      expect(removed).toBe(0)
      expect(mockExecute).not.toHaveBeenCalled()
    })

    it("falls back to one page for nonsensical keep counts", async () => {
      mockTransaction.mockImplementation(async (work) => await work())
      mockQuery.mockResolvedValue([])

      const repository = await import("@/services/db/repositories/conversationRepository")
      // `keep=0` 会清空整个会话缓存，`keep=1` 几乎一样糟。两者都是编程错误，统一
      // 退回默认一页 —— 而不是钳到 1。钳到 1 还会与 `0 || DEFAULT` 那种 falsy 兜底
      // 行为不一致：同样荒谬的入参给出两个不同答案，是下一个 bug 的温床。
      for (const nonsense of [0, -5, NaN, Number.POSITIVE_INFINITY]) {
        mockQuery.mockClear()
        await repository.pruneConversationTurnsToNewest(7, nonsense)
        expect(mockQuery.mock.calls[0][1]).toEqual([
          7,
          repository.CONVERSATION_TURN_CACHE_KEEP,
        ])
      }
    })

    it("keeps the tail window inside the same transaction as a full replace", async () => {
      mockTransaction.mockImplementation(async (work) => await work())
      // 远端一页实际可能返回 30~230 条（服务端把窗口起点向前对齐到 user 轮次边界）。
      mockQuery.mockResolvedValue([{ id: "aligned-overflow" }])

      const repository = await import("@/services/db/repositories/conversationRepository")
      await repository.replaceCompletedTurns(7, [])

      // 关键：**只开一次事务**。`sqliteDriver.transaction` 无条件发 BEGIN IMMEDIATE、
      // 没有 SAVEPOINT 嵌套支持，所以 replace 必须复用不开事务的内部裁剪实现 ——
      // 调用导出版会直接报 "cannot start a transaction within a transaction"。
      expect(mockTransaction).toHaveBeenCalledTimes(1)
      expect(mockExecute.mock.calls.map((call) => call[0])).toEqual(
        expect.arrayContaining([
          expect.stringContaining("DELETE FROM conversation_parts WHERE turn_id IN"),
        ]),
      )
    })

    it("agrees with the reader's page size", async () => {
      const repository = await import("@/services/db/repositories/conversationRepository")
      const contract = await import("@/services/conversation/conversationHistoryWindowContract")
      // 两个常量刻意不互相 import（`services/db` → `services/conversation` 是反向
      // 依赖），所以靠这条断言锁住它们同值。裁剪保留的条数少于读取条数，就会出现
      // 「读取侧要 30 条、库里只剩 20 条」的静默截断。
      expect(repository.CONVERSATION_TURN_CACHE_KEEP).toBe(
        contract.DEFAULT_CONVERSATION_HISTORY_PAGE_SIZE,
      )
    })
  })

  // ——— 重连后按 folder 对账，清掉远端已删除的会话摘要 ———
  //
  // 摘要缓存原先只有 upsert 和单条墓碑，而单条墓碑唯一的触发源是
  // `conversation://changed` 的 `deleted` 事件。服务端在没有订阅者时**根本不入队**
  // 事件，所以断线期间被删掉的会话永远收不到那条 deleted —— 纯 upsert 清不掉本地行，
  // 它会一直显示成一张点进去 404 的卡。重连后必须靠「远端全集」反向对账。
  describe("markMissingConversationSummariesDeleted", () => {
    it("tombstones only the rows the remote no longer returns", async () => {
      mockQuery.mockResolvedValue([{ id: 11 }, { id: 12 }])

      const repository = await import("@/services/db/repositories/conversationRepository")
      const removed = await repository.markMissingConversationSummariesDeleted({
        instanceKey: "direct::one",
        folderId: 3,
        presentIds: [7, 9],
        deletedAt: 1700,
      })

      expect(removed).toBe(2)
      const [sql, params] = mockExecute.mock.calls[0]
      // 打墓碑而不是物理 DELETE：与 `markConversationSummaryDeleted` 同一语义，
      // 轮次缓存不受影响。
      expect(sql).toContain("SET deleted_at = ?, updated_at = ?")
      expect(sql).toContain("id NOT IN (7,9)")
      // 范围三重限定：实例 + folder + 尚未打墓碑。少任何一个都会误删。
      expect(sql).toContain("instance_key = ?")
      expect(sql).toContain("folder_id = ?")
      expect(sql).toContain("deleted_at IS NULL")
      expect(params).toEqual([1700, 1700, "direct::one", 3])
    })

    it("touches nothing when the remote returned an empty set", async () => {
      mockQuery.mockResolvedValue([{ id: 11 }])

      const repository = await import("@/services/db/repositories/conversationRepository")
      const removed = await repository.markMissingConversationSummariesDeleted({
        instanceKey: "direct::one",
        folderId: 3,
        presentIds: [],
      })

      // **这是本函数唯一能造成数据损坏的分支。** `NOT IN ()` 会退化成「删掉该 folder
      // 的全部会话」，而空响应最可能的原因是请求失败或该 folder 确实为空 —— 两者都
      // 绝不该触发全清。必须在拼 SQL 之前就返回，连 SELECT 都不该发。
      expect(removed).toBe(0)
      expect(mockExecute).not.toHaveBeenCalled()
      expect(mockQuery).not.toHaveBeenCalled()
    })

    it("reports zero and skips the write when nothing is stale", async () => {
      mockQuery.mockResolvedValue([])

      const repository = await import("@/services/db/repositories/conversationRepository")
      const removed = await repository.markMissingConversationSummariesDeleted({
        instanceKey: "direct::one",
        folderId: 3,
        presentIds: [7],
      })

      // 常态：每次权威重取都会调一遍，绝大多数时候无事可做。
      expect(removed).toBe(0)
      expect(mockExecute).not.toHaveBeenCalled()
    })

    it("sanitises ids before interpolating them into SQL", async () => {
      mockQuery.mockResolvedValue([{ id: 11 }])

      const repository = await import("@/services/db/repositories/conversationRepository")
      await repository.markMissingConversationSummariesDeleted({
        instanceKey: "direct::one",
        folderId: 3,
        // id 要直接拼进 SQL（`IN` 列表无法参数化成一个占位符），所以必须先证明它们
        // 都是正整数：NaN / 负数 / 0 / 重复项全部剔除。
        presentIds: [7, 7, 9.8, NaN, -1, 0] as number[],
      })

      expect(mockExecute.mock.calls[0][0]).toContain("id NOT IN (7,9)")
    })

    it("refuses to run without an instance key", async () => {
      const repository = await import("@/services/db/repositories/conversationRepository")
      const removed = await repository.markMissingConversationSummariesDeleted({
        instanceKey: "   ",
        folderId: 3,
        presentIds: [7],
      })

      // 空 instanceKey 会让 WHERE 退化成跨实例匹配 —— 多连接场景下等于删别人的数据。
      expect(removed).toBe(0)
      expect(mockQuery).not.toHaveBeenCalled()
      expect(mockExecute).not.toHaveBeenCalled()
    })
  })
})
