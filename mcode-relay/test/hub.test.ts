import { describe, expect, it, vi } from "vitest"
import WebSocket from "ws"
import { RelayHub } from "../src/tunnel/hub.js"

describe("RelayHub", () => {
  function socketMock() {
    return {
      readyState: WebSocket.OPEN,
      send: vi.fn(),
      close: vi.fn(),
      on: vi.fn(),
    } as unknown as WebSocket
  }

  it("replays buffered events after the subscriber checkpoint", () => {
    const hub = new RelayHub()
    hub.broadcastEvent("desktop-1", { channel: "app://status", payload: { step: 1 } })
    hub.broadcastEvent("desktop-1", { channel: "app://status", payload: { step: 2 } })

    const socket = socketMock()

    hub.attachMobileSubscriber("desktop-1", socket, 1)

    expect(socket.send).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String((socket.send as any).mock.calls[0][0]))).toMatchObject({
      eventId: 2,
      channel: "app://status",
      payload: { step: 2 },
    })
  })

  it("returns replay miss metadata when subscriber checkpoint is outside the window", () => {
    const hub = new RelayHub({ replayWindowSize: 2 })
    hub.broadcastEvent("desktop-1", { channel: "app://status", payload: { step: 1 } })
    hub.broadcastEvent("desktop-1", { channel: "app://status", payload: { step: 2 } })
    hub.broadcastEvent("desktop-1", { channel: "app://status", payload: { step: 3 } })

    const socket = socketMock()
    const result = hub.attachMobileSubscriber("desktop-1", socket, 1)

    expect(result.replayMiss).toBe(true)
    expect(result.replayWindowStart).toBe(2)
    expect(result.lastEventId).toBe(3)
    expect(socket.send).toHaveBeenCalledTimes(2)
  })

  it("echoes local event ids in relay event frames", () => {
    const hub = new RelayHub()
    const frame = hub.broadcastEvent(
      "desktop-1",
      { channel: "acp://event", payload: { type: "delta" } },
      19
    )

    expect(frame.localEventId).toBe(19)
    expect(hub.getReplayFrames("desktop-1", 0)[0].localEventId).toBe(19)
  })

  it("broadcasts desktop events to multiple mobile subscribers", () => {
    const hub = new RelayHub()
    const first = socketMock()
    const second = socketMock()

    hub.attachMobileSubscriber("desktop-1", first, 0, {
      clientId: "client-a",
      sessionId: "session-a",
      targetId: "desktop-1",
      deviceName: "Phone",
    })
    hub.attachMobileSubscriber("desktop-1", second, 0, {
      clientId: "client-b",
      sessionId: "session-b",
      targetId: "desktop-1",
      deviceName: "Watch",
    })
    hub.broadcastEvent("desktop-1", {
      channel: "acp://event",
      payload: { type: "stream_batch", connectionId: "s1", data: { delta: "hi" } },
    })

    expect(first.send).toHaveBeenCalledTimes(1)
    expect(second.send).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String((first.send as any).mock.calls[0][0]))).toMatchObject({
      channel: "acp://event",
      payload: { type: "stream_batch" },
    })
    expect(JSON.parse(String((second.send as any).mock.calls[0][0]))).toMatchObject({
      channel: "acp://event",
      payload: { type: "stream_batch" },
    })
  })

  it("forwards client identity on proxy requests", async () => {
    const hub = new RelayHub()
    const desktop = socketMock()
    hub.registerDesktop("desktop-1", desktop, "Work Desktop")

    const promise = hub.sendProxyRequest(
      "desktop-1",
      "acp_prompt",
      { prompt: "hi" },
      10_000,
      {
        clientId: "client-phone",
        sessionId: "session-1",
        targetId: "desktop-1",
        deviceName: "Phone",
      }
    )

    const frame = JSON.parse(String((desktop.send as any).mock.calls[0][0]))
    expect(frame).toMatchObject({
      type: "proxy_request",
      command: "acp_prompt",
      clientId: "client-phone",
      client: {
        clientId: "client-phone",
        sessionId: "session-1",
        targetId: "desktop-1",
        deviceName: "Phone",
      },
    })

    hub.handleDesktopProxyResponse({ requestId: frame.requestId, ok: true, body: { ok: true } })
    await expect(promise).resolves.toMatchObject({ body: { ok: true } })
  })

  it("forwards raw tcp stream frames between mobile and desktop sockets", () => {
    const hub = new RelayHub()
    const desktop = socketMock()
    const mobile = socketMock()

    hub.registerDesktop("desktop-1", desktop, "Work Desktop")
    const streamId = hub.openTcpStream("desktop-1", 1080, mobile)

    expect(JSON.parse(String((desktop.send as any).mock.calls[0][0]))).toMatchObject({
      type: "tcp_connect",
      streamId,
      port: 1080,
    })

    hub.sendTcpData(streamId, Buffer.from("ping"))

    expect(JSON.parse(String((desktop.send as any).mock.calls[1][0]))).toMatchObject({
      type: "tcp_data",
      streamId,
      dataBase64: Buffer.from("ping").toString("base64"),
    })

    hub.handleDesktopTcpData({
      streamId,
      dataBase64: Buffer.from("pong").toString("base64"),
    })

    const mobilePayload = (mobile.send as any).mock.calls[0][0]
    expect(Buffer.isBuffer(mobilePayload)).toBe(true)
    expect(Buffer.from(mobilePayload).toString("utf8")).toBe("pong")

    hub.handleDesktopTcpClose({ streamId })
    expect(mobile.close).toHaveBeenCalled()
  })
})
