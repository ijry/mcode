import {
  buildConversationDraftSnapshot,
  cloneDraftQueue,
  sanitizeAttachmentsForPersist,
  firstString,
  getTurnContentParts,
  isConversationDraftSnapshotEmpty,
  mapPersistedTurnToMessage,
  normalizeAgentType,
  normalizeAttachments,
  normalizeConversationDraftSnapshot,
  normalizeContentParts,
  normalizeDraftQueue,
  normalizeList,
  normalizeTurns,
  resolveConversationDraftRestoreState,
  safeParseArray,
  toObject,
} from "@/pages/conversation-detail/detailDataNormalization"

const createId = (prefix: string) => `${prefix}-stable`

describe("detailDataNormalization", () => {
  beforeEach(() => {
    jest.spyOn(Date, "now").mockReturnValue(1700000000000)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("extracts first non-empty string and parses objects defensively", () => {
    expect(firstString("", "  ok  ", "later")).toBe("ok")
    expect(firstString(null, 1, {})).toBeUndefined()
    expect(toObject('{"a":1}')).toEqual({ a: 1 })
    expect(toObject("not-json")).toBeNull()
    expect(safeParseArray("[1,2]")).toEqual([1, 2])
    expect(safeParseArray('{"no":true}')).toEqual([])
    expect(normalizeList("x")).toEqual([])
  })

  it("normalizes backend turns and content parts", () => {
    const turns = normalizeTurns([
      {
        id: "u1",
        role: "user",
        content: "hello",
        timestamp: "2026-06-20T00:00:00.000Z",
      },
      {
        role: "assistant",
        blocks: [
          { type: "text", text: "answer" },
          { type: "tool_use", tool_use_id: "tool-1", tool_name: "TaskList", input_preview: '{"x":1}' },
          { type: "tool_result", tool_use_id: "tool-1", output_preview: "done" },
        ],
      },
    ])

    expect(turns[0]).toEqual(expect.objectContaining({
      id: "u1",
      role: "user",
      content: [{ type: "text", text: "hello" }],
    }))
    // 服务端缺 id 时的兜底 id 必须稳定：过去用 Date.now() 拼接，每次归一化都会
    // 得到一个新 id，同一条轮次会在详情页时间线上分裂成多条。现在退回内容指纹。
    //
    // 这个字面量同时锁住另一件事：`meta` / `agentStats` **不参与**内容指纹
    // （`stripNonContentToolCallFields`）。`agentStats` 是扫到配对 tool_result 时
    // 原地回填的，算进指纹会让同一条轮次在回填前后得到两个 `fp:` 键，缓存那份与
    // 远端那份认不出彼此 —— 详情页重复一条消息。加进去这个 hash 就会变。
    expect(turns[1].id).toBe("turn-1-fp:assistant:1ebd4fdd:1700000000")
    expect(turns[1].content).toEqual([
      { type: "text", text: "answer" },
      {
        type: "tool_call",
        tool_call: {
          id: "tool-1",
          name: "TaskList",
          input: { x: 1 },
          output: "done",
          status: "completed",
          error: undefined,
          // 普通工具调用两个字段都是 null —— 只有子智能体才带值。
          meta: null,
          agentStats: null,
        },
      },
    ])
  })

  it("parses all supported backend turn timestamp spellings", () => {
    const turns = normalizeTurns([
      {
        id: "created-at-iso",
        role: "user",
        content: "old",
        created_at: "2026-06-20T00:00:00.000Z",
      },
      {
        id: "createdAt-number-string",
        role: "user",
        content: "new",
        createdAt: "1781913600000",
      },
      {
        id: "timestamp-iso",
        role: "assistant",
        content: "reply",
        timestamp: "2026-06-21T00:00:00.000Z",
      },
    ])

    expect(turns.map((turn) => turn.timestamp)).toEqual([
      Date.parse("2026-06-20T00:00:00.000Z"),
      1781913600000,
      Date.parse("2026-06-21T00:00:00.000Z"),
    ])
  })

  // 服务端 TurnRole 有三种取值（models/message.rs）。上下文压缩摘要在 JSONL 里是
  // type: "user"，解析器（parsers/claude.rs 的 is_context_continuation）会把它改判成
  // System 再下发。归一化早先写的是 rawRole === "user" ? "user" : "assistant"，
  // system 落进 else 分支被当成 agent 回复渲染 —— 详情页因此显示出「会话被压缩」的内部说明。
  it("preserves the system role instead of folding it into assistant", () => {
    const turns = normalizeTurns([
      { id: "u1", role: "user", content: "看下这个 bug" },
      {
        id: "turn-1",
        role: "system",
        content:
          "This session is being continued from a previous conversation that ran out of context.",
      },
      { id: "a1", role: "assistant", content: "我来定位" },
    ])

    expect(turns.map((turn) => turn.role)).toEqual(["user", "system", "assistant"])
  })

  it("falls back to assistant for unknown roles", () => {
    const turns = normalizeTurns([{ id: "x1", role: "tool", content: "?" }])

    expect(turns[0].role).toBe("assistant")
  })

  it("normalizes typed content parts and turn content fallback", () => {
    expect(normalizeContentParts([
      { type: "thinking", thinking: "think" },
      { type: "image", image: { url: "https://img", alt: "alt" } },
      { type: "plan", plan: { steps: [{ title: "ship" }, { description: "" }] } },
      "plain",
    ])).toEqual([
      { type: "thinking", thinking: "think" },
      { type: "image", image: { url: "https://img", alt: "alt" } },
      { type: "plan", plan: { steps: [{ description: "ship", completed: false }], status: undefined } },
      { type: "text", text: "plain" },
    ])

    expect(getTurnContentParts({ blocks: [{ type: "image", uri: "file://a.png" }] })).toEqual([
      { type: "image", image: { url: "file://a.png", alt: "image" } },
    ])
  })

  it("normalizes agent aliases", () => {
    expect(normalizeAgentType("claudecode")).toBe("claude_code")
    expect(normalizeAgentType("codex_cli")).toBe("codex")
    expect(normalizeAgentType("gemini_cli")).toBe("gemini")
    expect(normalizeAgentType("opencode")).toBe("open_code")
    expect(normalizeAgentType("openclaw")).toBe("open_claw")
    expect(normalizeAgentType("")).toBe("claude_code")
  })

  it("normalizes attachments and drafts with an explicit restored id factory", () => {
    const attachments = normalizeAttachments([
      { kind: "image", url: "https://image", name: "image.png", size: 5, type: "image/png" },
      { kind: "file", url: "https://file", id: "file-1" },
      { kind: "file" },
    ], createId)

    expect(attachments).toEqual([
      {
        id: "att-restored-0-stable",
        url: "https://image",
        name: "image.png",
        size: 5,
        type: "image/png",
        kind: "image",
      },
      {
        id: "file-1",
        url: "https://file",
        name: "",
        size: 0,
        type: "application/octet-stream",
        kind: "file",
      },
    ])

    const drafts = normalizeDraftQueue([
      { text: "queued", status: "sending", attachments, createdAt: 123 },
      { text: "failed", status: "failed", error: "bad", attachments: [] },
    ], createId)

    expect(drafts[0]).toEqual(expect.objectContaining({
      id: "draft-restored-0-stable",
      text: "queued",
      status: "pending",
      attachments,
      createdAt: 123,
    }))
    expect(drafts[1]).toEqual(expect.objectContaining({
      status: "failed",
      error: "bad",
    }))

    const cloned = cloneDraftQueue(drafts)
    cloned[0].attachments[0].name = "changed"
    expect(drafts[0].attachments[0].name).toBe("image.png")
  })

  it("normalizes draft snapshots and resolves restore source precedence", () => {
    const snapshot = normalizeConversationDraftSnapshot({
      composerText: "local",
      draftQueue: [{ text: "local draft", status: "sending", attachments: [] }],
      attachments: [{ kind: "file", url: "https://file" }],
      queueExpanded: true,
    }, createId)

    expect(snapshot).toEqual({
      composerText: "local",
      draftQueue: [expect.objectContaining({
        id: "draft-restored-0-stable",
        text: "local draft",
        status: "pending",
      })],
      attachments: [expect.objectContaining({
        id: "att-restored-0-stable",
        kind: "file",
        url: "https://file",
      })],
      queueExpanded: true,
    })

    const restored = resolveConversationDraftRestoreState({
      cachedViewState: {
        composerText: "cached",
        draftQueue: [{
          id: "cached-draft",
          text: "cached draft",
          attachments: [],
          status: "pending",
          createdAt: 1,
        }],
        attachments: [],
        queueExpanded: false,
      },
      localSnapshot: snapshot,
      persistedRuntime: {
        composerText: "runtime",
        draftQueueJson: JSON.stringify([{ text: "runtime draft", attachments: [] }]),
        attachmentsJson: JSON.stringify([{ kind: "image", url: "https://runtime-image" }]),
      },
      createId,
    })

    expect(restored.composerText).toBe("cached")
    expect(restored.draftQueue[0]).toEqual(expect.objectContaining({ text: "cached draft" }))
    expect(restored.attachments).toEqual([])
    expect(restored.queueExpanded).toBe(false)

    const runtimeRestored = resolveConversationDraftRestoreState({
      persistedRuntime: {
        composerText: "runtime",
        draftQueueJson: JSON.stringify([{ text: "runtime draft", attachments: [] }]),
        attachmentsJson: JSON.stringify([{ kind: "image", url: "https://runtime-image" }]),
      },
      createId,
    })

    expect(runtimeRestored.composerText).toBe("runtime")
    expect(runtimeRestored.draftQueue[0]).toEqual(expect.objectContaining({ text: "runtime draft" }))
    expect(runtimeRestored.attachments[0]).toEqual(expect.objectContaining({
      kind: "image",
      url: "https://runtime-image",
    }))
    expect(runtimeRestored.queueExpanded).toBe(true)
  })

  it("builds cloned draft snapshots and detects empty snapshots", () => {
    const source = {
      composerText: "",
      draftQueue: [{
        id: "draft-1",
        text: "queued",
        attachments: [{ id: "att-1", kind: "image" as const, url: "https://image", name: "", size: 0, type: "image/png" }],
        createdAt: 1,
        status: "pending" as const,
      }],
      attachments: [],
      queueExpanded: true,
    }

    const snapshot = buildConversationDraftSnapshot(source)
    snapshot.draftQueue[0].attachments[0].name = "changed"
    expect(source.draftQueue[0].attachments[0].name).toBe("")
    expect(isConversationDraftSnapshotEmpty(snapshot)).toBe(false)
    expect(isConversationDraftSnapshotEmpty({
      composerText: "",
      draftQueue: [],
      attachments: [],
    })).toBe(true)
  })

  it("maps persisted local turn rows into message turns with sorted parts", () => {
    const message = mapPersistedTurnToMessage({
      id: "turn-local",
      conversationId: 7,
      instanceKey: "instance",
      dedupeKey: "dedupe",
      role: "assistant",
      createdAt: 12345,
      sortKey: 99,
      status: null,
      version: 1,
      parts: [
        {
          id: "part-2",
          turnId: "turn-local",
          conversationId: 7,
          partIndex: 2,
          type: "tool_call",
          payloadJson: JSON.stringify({
            tool_call: {
              id: "tool-1",
              name: "TaskList",
              input: {},
              status: "completed",
            },
          }),
          updatedAt: 1,
        },
        {
          id: "part-0",
          turnId: "turn-local",
          conversationId: 7,
          partIndex: 0,
          type: "text",
          payloadJson: JSON.stringify({ text: "hello" }),
          updatedAt: 1,
        },
        {
          id: "part-1",
          turnId: "turn-local",
          conversationId: 7,
          partIndex: 1,
          type: "thinking",
          payloadJson: JSON.stringify({ thinking: "think" }),
          updatedAt: 1,
        },
        {
          id: "part-3",
          turnId: "turn-local",
          conversationId: 7,
          partIndex: 3,
          type: "image",
          payloadJson: JSON.stringify({ image: { url: "https://image", alt: "image" } }),
          updatedAt: 1,
        },
        {
          id: "part-4",
          turnId: "turn-local",
          conversationId: 7,
          partIndex: 4,
          type: "plan",
          payloadJson: JSON.stringify({ plan: { steps: [{ description: "ship" }] } }),
          updatedAt: 1,
        },
      ],
    })

    expect(message).toEqual({
      id: "turn-local",
      // SQLite 行的 dedupe_key 必须透传：它是「本地缓存水合」与「远端对账」认出
      // 同一条逻辑轮次的唯一依据，缺失会让详情页把同一条消息渲染两次。
      dedupeKey: "dedupe",
      role: "assistant",
      timestamp: 12345,
      status: "completed",
      content: [
        { type: "text", text: "hello" },
        { type: "thinking", thinking: "think" },
        {
          type: "tool_call",
          tool_call: {
            id: "tool-1",
            name: "TaskList",
            input: {},
            status: "completed",
          },
        },
        { type: "image", image: { url: "https://image", alt: "image" } },
        { type: "plan", plan: { steps: [{ description: "ship" }] } },
      ],
    })
  })

  it("drops malformed persisted part payloads", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined)

    const message = mapPersistedTurnToMessage({
      id: "bad-turn",
      conversationId: 7,
      instanceKey: "instance",
      dedupeKey: "dedupe",
      role: "user",
      createdAt: 10,
      sortKey: 10,
      status: "completed",
      version: 1,
      parts: [
        {
          id: "bad-part",
          turnId: "bad-turn",
          conversationId: 7,
          partIndex: 0,
          type: "text",
          payloadJson: "{bad-json",
          updatedAt: 1,
        },
      ],
    })

    expect(message.content).toEqual([])
    expect(warn).toHaveBeenCalledWith("failed to parse local part payload", expect.any(Error))
  })
})

describe("sanitizeAttachmentsForPersist", () => {
  const imageWithData = {
    id: "att-1",
    kind: "image" as const,
    url: "/tmp/pic.png",
    name: "pic.png",
    size: 2048,
    type: "image/png",
    localPath: "/tmp/pic.png",
    remoteUrl: "https://cdn/pic.png",
    data: "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=",
  }

  it("strips the base64 payload", () => {
    // `data` 是整张图的 base64，单张就可能几 MB。落进 uni.storage 会直接撞平台配额；
    // 落进 SQLite 会让 H5 侧**每次 execute 都整库 export() 重写 IndexedDB**，
    // 于是每敲一个字都拷贝一遍整个数据库。
    const [sanitized] = sanitizeAttachmentsForPersist([imageWithData])
    expect(sanitized).not.toHaveProperty("data")
  })

  it("keeps the fields needed to rebuild the attachment", () => {
    const [sanitized] = sanitizeAttachmentsForPersist([imageWithData])
    expect(sanitized).toEqual({
      id: "att-1",
      kind: "image",
      url: "/tmp/pic.png",
      name: "pic.png",
      size: 2048,
      type: "image/png",
      localPath: "/tmp/pic.png",
      remoteUrl: "https://cdn/pic.png",
    })
  })

  it("does not mutate the source array", () => {
    // composer 里那份 attachments 是响应式的、还要继续用来发送 —— 落库时顺手把它的
    // `data` 删掉，会让紧接着的发送变成「本地缓存已失效」。
    const source = [{ ...imageWithData }]
    sanitizeAttachmentsForPersist(source)
    expect(source[0].data).toBe(imageWithData.data)
  })

  it("omits absent optional fields instead of writing undefined", () => {
    // 写成 `localPath: undefined` 会在 JSON.stringify 后变成缺键（没问题），但在
    // 内存快照那条路上会留下一个 undefined 值，normalizeAttachment 的
    // `typeof === "string"` 判据虽然挡得住，形状还是别脏。
    const [sanitized] = sanitizeAttachmentsForPersist([{
      id: "att-2",
      kind: "file" as const,
      url: "https://cdn/a.txt",
      name: "a.txt",
      size: 10,
      type: "text/plain",
    }])
    expect(Object.keys(sanitized).sort()).toEqual(
      ["id", "kind", "name", "size", "type", "url"]
    )
  })

  it("survives a round trip through normalizeAttachments", () => {
    // 落库 → 读回 的闭环：sanitize 后的形状必须仍能被 normalizeAttachments 收下，
    // 否则草稿存了却恢复不出来（normalizeAttachment 在缺 url 时会整条丢弃）。
    const persisted = sanitizeAttachmentsForPersist([imageWithData])
    const restored = normalizeAttachments(
      JSON.parse(JSON.stringify(persisted)),
      (prefix: string) => `${prefix}-generated`
    )
    expect(restored).toHaveLength(1)
    expect(restored[0]).toMatchObject({
      id: "att-1",
      kind: "image",
      url: "/tmp/pic.png",
      localPath: "/tmp/pic.png",
      remoteUrl: "https://cdn/pic.png",
    })
    expect(restored[0]).not.toHaveProperty("data")
  })

  it("returns an empty array for an empty input", () => {
    expect(sanitizeAttachmentsForPersist([])).toEqual([])
  })
})
