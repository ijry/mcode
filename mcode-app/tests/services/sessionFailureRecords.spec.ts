import {
  activeSessionFailures,
  mergeSessionFailure,
  mergeSessionFailureSnapshot,
  normalizeSessionFailureRecord,
  primarySessionFailure,
  sessionFailureSuggestsRetry,
  sessionFailureText,
  settleRecoveredSessionFailures,
} from "@/services/conversation/sessionFailureRecords"
import type { SessionFailureRecord } from "@/types/acp"

const record = (input: Partial<SessionFailureRecord>): SessionFailureRecord => ({
  id: "f1",
  revision: 1,
  category: "service",
  severity: "error",
  title: "boom",
  actions: [],
  resolved: false,
  ...input,
})

describe("normalizeSessionFailureRecord", () => {
  it("keeps the wire shape and defaults resolved to false", () => {
    expect(
      normalizeSessionFailureRecord({
        id: "t1:error",
        revision: 2,
        category: "limit",
        severity: "warning",
        title: "rate limited",
        details: "stderr tail",
        actions: ["retry"],
      })
    ).toEqual({
      id: "t1:error",
      revision: 2,
      category: "limit",
      severity: "warning",
      title: "rate limited",
      details: "stderr tail",
      actions: ["retry"],
      // 线上永远没有这个字段（服务端注释：client-inferred lifecycle），一律从 false 起算。
      resolved: false,
    })
  })

  it("rejects records that cannot take part in a monotonic merge", () => {
    // revision 从 1 开始。缺失/0/负数意味着无法比较 —— 留下它会让后续**任何**一条都被
    // 判成「更新」，把状态反复抖动。
    expect(normalizeSessionFailureRecord({ id: "a" })).toBeNull()
    expect(normalizeSessionFailureRecord({ id: "a", revision: 0 })).toBeNull()
    expect(normalizeSessionFailureRecord({ id: "a", revision: -1 })).toBeNull()
    expect(normalizeSessionFailureRecord({ revision: 1 })).toBeNull()
    expect(normalizeSessionFailureRecord({ id: "   ", revision: 1 })).toBeNull()
    expect(normalizeSessionFailureRecord(null)).toBeNull()
  })

  it("degrades unknown vocabulary instead of failing", () => {
    // 服务端刻意让 category/severity/actions 保持纯字符串，好让将来的新取值退化成兜底
    // 渲染而不是解析失败。
    const parsed = normalizeSessionFailureRecord({
      id: "a",
      revision: 1,
      category: "brand_new_category",
      severity: "brand_new_severity",
      actions: ["retry", "", "  ", "unknown_action"],
    })
    expect(parsed).toMatchObject({
      category: "brand_new_category",
      severity: "brand_new_severity",
      actions: ["retry", "unknown_action"],
      title: "",
    })
  })
})

describe("mergeSessionFailure", () => {
  it("appends a new id", () => {
    const result = mergeSessionFailure([], record({ id: "a" }))
    expect(result.changed).toBe(true)
    expect(result.records.map((item) => item.id)).toEqual(["a"])
  })

  it("revises in place on a higher revision and re-arms resolved", () => {
    // id 复用 + 更高 revision 正是 codex 把一条重试警告升级成终止错误的方式。
    const current = [record({ id: "a", revision: 1, severity: "warning", resolved: true })]
    const result = mergeSessionFailure(
      current,
      record({ id: "a", revision: 2, severity: "error", title: "gave up" })
    )

    expect(result.changed).toBe(true)
    expect(result.records).toHaveLength(1)
    expect(result.records[0]).toMatchObject({
      revision: 2,
      severity: "error",
      title: "gave up",
      resolved: false,
    })
  })

  it("rejects equal and lower revisions", () => {
    // 相等也要拒绝：一条 upsert 只会被原样重播，不会在同一 revision 上合法修订。
    // 适配器在 `session/load` 时重播仍然活跃的失败 —— 不拒绝就会把 resolved 抖回 false，
    // 让一条已恢复的警告重新亮起来。
    const current = [record({ id: "a", revision: 3, title: "kept", resolved: true })]

    const equal = mergeSessionFailure(current, record({ id: "a", revision: 3, title: "replay" }))
    expect(equal.changed).toBe(false)
    expect(equal.records).toBe(current)
    expect(equal.records[0].title).toBe("kept")
    expect(equal.records[0].resolved).toBe(true)

    const lower = mergeSessionFailure(current, record({ id: "a", revision: 2, title: "stale" }))
    expect(lower.changed).toBe(false)
    expect(lower.records[0].title).toBe("kept")
  })

  it("does not mutate the input array", () => {
    const current = [record({ id: "a", revision: 1 })]
    mergeSessionFailure(current, record({ id: "a", revision: 2 }))
    expect(current[0].revision).toBe(1)
  })
})

describe("mergeSessionFailureSnapshot", () => {
  it("keeps the locally inferred resolved flag", () => {
    // resolved 不在线上，只能客户端推断。快照里每条都是 false —— 整表替换会让已经恢复的
    // 警告在每次 attach 后复活。
    const current = [record({ id: "a", revision: 2, severity: "warning", resolved: true })]
    const merged = mergeSessionFailureSnapshot(current, [
      record({ id: "a", revision: 2, severity: "warning", resolved: false }),
    ])

    expect(merged[0].resolved).toBe(true)
  })

  it("still adopts genuinely newer snapshot records", () => {
    const current = [record({ id: "a", revision: 1, title: "old", resolved: true })]
    const merged = mergeSessionFailureSnapshot(current, [
      record({ id: "a", revision: 5, title: "new" }),
    ])

    expect(merged[0]).toMatchObject({ revision: 5, title: "new", resolved: false })
  })

  it("merges unseen ids and leaves untouched ones alone", () => {
    const current = [record({ id: "a", revision: 2 })]
    const merged = mergeSessionFailureSnapshot(current, [
      record({ id: "b", revision: 1 }),
      record({ id: "a", revision: 1 }),
    ])

    expect(merged.map((item) => [item.id, item.revision])).toEqual([["a", 2], ["b", 1]])
  })
})

describe("settleRecoveredSessionFailures", () => {
  it("settles warnings but keeps terminal errors active", () => {
    // 服务端刻意让 error 记录保持活跃（codex 靠它防止迟到的重复通知追加出重复行）。
    // 一起清掉等于把一个还没解决的问题从界面上抹掉。
    const settled = settleRecoveredSessionFailures([
      record({ id: "w", severity: "warning" }),
      record({ id: "e", severity: "error" }),
    ])

    expect(settled.find((item) => item.id === "w")?.resolved).toBe(true)
    expect(settled.find((item) => item.id === "e")?.resolved).toBe(false)
  })

  it("returns the same array when nothing changes", () => {
    const current = [record({ id: "e", severity: "error" })]
    expect(settleRecoveredSessionFailures(current)).toBe(current)
  })
})

describe("primarySessionFailure", () => {
  it("prefers a terminal error over a transient warning", () => {
    // 终止性失败需要用户处理，瞬态重试会自己好 —— 前者更该占据胶囊。
    const chosen = primarySessionFailure([
      record({ id: "w", severity: "warning" }),
      record({ id: "e", severity: "error" }),
    ])
    expect(chosen?.id).toBe("e")
  })

  it("takes the latest among equals", () => {
    const chosen = primarySessionFailure([
      record({ id: "e1", severity: "error" }),
      record({ id: "e2", severity: "error" }),
    ])
    expect(chosen?.id).toBe("e2")
  })

  it("ignores resolved records", () => {
    expect(
      primarySessionFailure([record({ id: "w", severity: "warning", resolved: true })])
    ).toBeNull()
    expect(activeSessionFailures([record({ resolved: true })])).toEqual([])
  })
})

describe("sessionFailureText", () => {
  it("falls back to the category label when the adapter sent no title", () => {
    // 服务端明说 title 可能为空，那时要退回 category 标签，绝不显示空白胶囊。
    expect(sessionFailureText(record({ title: "", category: "limit" }))).toBe("已达用量上限")
    expect(sessionFailureText(record({ title: "", category: "nope" }))).toBe("未知错误")
    expect(sessionFailureText(record({ title: "real message" }))).toBe("real message")
  })
})

describe("sessionFailureSuggestsRetry", () => {
  it("only reports retry when the adapter actually suggested it", () => {
    // 这条是接 AIR 通道最实在的收益：login / new_session 时给「重新连接」是误导，
    // 重连不会解决登录过期或会话失效。
    expect(sessionFailureSuggestsRetry(record({ actions: ["retry"] }))).toBe(true)
    expect(sessionFailureSuggestsRetry(record({ actions: ["login"] }))).toBe(false)
    expect(sessionFailureSuggestsRetry(record({ actions: ["new_session"] }))).toBe(false)
    expect(sessionFailureSuggestsRetry(record({ actions: [] }))).toBe(false)
  })
})
