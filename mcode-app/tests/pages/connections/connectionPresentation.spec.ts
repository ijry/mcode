import {
  getConnectionBadgeText,
  getConnectionModeLabel,
  getConnectionSubtitle,
} from "@/pages/connections/connectionPresentation"

describe("connection presentation", () => {
  it("formats the two connection mode labels", () => {
    expect(getConnectionModeLabel("direct")).toBe("直连模式")
    expect(getConnectionModeLabel("relay")).toBe("中继模式")
  })

  it("formats the subtitle from mode and url", () => {
    expect(getConnectionSubtitle("direct", "http://127.0.0.1:3089")).toBe(
      "直连模式 · http://127.0.0.1:3089"
    )
    expect(getConnectionSubtitle("relay", "https://relay.example.com")).toBe(
      "中继模式 · https://relay.example.com"
    )
  })

  it("maps online state to badge text", () => {
    expect(getConnectionBadgeText(true)).toBe("CONNECTED")
    expect(getConnectionBadgeText(false)).toBe("OFFLINE")
  })
})
