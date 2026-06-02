import { describe, expect, it, vi } from "vitest"

import { WebEventStream } from "./web-event-stream"

function createHost(initiallyOpen = true) {
  let open = initiallyOpen
  let readyCallback: (() => void) | null = null
  const sent: object[] = []

  return {
    sent,
    setOpen(next: boolean) {
      open = next
    },
    fireReady() {
      readyCallback?.()
    },
    host: {
      isWsOpen: () => open,
      sendFrame: (frame: object) => {
        sent.push(frame)
        return true
      },
      onWsReady: (callback: () => void) => {
        readyCallback = callback
        return () => {
          if (readyCallback === callback) {
            readyCallback = null
          }
        }
      },
    },
  }
}

describe("WebEventStream", () => {
  it("attaches multiple subscriptions over a single WS host", () => {
    const { host, sent } = createHost(true)
    const stream = new WebEventStream(host)

    stream.attach("conn-a", { sinceSeq: 1 }, {
      onSnapshot: vi.fn(),
      onReplay: vi.fn(),
      onEvent: vi.fn(),
      onDetached: vi.fn(),
    })
    stream.attach("conn-b", { sinceSeq: 8 }, {
      onSnapshot: vi.fn(),
      onReplay: vi.fn(),
      onEvent: vi.fn(),
      onDetached: vi.fn(),
    })

    expect(sent).toHaveLength(2)
    expect(sent[0]).toMatchObject({
      action: "attach",
      connection_id: "conn-a",
      since_seq: 1,
    })
    expect(sent[1]).toMatchObject({
      action: "attach",
      connection_id: "conn-b",
      since_seq: 8,
    })
  })

  it("re-attaches live subscriptions when the host becomes ready again", () => {
    const { host, sent, setOpen, fireReady } = createHost(false)
    const stream = new WebEventStream(host)

    stream.attach("conn-a", { sinceSeq: 3 }, {
      onSnapshot: vi.fn(),
      onReplay: vi.fn(),
      onEvent: vi.fn(),
      onDetached: vi.fn(),
    })
    stream.attach("conn-b", {}, {
      onSnapshot: vi.fn(),
      onReplay: vi.fn(),
      onEvent: vi.fn(),
      onDetached: vi.fn(),
    })

    expect(sent).toHaveLength(0)

    setOpen(true)
    fireReady()

    expect(sent).toHaveLength(2)
    expect(sent[0]).toMatchObject({
      action: "attach",
      connection_id: "conn-a",
      since_seq: 3,
    })
    expect(sent[1]).toMatchObject({
      action: "attach",
      connection_id: "conn-b",
      since_seq: undefined,
    })
  })
})
