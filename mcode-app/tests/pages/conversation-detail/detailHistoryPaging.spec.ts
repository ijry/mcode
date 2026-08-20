import {
  advanceConversationHistoryWindow,
  buildOlderHistoryRequest,
  buildTailHistoryRequest,
  canApplyOlderHistoryPage,
  hasOlderConversationHistory,
  isWindowedConversationDetail,
  mergeTailIntoTurnsWithSeam,
  prependHistoryPageTurns,
  requireConversationHistoryWindow,
  requireConversationTurnsPage,
  resolvePreservedTurnsWindow,
  resolveRefreshedTailWindow,
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
    const current = {
      turns_offset: 31,
      turns_total: 60,
      assistant_turns_before_offset: 15,
      prefix_hash: "current-prefix",
    }
    expect(canApplyOlderHistoryPage(current, page)).toBe(true)
    expect(canApplyOlderHistoryPage({ ...current, prefix_hash: "changed" }, page)).toBe(false)
    expect(() => requireConversationTurnsPage({ ...raw, prefix_hash_before_index: "" })).toThrow("请升级 CodeG")
  })

  it("rejects older pages that are not contiguous with the loaded window", () => {
    const current = {
      turns_offset: 30,
      turns_total: 60,
      assistant_turns_before_offset: 15,
      prefix_hash: "current-prefix",
    }
    const contiguous = {
      turns_offset: 0,
      turns_total: 60,
      assistant_turns_before_offset: 0,
      prefix_hash: "older-prefix",
      prefix_hash_before_index: "current-prefix",
      turns: Array.from({ length: 30 }, (_, index) => turn(`old-${index}`)),
    }

    expect(canApplyOlderHistoryPage(current, contiguous)).toBe(true)
    expect(canApplyOlderHistoryPage(current, {
      ...contiguous,
      turns_offset: 1,
    })).toBe(false)
    expect(canApplyOlderHistoryPage(current, {
      ...contiguous,
      turns_total: 29,
    })).toBe(false)
    // The current tail already represents 60 loaded turns. A lower total is
    // internally inconsistent even when it remains above beforeIndex.
    expect(canApplyOlderHistoryPage(current, {
      ...contiguous,
      turns_total: 59,
    })).toBe(false)
  })

  it("advances a verified window without letting a newer total invalidate the loaded boundary", () => {
    const current = {
      turns_offset: 30,
      turns_total: 60,
      assistant_turns_before_offset: 15,
      prefix_hash: "current-prefix",
    }
    const page = {
      turns_offset: 0,
      turns_total: 61,
      assistant_turns_before_offset: 0,
      prefix_hash: "older-prefix",
      prefix_hash_before_index: "current-prefix",
      uncovered_prefix_max_ts: 123,
      turns: Array.from({ length: 30 }, (_, index) => turn(`old-${index}`)),
    }

    expect(advanceConversationHistoryWindow(current, page)).toEqual({
      turns_offset: 0,
      turns_total: 60,
      assistant_turns_before_offset: 0,
      prefix_hash: "older-prefix",
      uncovered_prefix_max_ts: 123,
    })
  })

  it("prepends older turns, deduplicates the seam, and does not mutate inputs", () => {
    const current = [turn("seam"), turn("new")]
    const older = [turn("old"), turn("seam")]
    const merged = prependHistoryPageTurns(current, older)
    expect(merged.map((item) => item.id)).toEqual(["old", "seam", "new"])
    expect(current.map((item) => item.id)).toEqual(["seam", "new"])
    expect(older.map((item) => item.id)).toEqual(["old", "seam"])
  })

  it("deduplicates the seam across id spaces via dedupeKey", () => {
    // 当前窗口来自本地缓存水合（SQLite turn:<hash>），历史页来自服务端（解析器
    // turn-N）。只按 id 比对会认不出接缝那条轮次，在列表顶部重复插入一份。
    const keyed = (id: string, dedupeKey: string) =>
      ({ id, role: "user", dedupeKey, blocks: [], timestamp: "2026-08-17T00:00:00.000Z" }) as any
    const current = [keyed("turn:9f2a1c", "remote:turn-5"), keyed("turn:1b8e77", "remote:turn-6")]
    const older = [keyed("turn-4", "remote:turn-4"), keyed("turn-5", "remote:turn-5")]

    const merged = prependHistoryPageTurns(current, older)

    expect(merged.map((item) => item.id)).toEqual(["turn-4", "turn-5", "turn:1b8e77"])
  })

  describe("windowed detail predicate", () => {
    // 服务端不带窗口选择器时四个字段被 skip_serializing_if 整体省略，不是 null。
    const windowed = {
      turns_offset: 0,
      turns_total: 12,
      assistant_turns_before_offset: 0,
      prefix_hash: "seed",
      turns: [],
    }

    it("accepts offset 0 — the first page is still a window", () => {
      expect(isWindowedConversationDetail(windowed)).toBe(true)
    })

    it("rejects a legacy full response that omits the window fields", () => {
      expect(isWindowedConversationDetail({ turns: [], session_stats: {} })).toBe(false)
      expect(isWindowedConversationDetail(null)).toBe(false)
    })

    it("requires a non-empty string hash and finite numbers", () => {
      expect(isWindowedConversationDetail({ ...windowed, prefix_hash: "" })).toBe(false)
      expect(isWindowedConversationDetail({ ...windowed, prefix_hash: 42 })).toBe(false)
      // 数字字段是字符串时不算窗口化 —— 这里判定的是原始载荷，不做类型宽容。
      expect(isWindowedConversationDetail({ ...windowed, turns_total: "12" })).toBe(false)
      expect(isWindowedConversationDetail({ ...windowed, turns_offset: NaN })).toBe(false)
    })
  })

  describe("tail refresh keeps the paged-in prefix and a matched window triple", () => {
    const keyed = (dedupeKey: string) =>
      ({
        id: `turn-${dedupeKey}`,
        role: "user",
        dedupeKey,
        blocks: [],
        timestamp: "2026-08-17T00:00:00.000Z",
      }) as any
    // 用户往上翻了 3 页：内存里有 offset 90 起的 90 条，尾窗只覆盖最后 30 条。
    const memory = Array.from({ length: 90 }, (_, index) => keyed(`k-${90 + index}`))
    const tail = Array.from({ length: 30 }, (_, index) => keyed(`k-${150 + index}`))
    const deepWindow = {
      turns_offset: 90,
      turns_total: 180,
      assistant_turns_before_offset: 45,
      prefix_hash: "deep-prefix",
    }
    const tailWindow = {
      turns_offset: 150,
      turns_total: 180,
      assistant_turns_before_offset: 75,
      prefix_hash: "tail-prefix",
    }

    it("splices at the seam instead of collapsing to one page", () => {
      const merged = mergeTailIntoTurnsWithSeam(memory, tail)
      expect(merged.turns).toHaveLength(90)
      expect(merged.seamIndex).toBe(60)
      expect(merged.turns[0].dedupeKey).toBe("k-90")
      // 尾窗是权威来源：接缝之后的对象来自尾窗，不是内存里的旧副本。
      expect(merged.turns[60]).toBe(tail[0])
    })

    it("keeps the deeper window when the prefix closes the gap exactly", () => {
      const merged = mergeTailIntoTurnsWithSeam(memory, tail)
      const next = resolveRefreshedTailWindow(deepWindow, tailWindow, merged.seamIndex)
      // 90 + 60 === 150：保住的前缀正好补上缺口，沿用旧的整组坐标。
      expect(next).toEqual({ ...deepWindow, turns_total: 180 })
    })

    it("never patches turns_offset onto a foreign prefix_hash", () => {
      const merged = mergeTailIntoTurnsWithSeam(memory, tail)
      const next = resolveRefreshedTailWindow(deepWindow, tailWindow, merged.seamIndex)
      // 拼接过的三元组会让下面这条断言永远失败 —— 分页静默退化成整页重载。
      expect(
        canApplyOlderHistoryPage(next, {
          turns_offset: 60,
          turns_total: 180,
          assistant_turns_before_offset: 30,
          prefix_hash: "older-prefix",
          prefix_hash_before_index: "deep-prefix",
          turns: Array.from({ length: 30 }, (_, index) => keyed(`k-${60 + index}`)),
        })
      ).toBe(true)
    })

    it("raises turns_total when newer turns landed remotely", () => {
      const merged = mergeTailIntoTurnsWithSeam(memory, tail)
      const next = resolveRefreshedTailWindow(
        deepWindow,
        { ...tailWindow, turns_total: 181 },
        merged.seamIndex
      )
      expect(next.turns_total).toBe(181)
      expect(next.prefix_hash).toBe("deep-prefix")
      expect(next.turns_offset).toBe(90)
    })

    it("falls back to the tail window when continuity cannot be proven", () => {
      // 接缝找不到（历史被压缩重写，尾窗与内存完全不重叠）。
      const disjoint = mergeTailIntoTurnsWithSeam(memory, [keyed("k-999")])
      expect(disjoint.seamIndex).toBeNull()
      expect(resolveRefreshedTailWindow(deepWindow, tailWindow, disjoint.seamIndex)).toEqual(
        tailWindow
      )
      // 缺口对不上（内存的 offset 记录与实际接缝矛盾）→ 宁可采用偏浅的尾窗。
      expect(
        resolveRefreshedTailWindow({ ...deepWindow, turns_offset: 80 }, tailWindow, 60)
      ).toEqual(tailWindow)
      // 首次加载：没有旧窗口可沿用。
      expect(resolveRefreshedTailWindow(null, tailWindow, 0)).toEqual(tailWindow)
    })

    it("adopts the tail wholesale when it covers the entire in-memory timeline", () => {
      const merged = mergeTailIntoTurnsWithSeam(tail, tail)
      expect(merged.seamIndex).toBe(0)
      expect(merged.turns).toBe(tail)
      expect(resolveRefreshedTailWindow(deepWindow, tailWindow, 0)).toEqual(tailWindow)
    })

    it("keeps the deep window whenever the turns themselves were preserved", () => {
      // 流式中 / 有 in-flight 用户轮次时 localTurns 一个字都不动，旧窗口仍精确描述
      // localTurns[0]。若换成尾窗，「翻了多远」被打回一页，后续「加载更早」会连着
      // 几次拉回内存已有的轮次并被全部去重 —— 界面没反应，像是按钮坏了。
      expect(resolvePreservedTurnsWindow(deepWindow, tailWindow)).toEqual(deepWindow)
    })
    it("still picks up a raised total while preserving turns", () => {
      expect(
        resolvePreservedTurnsWindow(deepWindow, { ...tailWindow, turns_total: 181 })
      ).toEqual({ ...deepWindow, turns_total: 181 })
    })

    it("refuses to invent a window when there is no previous one to preserve", () => {
      // 曾经这里返回 `tailWindow`，那是**错的**。窗口的语义是「localTurns[0] 在整个
      // 会话里的下标」，而这条分支恰恰**不碰** localTurns：列表页实时预览预连接过的
      // 会话进详情时，localTurns 里已经有两三条**尾部**轮次而窗口仍是 null。此时采纳
      // 尾窗的 turns_offset（170）就等于宣称 localTurns[0] 是全局第 170 条，而它其实
      // 是第 198 条 —— 点一次「加载更早」拉回 140~169 接到 198 前面，中间 170~197 被
      // 静默跳过，且 canApplyOlderHistoryPage 用的是同一个错坐标，不会报错。
      //
      // 返回 null 的代价只是这一轮先不显示能否翻页，等流式结束后由
      // ensureConversationHistoryWindow 重新探测拿到配套的一组，可恢复。
      expect(resolvePreservedTurnsWindow(null, tailWindow)).toBeNull()
      expect(resolvePreservedTurnsWindow(undefined, tailWindow)).toBeNull()
    })
  })

  // ——— 认不出接缝时的拼接方向 ———
  //
  // 用户原话：「刚进详情页是对的，突然刷新出一个莫名奇妙的消息看着是历史消息加在
  // 实时对话后边了」。这不是罕见边界，是**首次进入详情页的常态**：
  //
  // - 内存里只有实时的两三条尾部轮次（列表页实时预览预连接过会话）。实时轮次
  //   **故意不带** dedupeKey，身份是 `i:<messageId>`；
  // - 服务端尾窗的起点被 round_align_backward 向前对齐到**用户轮次边界**，所以它从
  //   一条更早的用户消息开始；
  // - 尾窗那些轮次的身份是解析器的 `turn-N`，buildTurnDedupeKey 对它退化成内容指纹、
  //   isReversibleTurnId 拒绝反推 —— 两段的身份键**永不相等**，接缝必然找不到。
  //
  // 于是一整页更早的历史被拼到更晚的实时内容之后。时间线层不做任何排序
  // （buildConversationTimeline 原样保留数组顺序），错位直接显形。
  describe("disjoint tail placement", () => {
    const at = (id: string, timestamp: number, dedupeKey?: string) =>
      ({
        id,
        role: "user",
        blocks: [],
        content: [],
        timestamp,
        ...(dedupeKey ? { dedupeKey } : {}),
      }) as any

    it("puts an entirely older tail before the live turns", () => {
      // 实时轮次：无 dedupeKey，身份 `i:live-*`。
      const live = [at("live-1", 5_000), at("live-2", 6_000)]
      // 尾窗：`turn-N` + 内容指纹，与上面永不相等；且整段更早。
      const tail = [at("turn-7", 1_000, "fp:user:abc:1"), at("turn-8", 2_000, "fp:user:def:2")]

      const merged = mergeTailIntoTurnsWithSeam(live, tail)

      // 认不出同一条 → seamIndex 仍是 null（窗口坐标逻辑一个字不改）。
      expect(merged.seamIndex).toBeNull()
      // 但顺序必须按时间：历史在前，实时在后。
      expect(merged.turns.map((item) => item.id)).toEqual([
        "turn-7",
        "turn-8",
        "live-1",
        "live-2",
      ])
    })

    it("keeps a newer tail after the current turns", () => {
      // 反方向：尾窗是真正的「更新的尾部」（正常刷新），必须留在后面。
      const memory = [at("turn-1", 1_000, "fp:a"), at("turn-2", 2_000, "fp:b")]
      const tail = [at("turn-9", 9_000, "fp:z")]

      const merged = mergeTailIntoTurnsWithSeam(memory, tail)

      expect(merged.seamIndex).toBeNull()
      expect(merged.turns.map((item) => item.id)).toEqual(["turn-1", "turn-2", "turn-9"])
    })

    it("does not reorder interleaved segments", () => {
      // 两段在时间上交错：不去猜一个交叉顺序，维持原语义（尾部在后）。
      const memory = [at("m-1", 1_000, "fp:a"), at("m-2", 8_000, "fp:b")]
      const tail = [at("t-1", 4_000, "fp:z")]

      expect(
        mergeTailIntoTurnsWithSeam(memory, tail).turns.map((item) => item.id)
      ).toEqual(["m-1", "m-2", "t-1"])
    })

    it("falls back to tail-after when timestamps are unusable", () => {
      // 拿不到有效时间戳时不能凭 0 / NaN 把一段甩到最前面。
      const memory = [at("m-1", 0, "fp:a")]
      const tail = [at("t-1", Number.NaN, "fp:z")]

      expect(
        mergeTailIntoTurnsWithSeam(memory, tail).turns.map((item) => item.id)
      ).toEqual(["m-1", "t-1"])
    })

    it("does not reorder when both segments share one timestamp", () => {
      // 时间戳相等 = 分不出先后（同一秒内的两条，或精度不足），此时重排没有依据。
      // 判据必须是严格 `<`：改成 `<=` 会让「谁在前」不可知的输入被凭空调换一整段。
      const memory = [at("m-1", 1, "fp:a"), at("m-2", 1, "fp:b")]
      const tail = [at("t-1", 1, "fp:z")]

      expect(
        mergeTailIntoTurnsWithSeam(memory, tail).turns.map((item) => item.id)
      ).toEqual(["m-1", "m-2", "t-1"])
    })

    it("still prefers the seam over timestamps when identity proves overlap", () => {
      // 有接缝时一切照旧：接缝优先于时间戳判据，尾部仍是权威来源。
      const shared = at("turn-5", 5_000, "fp:shared")
      const memory = [at("turn-4", 4_000, "fp:earlier"), shared]
      const tail = [at("turn-5", 5_000, "fp:shared"), at("turn-6", 6_000, "fp:later")]

      const merged = mergeTailIntoTurnsWithSeam(memory, tail)

      expect(merged.seamIndex).toBe(1)
      expect(merged.turns.map((item) => item.id)).toEqual(["turn-4", "turn-5", "turn-6"])
      expect(merged.turns[1]).toBe(tail[0])
    })
  })
})
