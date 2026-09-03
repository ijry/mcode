const mockSubscribeGlobalEvent = jest.fn()
const mockSubscribeRealtimeBridgeHealth = jest.fn()
const mockSetTabBarBadge = jest.fn()
const mockRemoveTabBarBadge = jest.fn()
const mockGetStorageSync = jest.fn()
const mockResolveConnectionContext = jest.fn()
const mockReadStoredConnections = jest.fn()
const mockFetchPayload = jest.fn()

jest.mock("@/api/acp", () => ({
  acpApi: {
    subscribeGlobalEvent: mockSubscribeGlobalEvent,
    subscribeRealtimeBridgeHealth: mockSubscribeRealtimeBridgeHealth,
  },
}))

jest.mock("@/services/connectionContext", () => ({
  buildConnectionKey: (conn: { key?: string }) => conn.key || "",
  readStoredConnections: mockReadStoredConnections,
  resolveConnectionContext: mockResolveConnectionContext,
}))

jest.mock("@/services/conversation/tabbarActiveSessions", () => {
  const actual = jest.requireActual("@/services/conversation/tabbarActiveSessions")
  return {
    ...actual,
    fetchActiveSessionsPayload: mockFetchPayload,
  }
})

/**
 * 底部 tab「会话」角标不显示的根因：整条链（拉取 + 订阅 + 设值）原先都活在
 * `pages/conversations/index.vue` 的 `onShow` / `onUnload` 上。App 冷启动落在 tabBar
 * 第 0 项「连接」页，会话页可能整个会话期间都没挂载过 —— 订阅从未建立，角标从来不显示。
 *
 * 角标恰恰是给「用户**不在**会话页时」看的，所以它的生命周期不能绑在那个页面上。
 */
describe("conversationTabBadgeService", () => {
  const gatewayFor = (instanceKey: string) => ({
    gateway: {
      getRemoteInstanceDescriptor: () => ({ instanceKey }),
    },
  })

  beforeEach(() => {
    jest.clearAllMocks()
    // 全局 `uni` 由 tests/setup/petTestSetup.cjs 提供，且它的 beforeEach 会对自己那几个
    // mock 调 mockClear —— 整体替换会把它们变成 undefined 从而炸在 setup 里。
    // 这里只**追加**本 spec 需要的两个 tabBar API，并接管 getStorageSync。
    const uniApi = (globalThis as Record<string, any>).uni
    uniApi.setTabBarBadge = mockSetTabBarBadge
    uniApi.removeTabBarBadge = mockRemoveTabBarBadge
    uniApi.getStorageSync = mockGetStorageSync
    mockSetTabBarBadge.mockImplementation((options: { success?: () => void }) => options.success?.())
    mockRemoveTabBarBadge.mockImplementation((options: { success?: () => void }) => options.success?.())
    mockSubscribeGlobalEvent.mockReturnValue(() => {})
    mockSubscribeRealtimeBridgeHealth.mockReturnValue(() => {})
    mockGetStorageSync.mockReturnValue({ "conn-a": true })
    mockReadStoredConnections.mockReturnValue([{ key: "conn-a" }])
    mockResolveConnectionContext.mockResolvedValue(gatewayFor("direct::a"))
  })

  afterEach(async () => {
    const service = await import("@/services/conversation/conversationTabBadgeService")
    service.__resetConversationTabBadgeServiceForTest()
  })

  it("sets the badge without any page ever mounting", async () => {
    mockFetchPayload.mockResolvedValue({ runningCount: 3, waitingCount: 0, sessions: [] })

    const service = await import("@/services/conversation/conversationTabBadgeService")
    service.startConversationTabBadgeService()
    await service.refreshConversationTabBadge()

    // 这是整个改动的要点：只调 App 层的入口，没有任何页面参与。
    expect(mockSetTabBarBadge).toHaveBeenCalledWith(
      expect.objectContaining({ index: 1, text: "3" })
    )
  })

  it("subscribes to pet://sessions so the badge stays live off-page", async () => {
    mockFetchPayload.mockResolvedValue({ runningCount: 1, waitingCount: 0, sessions: [] })

    const service = await import("@/services/conversation/conversationTabBadgeService")
    await service.refreshConversationTabBadge()

    const sessionsCall = mockSubscribeGlobalEvent.mock.calls.find(
      (call) => call[0] === "pet://sessions"
    )
    expect(sessionsCall).toBeDefined()

    // 推送一次「两个在跑」，角标应立即跟上，且**不经过**任何页面可见性门禁。
    mockSetTabBarBadge.mockClear()
    sessionsCall![1]({
      sessions: [{ status: "running" }, { status: "waiting_permission" }],
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(mockSetTabBarBadge).toHaveBeenCalledWith(
      expect.objectContaining({ index: 1, text: "2" })
    )
  })

  it("clears the badge when no connection is left", async () => {
    mockReadStoredConnections.mockReturnValue([])

    const service = await import("@/services/conversation/conversationTabBadgeService")
    await service.refreshConversationTabBadge()

    expect(mockRemoveTabBarBadge).toHaveBeenCalledWith(
      expect.objectContaining({ index: 1 })
    )
    expect(mockSetTabBarBadge).not.toHaveBeenCalled()
  })

  it("keeps the previous count when one instance fails to answer", async () => {
    mockFetchPayload.mockResolvedValueOnce({ runningCount: 5, waitingCount: 0, sessions: [] })

    const service = await import("@/services/conversation/conversationTabBadgeService")
    await service.refreshConversationTabBadge()
    expect(mockSetTabBarBadge).toHaveBeenCalledWith(
      expect.objectContaining({ text: "5" })
    )

    // 一次网络抖动不该把角标清零 —— 用户会以为任务都跑完了。
    mockSetTabBarBadge.mockClear()
    mockFetchPayload.mockRejectedValueOnce(new Error("offline"))
    await service.refreshConversationTabBadge()

    expect(mockSetTabBarBadge).toHaveBeenCalledWith(
      expect.objectContaining({ text: "5" })
    )
    expect(mockRemoveTabBarBadge).not.toHaveBeenCalled()
  })

  it("refetches the real count after a reconnect, not on first connect", async () => {
    mockFetchPayload.mockResolvedValue({ runningCount: 1, waitingCount: 0, sessions: [] })

    const service = await import("@/services/conversation/conversationTabBadgeService")
    await service.refreshConversationTabBadge()

    const healthCallback = mockSubscribeRealtimeBridgeHealth.mock.calls[0][0]
    // 排空事件循环。不能用 `await refreshConversationTabBadge()` 代替 ——
    // 并发调用会共享在飞的 promise，守卫失效时也只算一次 fetch，测试会假绿。
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

    // 首连：合成 idle → connected，不该重取。
    mockFetchPayload.mockClear()
    healthCallback({ state: "idle" })
    healthCallback({ state: "connected" })
    await flush()
    expect(mockFetchPayload).not.toHaveBeenCalled()

    // 断线重连：断线期间 pet://sessions 与其它事件一样被直接丢弃（服务端无订阅者时
    // 不入队），所以必须重新拉真实计数，否则角标停在断线前的旧值。
    healthCallback({ state: "error" })
    healthCallback({ state: "connected" })
    await flush()
    expect(mockFetchPayload).toHaveBeenCalled()
  })

  it("shares one in-flight request across concurrent callers", async () => {
    mockFetchPayload.mockResolvedValue({ runningCount: 2, waitingCount: 0, sessions: [] })

    const service = await import("@/services/conversation/conversationTabBadgeService")
    await Promise.all([
      service.refreshConversationTabBadge(),
      service.refreshConversationTabBadge(),
      service.refreshConversationTabBadge(),
    ])

    // App onShow、页面下拉刷新、新建会话可能同时触发，不该打三次网络。
    expect(mockFetchPayload).toHaveBeenCalledTimes(1)
  })

  /**
   * `mcode_connected_map` 只在用户于「连接」页**手动点过「连接」**时才写入
   * （`pages/connections/index.vue` 的 `persistConnectedMap`）——
   * 它是「用户点过没」的 UI 交互标记，不是「这台机器现在可达」的事实。
   *
   * 角标服务却拿它当唯一门禁。于是清缓存 / 换设备 / 重装之后这个 map 是空的，
   * `pet_list_active_sessions` **一次都不会发出**，角标永远不出现；而且所有刷新路径
   * （onLaunch / onShow / 下拉刷新 / pet://sessions / 重连补拉）都走同一道门，
   * 所以它**自己永远不会恢复** —— 只有回「连接」页再点一次连接才好。
   *
   * 修法：门禁放宽成「有保存的连接就试」，resolve 成功即视为已连上并补写该标记。
   */
  it("counts saved connections even when the connected map is empty", async () => {
    mockGetStorageSync.mockReturnValue({})
    mockReadStoredConnections.mockReturnValue([{ key: "conn-a" }])
    mockFetchPayload.mockResolvedValue({ runningCount: 4, waitingCount: 0, sessions: [] })

    const service = await import("@/services/conversation/conversationTabBadgeService")
    await service.refreshConversationTabBadge()

    expect(mockResolveConnectionContext).toHaveBeenCalled()
    expect(mockSetTabBarBadge).toHaveBeenCalledWith(
      expect.objectContaining({ index: 1, text: "4" })
    )
  })

  it("marks a connection as connected once it resolves", async () => {
    mockGetStorageSync.mockReturnValue({})
    mockReadStoredConnections.mockReturnValue([{ key: "conn-a" }])
    mockFetchPayload.mockResolvedValue({ runningCount: 1, waitingCount: 0, sessions: [] })

    const service = await import("@/services/conversation/conversationTabBadgeService")
    await service.refreshConversationTabBadge()

    // 事实回填标记：下次「连接」页与会话列表页读到的 map 就不再是空的。
    expect(globalThis.uni.setStorageSync).toHaveBeenCalledWith(
      "mcode_connected_map",
      expect.objectContaining({ "conn-a": true })
    )
  })

  /**
   * direct 模式下 `resolveConnectionContext` 只是用存储里的 baseUrl + token 拼出 gateway
   * 对象，**不碰网络** —— 所以 resolve 成功证明不了机器可达。标记必须等到
   * `pet_list_active_sessions` 真的返回之后再写，否则一台早已下线的机器
   * 会被永久标成 connected，把假事实喂给会话列表页。
   */
  it("does not mark a connection that resolves but cannot be reached", async () => {
    mockGetStorageSync.mockReturnValue({})
    mockReadStoredConnections.mockReturnValue([{ key: "conn-a" }])
    // resolve 成功（不碰网络），但真正的请求失败
    mockResolveConnectionContext.mockResolvedValue(gatewayFor("direct::a"))
    mockFetchPayload.mockRejectedValue(new Error("ECONNREFUSED"))

    const service = await import("@/services/conversation/conversationTabBadgeService")
    await service.refreshConversationTabBadge()

    const wroteMap = (globalThis.uni.setStorageSync as jest.Mock).mock.calls
      .some((call) => call[0] === "mcode_connected_map")
    expect(wroteMap).toBe(false)
    expect(mockSetTabBarBadge).not.toHaveBeenCalled()
  })

  it("does not mark a connection that fails to resolve", async () => {
    mockGetStorageSync.mockReturnValue({})
    mockReadStoredConnections.mockReturnValue([{ key: "conn-a" }])
    mockResolveConnectionContext.mockRejectedValue(new Error("unreachable"))

    const service = await import("@/services/conversation/conversationTabBadgeService")
    await service.refreshConversationTabBadge()

    const wroteMap = (globalThis.uni.setStorageSync as jest.Mock).mock.calls
      .some((call) => call[0] === "mcode_connected_map")
    expect(wroteMap).toBe(false)
    // 连不上就别显示假角标，但也不能因此清掉别人的计数
    expect(mockSetTabBarBadge).not.toHaveBeenCalled()
  })
})
