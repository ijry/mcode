const mockSubscribeGlobalEvent = jest.fn()
const mockSubscribeRealtimeBridgeHealth = jest.fn()
const mockSetTabBarBadge = jest.fn()
const mockRemoveTabBarBadge = jest.fn()
const mockGetStorageSync = jest.fn()
const mockResolveConnectionContext = jest.fn()
const mockReadStoredConnections = jest.fn()
const mockFetchCount = jest.fn()

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
    fetchOngoingActiveSessionCount: mockFetchCount,
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
    mockFetchCount.mockResolvedValue(3)

    const service = await import("@/services/conversation/conversationTabBadgeService")
    service.startConversationTabBadgeService()
    await service.refreshConversationTabBadge()

    // 这是整个改动的要点：只调 App 层的入口，没有任何页面参与。
    expect(mockSetTabBarBadge).toHaveBeenCalledWith(
      expect.objectContaining({ index: 1, text: "3" })
    )
  })

  it("subscribes to pet://sessions so the badge stays live off-page", async () => {
    mockFetchCount.mockResolvedValue(1)

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
    mockFetchCount.mockResolvedValueOnce(5)

    const service = await import("@/services/conversation/conversationTabBadgeService")
    await service.refreshConversationTabBadge()
    expect(mockSetTabBarBadge).toHaveBeenCalledWith(
      expect.objectContaining({ text: "5" })
    )

    // 一次网络抖动不该把角标清零 —— 用户会以为任务都跑完了。
    mockSetTabBarBadge.mockClear()
    mockFetchCount.mockRejectedValueOnce(new Error("offline"))
    await service.refreshConversationTabBadge()

    expect(mockSetTabBarBadge).toHaveBeenCalledWith(
      expect.objectContaining({ text: "5" })
    )
    expect(mockRemoveTabBarBadge).not.toHaveBeenCalled()
  })

  it("refetches the real count after a reconnect, not on first connect", async () => {
    mockFetchCount.mockResolvedValue(1)

    const service = await import("@/services/conversation/conversationTabBadgeService")
    await service.refreshConversationTabBadge()

    const healthCallback = mockSubscribeRealtimeBridgeHealth.mock.calls[0][0]
    // 排空事件循环。不能用 `await refreshConversationTabBadge()` 代替 ——
    // 并发调用会共享在飞的 promise，守卫失效时也只算一次 fetch，测试会假绿。
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

    // 首连：合成 idle → connected，不该重取。
    mockFetchCount.mockClear()
    healthCallback({ state: "idle" })
    healthCallback({ state: "connected" })
    await flush()
    expect(mockFetchCount).not.toHaveBeenCalled()

    // 断线重连：断线期间 pet://sessions 与其它事件一样被直接丢弃（服务端无订阅者时
    // 不入队），所以必须重新拉真实计数，否则角标停在断线前的旧值。
    healthCallback({ state: "error" })
    healthCallback({ state: "connected" })
    await flush()
    expect(mockFetchCount).toHaveBeenCalled()
  })

  it("shares one in-flight request across concurrent callers", async () => {
    mockFetchCount.mockResolvedValue(2)

    const service = await import("@/services/conversation/conversationTabBadgeService")
    await Promise.all([
      service.refreshConversationTabBadge(),
      service.refreshConversationTabBadge(),
      service.refreshConversationTabBadge(),
    ])

    // App onShow、页面下拉刷新、新建会话可能同时触发，不该打三次网络。
    expect(mockFetchCount).toHaveBeenCalledTimes(1)
  })
})
