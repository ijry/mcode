import {
  ingestPetSessionsPayload,
  getAwaitingReply,
  getAwaitingReplyStoreVersion,
  clearAwaitingReplyForInstance,
  __resetAwaitingReplyStoreForTest,
} from "@/services/conversation/awaitingReplyStore"

describe("awaitingReplyStore", () => {
  beforeEach(() => {
    __resetAwaitingReplyStoreForTest()
  })

  it("returns null for unknown instance or conversation", () => {
    expect(getAwaitingReply("inst-1", 42)).toBeNull()
  })

  it("ingests blocked_on from new server", () => {
    const payload = {
      sessions: [
        {
          conversationId: 1,
          blockedOn: { kind: "question", requestId: "req-1", title: "Pick one" },
        },
        {
          conversationId: 2,
          blockedOn: { kind: "permission", requestId: "req-2" },
        },
        {
          conversationId: 3,
          blockedOn: { kind: "plan_approval", requestId: "req-3", title: "Approve?" },
        },
      ],
    }

    ingestPetSessionsPayload("inst-1", payload)

    const entry1 = getAwaitingReply("inst-1", 1)
    expect(entry1).toEqual({
      kind: "waiting_question",
      requestId: "req-1",
      title: "Pick one",
    })

    const entry2 = getAwaitingReply("inst-1", 2)
    expect(entry2).toEqual({
      kind: "waiting_permission",
      requestId: "req-2",
      title: undefined,
    })

    const entry3 = getAwaitingReply("inst-1", 3)
    expect(entry3).toEqual({
      kind: "waiting_plan_approval",
      requestId: "req-3",
      title: "Approve?",
    })
  })

  it("falls back to pending for old server (snake_case)", () => {
    const payload = {
      sessions: [
        {
          conversation_id: 10,
          pending: { request_id: "old-req" },
        },
      ],
    }

    ingestPetSessionsPayload("inst-old", payload)

    const entry = getAwaitingReply("inst-old", 10)
    expect(entry).toEqual({
      kind: "waiting_permission",
      requestId: "old-req",
      title: undefined,
    })
  })

  it("ignores sessions without blocked_on or pending", () => {
    const payload = {
      sessions: [
        { conversationId: 1, status: "prompting" },
        { conversationId: 2, blockedOn: { kind: "question", requestId: "req-2" } },
      ],
    }

    ingestPetSessionsPayload("inst-2", payload)

    expect(getAwaitingReply("inst-2", 1)).toBeNull()
    expect(getAwaitingReply("inst-2", 2)).not.toBeNull()
  })

  it("bumps version on ingest", () => {
    const v0 = getAwaitingReplyStoreVersion()
    ingestPetSessionsPayload("inst-3", { sessions: [{ conversationId: 1, blockedOn: { kind: "question", requestId: "r" } }] })
    const v1 = getAwaitingReplyStoreVersion()
    expect(v1).toBeGreaterThan(v0)

    ingestPetSessionsPayload("inst-3", { sessions: [] })
    const v2 = getAwaitingReplyStoreVersion()
    expect(v2).toBeGreaterThan(v1)
  })

  // `version` 是会话列表 `overviewDisplayModel` 的依赖，一失效就要把所有可见卡重新
  // 展开一遍、卡片对象身份全变、模板整棵子树重渲染。而 `pet://sessions` 是高频推送，
  // 绝大多数载荷与上一次逐字相同 —— 无条件 +1 等于把「智能体在跑」翻译成「列表持续
  // 重算重渲染」。
  describe("version only moves when the table actually changed", () => {
    it("stays put for an identical payload", () => {
      const payload = {
        sessions: [
          { conversationId: 1, blockedOn: { kind: "question", requestId: "r1", title: "T" } },
          { conversationId: 2, blockedOn: { kind: "permission", requestId: "r2" } },
        ],
      }

      ingestPetSessionsPayload("inst-same", payload)
      const afterFirst = getAwaitingReplyStoreVersion()

      ingestPetSessionsPayload("inst-same", payload)
      ingestPetSessionsPayload("inst-same", payload)
      expect(getAwaitingReplyStoreVersion()).toBe(afterFirst)
    })

    it("stays put when both payloads have no blocked session", () => {
      ingestPetSessionsPayload("inst-empty", { sessions: [{ conversationId: 9 }] })
      const afterFirst = getAwaitingReplyStoreVersion()

      // 会话在跑但没人在等 —— 这正是流式期间最常见的那一类载荷。
      ingestPetSessionsPayload("inst-empty", { sessions: [{ conversationId: 9 }] })
      ingestPetSessionsPayload("inst-empty", { sessions: [] })
      expect(getAwaitingReplyStoreVersion()).toBe(afterFirst)
    })

    it("moves when a request id changes", () => {
      ingestPetSessionsPayload("inst-req", {
        sessions: [{ conversationId: 1, blockedOn: { kind: "question", requestId: "r1" } }],
      })
      const afterFirst = getAwaitingReplyStoreVersion()

      ingestPetSessionsPayload("inst-req", {
        sessions: [{ conversationId: 1, blockedOn: { kind: "question", requestId: "r2" } }],
      })
      expect(getAwaitingReplyStoreVersion()).toBeGreaterThan(afterFirst)
    })

    it("moves when the kind or title changes", () => {
      ingestPetSessionsPayload("inst-kind", {
        sessions: [{ conversationId: 1, blockedOn: { kind: "question", requestId: "r1" } }],
      })
      const afterQuestion = getAwaitingReplyStoreVersion()

      ingestPetSessionsPayload("inst-kind", {
        sessions: [{ conversationId: 1, blockedOn: { kind: "permission", requestId: "r1" } }],
      })
      const afterPermission = getAwaitingReplyStoreVersion()
      expect(afterPermission).toBeGreaterThan(afterQuestion)

      ingestPetSessionsPayload("inst-kind", {
        sessions: [{ conversationId: 1, blockedOn: { kind: "permission", requestId: "r1", title: "T" } }],
      })
      expect(getAwaitingReplyStoreVersion()).toBeGreaterThan(afterPermission)
    })

    it("moves when a session appears or disappears", () => {
      ingestPetSessionsPayload("inst-set", {
        sessions: [{ conversationId: 1, blockedOn: { kind: "question", requestId: "r1" } }],
      })
      const afterOne = getAwaitingReplyStoreVersion()

      ingestPetSessionsPayload("inst-set", {
        sessions: [
          { conversationId: 1, blockedOn: { kind: "question", requestId: "r1" } },
          { conversationId: 2, blockedOn: { kind: "permission", requestId: "r2" } },
        ],
      })
      const afterTwo = getAwaitingReplyStoreVersion()
      expect(afterTwo).toBeGreaterThan(afterOne)

      ingestPetSessionsPayload("inst-set", { sessions: [] })
      expect(getAwaitingReplyStoreVersion()).toBeGreaterThan(afterTwo)
    })

    it("keeps instances independent", () => {
      ingestPetSessionsPayload("inst-a", {
        sessions: [{ conversationId: 1, blockedOn: { kind: "question", requestId: "r1" } }],
      })
      const afterA = getAwaitingReplyStoreVersion()

      // 另一个实例第一次拿到同样的表 —— 对它来说是变化，必须 +1。
      ingestPetSessionsPayload("inst-b", {
        sessions: [{ conversationId: 1, blockedOn: { kind: "question", requestId: "r1" } }],
      })
      expect(getAwaitingReplyStoreVersion()).toBeGreaterThan(afterA)
    })
  })

  it("replaces map on ingest, not merge", () => {
    ingestPetSessionsPayload("inst-4", {
      sessions: [
        { conversationId: 1, blockedOn: { kind: "question", requestId: "r1" } },
        { conversationId: 2, blockedOn: { kind: "permission", requestId: "r2" } },
      ],
    })

    expect(getAwaitingReply("inst-4", 1)).not.toBeNull()
    expect(getAwaitingReply("inst-4", 2)).not.toBeNull()

    ingestPetSessionsPayload("inst-4", {
      sessions: [{ conversationId: 2, blockedOn: { kind: "permission", requestId: "r2-new" } }],
    })

    expect(getAwaitingReply("inst-4", 1)).toBeNull()
    expect(getAwaitingReply("inst-4", 2)?.requestId).toBe("r2-new")
  })

  it("clears instance and bumps version", () => {
    ingestPetSessionsPayload("inst-5", {
      sessions: [{ conversationId: 1, blockedOn: { kind: "question", requestId: "r" } }],
    })

    const v0 = getAwaitingReplyStoreVersion()
    expect(getAwaitingReply("inst-5", 1)).not.toBeNull()

    clearAwaitingReplyForInstance("inst-5")

    expect(getAwaitingReply("inst-5", 1)).toBeNull()
    expect(getAwaitingReplyStoreVersion()).toBeGreaterThan(v0)
  })

  it("ignores invalid conversation ids", () => {
    const payload = {
      sessions: [
        { conversationId: null, blockedOn: { kind: "question", requestId: "r1" } },
        { conversationId: 0, blockedOn: { kind: "question", requestId: "r2" } },
        { conversationId: -1, blockedOn: { kind: "question", requestId: "r3" } },
        { conversationId: "not a number", blockedOn: { kind: "question", requestId: "r4" } },
      ],
    }

    ingestPetSessionsPayload("inst-6", payload)

    expect(getAwaitingReply("inst-6", 0)).toBeNull()
  })

  it("handles empty or malformed payload gracefully", () => {
    ingestPetSessionsPayload("inst-7", null)
    ingestPetSessionsPayload("inst-7", undefined)
    ingestPetSessionsPayload("inst-7", {})
    ingestPetSessionsPayload("inst-7", { sessions: null })
    ingestPetSessionsPayload("inst-7", { sessions: "not an array" })

    expect(getAwaitingReply("inst-7", 1)).toBeNull()
  })
})
