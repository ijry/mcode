import { getSessionDetailEventKey } from "@/pages/session-detail/sessionDetailBodyContract"

describe("sessionDetailBodyContract", () => {
  it("uses event time when present", () => {
    expect(getSessionDetailEventKey({ time: 123 }, 5)).toBe("123")
  })

  it("uses string timestamps without coercion loss", () => {
    expect(getSessionDetailEventKey({ time: "evt-1" }, 0)).toBe("evt-1")
  })

  it("falls back to the render index when time is missing", () => {
    expect(getSessionDetailEventKey({ type: "sent" }, 7)).toBe("7")
  })
})
