import {
  appendFeedbackNote,
  markFeedbackNotesDelivered,
  mergeFeedbackSnapshot,
  normalizeFeedbackNote,
} from "@/services/conversation/feedbackNotes"
import type { FeedbackNote } from "@/types/acp"

const note = (patch: Partial<FeedbackNote> = {}): FeedbackNote => ({
  id: "f1",
  text: "用 UserService",
  createdAt: 1000,
  status: "delivered",
  deliveredAt: 1000,
  ...patch,
})

describe("normalizeFeedbackNote", () => {
  it("reads the snake_case wire shape", () => {
    expect(normalizeFeedbackNote({
      id: "f1",
      text: "用 UserService",
      created_at: "2026-08-27T00:00:00.000Z",
      status: "pending",
    })).toEqual({
      id: "f1",
      text: "用 UserService",
      createdAt: Date.parse("2026-08-27T00:00:00.000Z"),
      status: "pending",
      deliveredAt: null,
    })
  })

  it("reads the camelCase alias and delivered timestamp", () => {
    expect(normalizeFeedbackNote({
      id: "f2",
      text: "改用 axios",
      createdAt: "2026-08-27T00:00:00.000Z",
      status: "delivered",
      deliveredAt: "2026-08-27T00:00:05.000Z",
    })).toEqual({
      id: "f2",
      text: "改用 axios",
      createdAt: Date.parse("2026-08-27T00:00:00.000Z"),
      status: "delivered",
      deliveredAt: Date.parse("2026-08-27T00:00:05.000Z"),
    })
  })

  it("drops entries without an id or text", () => {
    // id 是幂等的唯一依据，没有 id 的条目会在每次重放里重复 append。
    expect(normalizeFeedbackNote({ text: "无 id" })).toBeNull()
    expect(normalizeFeedbackNote({ id: "f1", text: "   " })).toBeNull()
    expect(normalizeFeedbackNote({ id: "  ", text: "空 id" })).toBeNull()
    expect(normalizeFeedbackNote(null)).toBeNull()
    expect(normalizeFeedbackNote("f1")).toBeNull()
  })

  it("falls back to pending for an unknown status", () => {
    // 状态白名单只有 pending / delivered（服务端 FeedbackStatus）。未知值退回 pending
    // 而不是丢弃：那条便签确实存在，只是状态读不懂，显示成「等待读取」比消失好。
    expect(normalizeFeedbackNote({
      id: "f1",
      text: "hi",
      status: "consumed_maybe",
    })?.status).toBe("pending")

    expect(normalizeFeedbackNote({ id: "f1", text: "hi" })?.status).toBe("pending")
  })

  it("keeps deliveredAt null when the status is pending", () => {
    // 服务端在 Pending 时不发 delivered_at；万一发了也不能采信 —— 状态才是权威。
    expect(normalizeFeedbackNote({
      id: "f1",
      text: "hi",
      status: "pending",
      delivered_at: "2026-08-27T00:00:05.000Z",
    })?.deliveredAt).toBeNull()
  })
})

describe("appendFeedbackNote", () => {
  it("appends a new note", () => {
    const list = appendFeedbackNote([], note({ id: "f1" }), new Map())
    expect(list.map((item) => item.id)).toEqual(["f1"])
  })

  it("is idempotent on id", () => {
    // 服务端 apply_event 就是这个语义（session_state.rs:1141）：重放、双 attach、
    // 「本地乐观 append + 随后到达的广播」都不能变成两条。
    const first = appendFeedbackNote([], note({ id: "f1" }), new Map())
    const second = appendFeedbackNote(first, note({ id: "f1", text: "改过的正文" }), new Map())

    expect(second).toBe(first)
    expect(second.map((item) => item.text)).toEqual(["用 UserService"])
  })

  it("honors a consumed tombstone that arrived before the note", () => {
    // 乱序：feedback_consumed 先到（submitted 还在路上，或快照还没水合）。不查墓碑
    // 的话这条便签会以 pending 复活在 agent 已经读过之后 —— 显示成「等待读取」，
    // 而它其实早就送到了。
    const consumed = new Map([["f1", 2000]])
    const list = appendFeedbackNote(
      [],
      note({ id: "f1", status: "pending", deliveredAt: null }),
      consumed
    )

    expect(list[0]).toMatchObject({
      id: "f1",
      status: "delivered",
      deliveredAt: 2000,
    })
  })

  it("leaves an unrelated tombstone alone", () => {
    const consumed = new Map([["other", 2000]])
    const list = appendFeedbackNote(
      [],
      note({ id: "f1", status: "pending", deliveredAt: null }),
      consumed
    )

    expect(list[0]).toMatchObject({ status: "pending", deliveredAt: null })
  })
})

describe("markFeedbackNotesDelivered", () => {
  it("flips only the named ids", () => {
    const list = [
      note({ id: "f1", status: "pending", deliveredAt: null }),
      note({ id: "f2", status: "pending", deliveredAt: null }),
    ]

    const next = markFeedbackNotesDelivered(list, ["f1"], 3000)

    expect(next[0]).toMatchObject({ status: "delivered", deliveredAt: 3000 })
    expect(next[1]).toMatchObject({ status: "pending", deliveredAt: null })
  })

  it("never rewrites an existing deliveredAt", () => {
    // 服务端的 commit 是幂等的且只广播真正翻转的 id，但重放/乱序仍可能让同一条
    // consumed 到两次。覆盖 deliveredAt 会让「已读取」的时刻往后跳。
    const list = [note({ id: "f1", status: "delivered", deliveredAt: 1500 })]

    const next = markFeedbackNotesDelivered(list, ["f1"], 9000)

    expect(next[0].deliveredAt).toBe(1500)
  })

  it("backfills the instant for a delivered note that has none", () => {
    // delivered_at 在线上是 optional（skip_serializing_if），所以「已送达但没有时刻」
    // 是真实可达的形状。这时该用 consumed 事件带来的时刻补上，而不是让它一直为 null
    // ——「已读取」却没有时刻，UI 就没法显示「几点读的」。
    const list = [note({ id: "f1", status: "delivered", deliveredAt: null })]

    const next = markFeedbackNotesDelivered(list, ["f1"], 9000)

    expect(next[0]).toMatchObject({ status: "delivered", deliveredAt: 9000 })
  })

  it("returns the same array when nothing changed", () => {
    const list = [note({ id: "f1", status: "delivered", deliveredAt: 1500 })]
    expect(markFeedbackNotesDelivered(list, ["nope"], 3000)).toBe(list)
    expect(markFeedbackNotesDelivered(list, [], 3000)).toBe(list)
  })
})

describe("mergeFeedbackSnapshot", () => {
  it("keeps the live entry when both sides hold the same id", () => {
    // 与 native_steering_available 相反：这里**实时优先**。实时条目带更新的状态
    // （快照可能停在 pending，而 consumed 事件已经到了）。
    const live = [note({ id: "f1", status: "delivered", deliveredAt: 2000 })]
    const snapshot = [note({ id: "f1", status: "pending", deliveredAt: null })]

    expect(mergeFeedbackSnapshot(live, snapshot)).toEqual([
      { ...note({ id: "f1", status: "delivered", deliveredAt: 2000 }) },
    ])
  })

  it("adds snapshot-only ids the live stream never carried", () => {
    // 冷启动 / 重连进一个进行中的会话：一次性的 feedback_submitted 不会为你重放，
    // 快照是唯一来源。
    const live = [note({ id: "f2" })]
    const snapshot = [note({ id: "f1" }), note({ id: "f2" })]

    expect(mergeFeedbackSnapshot(live, snapshot).map((item) => item.id))
      .toEqual(["f1", "f2"])
  })

  it("settles snapshot-only entries against consumed tombstones", () => {
    const consumed = new Map([["f1", 3000]])
    const snapshot = [note({ id: "f1", status: "pending", deliveredAt: null })]

    expect(mergeFeedbackSnapshot([], snapshot, consumed)).toEqual([
      note({ id: "f1", status: "delivered", deliveredAt: 3000 }),
    ])
  })

  it("returns the live list untouched for an empty snapshot", () => {
    // 服务端在列表为空时不上线这个字段（skip_serializing_if），所以「缺失」是常态，
    // 绝不能当成「服务端说没有便签」而清掉本地的。
    const live = [note({ id: "f1" })]
    expect(mergeFeedbackSnapshot(live, [])).toBe(live)
  })
})
