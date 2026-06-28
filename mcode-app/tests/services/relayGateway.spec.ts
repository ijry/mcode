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
