import { RelayGateway } from "@/services/gateway/relayGateway"
import { __resetRelayClientIdForTest } from "@/services/gateway/relayClientIdentity"

describe("RelayGateway client identity", () => {
  beforeEach(() => {
    __resetRelayClientIdForTest()
    ;(uni.getStorageSync as jest.Mock).mockReturnValue("mcode-client-existing")
    ;(uni as any).connectSocket = jest.fn()
  })

  it("sends relay client id on proxy calls", async () => {
    ;(uni.request as jest.Mock).mockResolvedValue({
      statusCode: 200,
      data: { ok: true },
    })
    const gateway = new RelayGateway("https://relay.example.com", {
      accessToken: "access-token",
    })

    await gateway.call("acp_prompt", { prompt: "hello" })

    expect(uni.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://relay.example.com/v1/proxy/acp_prompt",
        header: expect.objectContaining({
          authorization: "Bearer access-token",
          "x-mcode-client-id": "mcode-client-existing",
        }),
      })
    )
  })

  it("adds relay client id to event websocket URLs", async () => {
    const addEventListener = jest.fn()
    const close = jest.fn()
    const send = jest.fn()
    const webSocketMock = jest.fn().mockImplementation(() => ({
      readyState: 1,
      addEventListener,
      close,
      send,
    }))
    ;(webSocketMock as any).OPEN = 1
    ;(globalThis as any).WebSocket = webSocketMock
    const socketTask = {
      onOpen: jest.fn(),
      onClose: jest.fn(),
      onError: jest.fn(),
      onMessage: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
    }
    ;(uni.connectSocket as jest.Mock).mockReturnValue(socketTask)
    const gateway = new RelayGateway("https://relay.example.com", {
      accessToken: "access-token",
    })

    await gateway.connectEvents(jest.fn(), { lastEventId: 42 })

    expect(webSocketMock).toHaveBeenCalledWith(
      "wss://relay.example.com/v1/events?lastEventId=42&clientId=mcode-client-existing",
      expect.any(Array)
    )
  })
})

describe("RelayGateway pair", () => {
  beforeEach(() => {
    __resetRelayClientIdForTest()
    ;(uni.getStorageSync as jest.Mock).mockReturnValue("mcode-client-existing")
  })

  it("reports an actionable message when the pairing code was already consumed", async () => {
    ;(uni.request as jest.Mock).mockResolvedValue({
      statusCode: 401,
      data: { error: "pairing failed" },
    })
    const gateway = new RelayGateway("https://relay.example.com", { accessToken: "" })

    await expect(
      gateway.pair({ relayUrl: "https://relay.example.com", code: "123456", secret: "secret" })
    ).rejects.toThrow("配对码已失效或已被使用")
  })

  it("rejects responses without an access token instead of returning an empty session", async () => {
    ;(uni.request as jest.Mock).mockResolvedValue({
      statusCode: 200,
      data: { target: { targetId: "desktop-1", targetAgent: "mcode-desktop" } },
    })
    const gateway = new RelayGateway("https://relay.example.com", { accessToken: "" })

    await expect(
      gateway.pair({ relayUrl: "https://relay.example.com", code: "123456", secret: "secret" })
    ).rejects.toThrow("网关未返回访问令牌")
  })

  it("returns target metadata on success", async () => {
    ;(uni.request as jest.Mock).mockResolvedValue({
      statusCode: 200,
      data: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        target: { targetId: "desktop-1", targetAgent: "mcode-desktop" },
      },
    })
    const gateway = new RelayGateway("https://relay.example.com", { accessToken: "" })

    const session = await gateway.pair({
      relayUrl: "https://relay.example.com",
      code: "123456",
      secret: "secret",
    })

    expect(session).toMatchObject({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      targetId: "desktop-1",
      targetAgent: "mcode-desktop",
    })
  })
})
