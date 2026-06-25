import { describe, expect, it, vi } from "vitest"
import WebSocket from "ws"
import { RelayHub } from "../src/tunnel/hub.js"

describe("RelayHub", () => {
  it("replays buffered events after the subscriber checkpoint", () => {
    const hub = new RelayHub()
    hub.broadcastEvent("desktop-1", { channel: "app://status", payload: { step: 1 } })
    hub.broadcastEvent("desktop-1", { channel: "app://status", payload: { step: 2 } })

    const socket = {
      readyState: WebSocket.OPEN,
      send: vi.fn(),
      on: vi.fn(),
    } as unknown as WebSocket

    hub.attachMobileSubscriber("desktop-1", socket, 1)

    expect(socket.send).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String((socket.send as any).mock.calls[0][0]))).toMatchObject({
      eventId: 2,
      channel: "app://status",
      payload: { step: 2 },
    })
  })
})
