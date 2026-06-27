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
