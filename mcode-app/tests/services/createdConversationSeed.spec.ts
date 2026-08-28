import { seedCreatedConversationSummary } from "@/services/conversation/createdConversationSeed"

// jest.mock 的工厂里只能引用 `mock` 前缀的变量（防未初始化），所以这两个 spy 必须
// 这么命名 —— 不是风格选择。
const mockUpsert = jest.fn()
const mockEnsureSchema = jest.fn()

jest.mock("@/services/db/repositories/conversationRepository", () => ({
  upsertConversationSummary: (...args: unknown[]) => mockUpsert(...args),
}))

jest.mock("@/services/db/migrations", () => ({
  ensureConversationSchema: () => mockEnsureSchema(),
}))

function gatewayReturning(detail: unknown, instanceKey = "direct::host") {
  return {
    call: jest.fn().mockResolvedValue(detail),
    getRemoteInstanceDescriptor: () => ({ instanceKey }),
  } as any
}

const base = {
  instanceKey: "direct::host",
  conversationId: 42,
  folderId: 7,
  title: "我的会话",
  agentType: "codex_cli",
  hasTaskContent: true,
}

describe("seedCreatedConversationSummary", () => {
  beforeEach(() => {
    mockUpsert.mockReset()
    mockEnsureSchema.mockReset()
  })

  it("writes an optimistic row before touching the network", async () => {
    // 这一步是「新建会话后列表立刻有一行」的全部依据。放在远端探测之后的话，
    // 弱网下用户会先看到一个空列表 —— 而会话其实已经建好了。
    const gateway = gatewayReturning(null)
    await seedCreatedConversationSummary({ ...base, gateway })

    expect(mockUpsert.mock.calls.length).toBeGreaterThanOrEqual(1)
    expect(mockUpsert.mock.calls[0][0]).toMatchObject({
      id: 42,
      instanceKey: "direct::host",
      folderId: 7,
      title: "我的会话",
      // 归一化必须在这里做：列表页比对用的是 canonical 值。
      agentType: "codex",
      status: "in_progress",
    })
  })

  it("marks a task-less conversation as unknown rather than running", async () => {
    // 没有任务内容就不会发 prompt，写成 in_progress 会让列表显示一个永远不结束的
    // 「远程运行中」。
    await seedCreatedConversationSummary({
      ...base,
      hasTaskContent: false,
      gateway: gatewayReturning(null),
    })

    expect(mockUpsert.mock.calls[0][0]).toMatchObject({ status: "unknown" })
  })

  it("falls back to a placeholder title when none was typed", async () => {
    await seedCreatedConversationSummary({
      ...base,
      title: "   ",
      gateway: gatewayReturning(null),
    })

    expect(mockUpsert.mock.calls[0][0]).toMatchObject({ title: "会话 #42" })
  })

  it("refines the row from the remote detail when it arrives", async () => {
    const gateway = gatewayReturning({
      title: "服务端定的标题",
      folder_id: 9,
      agent_type: "claudecode",
      session_id: "sess-1",
      status: "pending_review",
    })

    await seedCreatedConversationSummary({ ...base, gateway })

    expect(mockUpsert).toHaveBeenCalledTimes(2)
    expect(mockUpsert.mock.calls[1][0]).toMatchObject({
      title: "服务端定的标题",
      folderId: 9,
      agentType: "claude_code",
      externalId: "sess-1",
      status: "pending_review",
    })
  })

  it("reads only conversation metadata, never a turn window", async () => {
    // 这个探测只读 summary / title / folderId / agentType / status，完全不看轮次内容
    // （lastTurnId 在新建时硬编码为 null）。取大窗口会在新建路径上白拉一整页历史。
    const gateway = gatewayReturning({ title: "x" })
    await seedCreatedConversationSummary({ ...base, gateway })

    expect(gateway.call).toHaveBeenCalledWith("get_folder_conversation", {
      conversationId: 42,
      tailTurns: 1,
    })
  })

  it("keeps the optimistic row when the remote probe fails", async () => {
    // 探测失败不能回滚乐观行 —— 会话已经建好了，列表少一行比多一行错的更糟。
    const gateway = {
      call: jest.fn().mockRejectedValue(new Error("offline")),
      getRemoteInstanceDescriptor: () => ({ instanceKey: "direct::host" }),
    } as any

    await expect(seedCreatedConversationSummary({ ...base, gateway })).resolves.toBeUndefined()
    expect(mockUpsert).toHaveBeenCalledTimes(1)
  })

  it("ensures the schema before writing", async () => {
    // 新建会话可能是本次安装第一次碰 SQLite（列表页的本地水合只在有缓存那条路上跑）。
    await seedCreatedConversationSummary({ ...base, gateway: gatewayReturning(null) })
    expect(mockEnsureSchema).toHaveBeenCalled()
  })
})
