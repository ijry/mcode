import {
  mergeTailIntoTurns,
  mergeTailIntoTurnsWithSeam,
  resolveTurnMergeIdentityAliases,
} from "@/services/conversation/conversationTurnIdentity"

describe("turn merge identity", () => {
  const turn = (input: Partial<Record<string, any>>) =>
    ({
      role: "user",
      content: [],
      timestamp: 1,
      ...input,
    }) as any

  it("prefers dedupeKey so cached and remote copies of one turn match", () => {
    // 本地缓存水合出来的是 SQLite 的 turn:<hash>，远端来的是解析器的 turn-N。
    // 只按 id 比对认不出同一条轮次，会在时间线上各占一行（详情页消息重复 2 次）。
    const cached = turn({ id: "turn:9f2a1c", dedupeKey: "remote:turn-5" })
    const remote = turn({ id: "turn-5", dedupeKey: "remote:turn-5" })

    expect(resolveTurnMergeIdentityAliases(cached)).toEqual(
      resolveTurnMergeIdentityAliases(remote),
    )
  })

  it("keeps roles apart under the same dedupeKey", () => {
    const user = turn({ id: "a", dedupeKey: "same", role: "user" })
    const assistant = turn({ id: "b", dedupeKey: "same", role: "assistant" })

    expect(resolveTurnMergeIdentityAliases(user)).not.toEqual(
      resolveTurnMergeIdentityAliases(assistant),
    )
  })

  it("falls back to id, then gives up rather than guessing", () => {
    // 实时那份只有 id：除了 i: 键，还要带上能撞上缓存副本的 k: 反推键。
    expect(resolveTurnMergeIdentityAliases(turn({ id: "live-1" }))).toEqual([
      "i:live-1",
      "k:user:remote:live-1",
    ])
    // 身份不可知时返回空数组：调用方据此放弃对该条去重、原样保留 ——
    // 宁可重复也不要静默丢消息。
    expect(resolveTurnMergeIdentityAliases(turn({}))).toEqual([])
    expect(resolveTurnMergeIdentityAliases(turn({ id: "   ", dedupeKey: "  " }))).toEqual([])
  })

  it("recognises the live and cached copies of one turn as the same turn", () => {
    // 实时轮次故意不带 dedupeKey（findInFlightUserTurnByContentSignature 依赖它的缺席
    // 来区分「落库后换了 id 的同一条 prompt」和「排队发送的重复文本」），身份是
    // i:<messageId>；persistCompletedTurns 落库时传 dedupeId: turn.id，缓存那份的
    // dedupeKey 就是 remote:<messageId>。两个键形式不同但指的是同一条轮次 ——
    // 认不出来就会在详情页显示两遍（用户报的「消息重复 2 次」）。
    const live = turn({ id: "optimistic-1", role: "user" })
    const cached = turn({
      id: "turn:9f2a1c",
      dedupeKey: "remote:optimistic-1",
      role: "user",
    })

    expect(mergeTailIntoTurns([live], [cached])).toEqual([cached])
  })

  it("keeps turn-N ids out of the alias reverse-mapping", () => {
    // buildTurnDedupeKey 对 turn-N 退化成内容指纹（下标派生的 id 在历史被压缩重写时
    // 整段平移），所以 remote:turn-N 这个键根本不存在，不能反推。
    const remote = turn({ id: "turn-5", role: "user" })
    const other = turn({ id: "turn:abc", dedupeKey: "remote:turn-5", role: "user" })

    expect(mergeTailIntoTurns([remote], [other])).toHaveLength(2)
  })

  it("never lets an unstable turn-N id become an identity of a keyed turn", () => {
    // 带 dedupeKey 的轮次不暴露自己的 id 作为身份：远端解析器那份的 id 是 turn-N，
    // 按下标派生、历史被压缩重写时整段平移。抬成身份键就会让两条**不同**的逻辑轮次
    // 因为 id 恰好漂到同一个值而被误合并 —— 那是静默丢消息。
    const a = turn({ id: "turn-7", dedupeKey: "fp:user:aaaa:1", role: "user" })
    const b = turn({ id: "turn-7", dedupeKey: "fp:user:bbbb:2", role: "user" })

    expect(mergeTailIntoTurns([a], [b])).toHaveLength(2)
  })

  it("does not collapse identity-less turns into one another", () => {
    const anonymous = [turn({}), turn({})]
    const merged = mergeTailIntoTurns(anonymous, [turn({ id: "tail" })])

    expect(merged).toHaveLength(3)
  })

  it("keeps the timeline when the cache read comes back empty", () => {
    // 落库失败 / 缓存被清时 getNewestTurns 返回 []，绝不能把时间线清空。
    const memory = [turn({ id: "a" }), turn({ id: "b" })]

    expect(mergeTailIntoTurns(memory, [])).toEqual(memory)
  })
})

describe("mergeTailIntoTurnsWithSeam", () => {
  const keyed = (dedupeKey: string) =>
    ({
      id: `id-${dedupeKey}`,
      dedupeKey,
      role: "user",
      content: [],
      timestamp: 1,
    }) as any

  it("returns the tail verbatim when there is nothing to preserve", () => {
    const tail = [keyed("a"), keyed("b")]

    expect(mergeTailIntoTurnsWithSeam([], tail)).toEqual({ turns: tail, seamIndex: 0 })
  })

  it("splices at the first covered turn and reports the seam", () => {
    const memory = [keyed("a"), keyed("b"), keyed("c")]
    const tail = [keyed("c"), keyed("d")]

    const merged = mergeTailIntoTurnsWithSeam(memory, tail)

    expect(merged.turns.map((item) => item.dedupeKey)).toEqual(["a", "b", "c", "d"])
    expect(merged.seamIndex).toBe(2)
    // 接缝那条来自尾部：尾部是权威来源，携带最新状态与规范 id。
    expect(merged.turns[2]).toBe(tail[0])
  })

  it("reports seam 0 when the tail covers the whole timeline", () => {
    const tail = [keyed("a"), keyed("b")]

    expect(mergeTailIntoTurnsWithSeam([keyed("a"), keyed("b")], tail)).toEqual({
      turns: tail,
      seamIndex: 0,
    })
  })

  it("distinguishes no-overlap from full-coverage via a null seam", () => {
    const memory = [keyed("a"), keyed("b")]
    const merged = mergeTailIntoTurnsWithSeam(memory, [keyed("z")])

    // 完全不重叠：连续性无从证明 —— 用 null 告诉调用方别再声称原来的窗口坐标。
    //
    // 拼接方向不是无条件的「尾部在后」：认不出接缝时由时间戳定先后（见
    // `detailHistoryPaging.spec.ts` 的 "disjoint tail placement"）。这里之所以仍是
    // `a b z`，是因为 `keyed()` 给**每一条**都设 `timestamp: 1` —— 全等意味着分不出
    // 先后，那时不该重排，维持原语义。`seamIndex` 在两个方向上都是 null。
    expect(merged.turns.map((item) => item.dedupeKey)).toEqual(["a", "b", "z"])
    expect(merged.seamIndex).toBeNull()
  })

  it("does not mutate either input", () => {
    const memory = [keyed("a"), keyed("b")]
    const tail = [keyed("b"), keyed("c")]

    mergeTailIntoTurnsWithSeam(memory, tail)

    expect(memory.map((item) => item.dedupeKey)).toEqual(["a", "b"])
    expect(tail.map((item) => item.dedupeKey)).toEqual(["b", "c"])
  })
})
