import {
  getConversationOverviewConnections,
  hasConversationOverviewConnections,
} from "@/pages/conversations/overviewState"

describe("conversation overview state", () => {
  it("returns the saved overview connections regardless of connected map state", () => {
    uni.setStorageSync("mcode_connections", [
      {
        version: 2,
        name: "Desktop",
        targetAgent: "mcode-desktop",
        routeMode: "gateway",
        gatewayProvider: "official",
        gatewayBaseUrl: "https://relay.example.com",
      },
    ])
    uni.setStorageSync("mcode_connected_map", {})

    expect(getConversationOverviewConnections()).toEqual([
      expect.objectContaining({
        name: "Desktop",
        targetAgent: "mcode-desktop",
      }),
    ])
  })

  it("treats any stored connection as enough to leave the empty state", () => {
    uni.setStorageSync("mcode_connections", [
      {
        version: 2,
        name: "Desktop",
        targetAgent: "mcode-desktop",
        routeMode: "gateway",
        gatewayProvider: "official",
        gatewayBaseUrl: "https://relay.example.com",
      },
    ])

    expect(hasConversationOverviewConnections()).toBe(true)
  })

  it("returns false when no connections are stored", () => {
    uni.setStorageSync("mcode_connections", [])

    expect(hasConversationOverviewConnections()).toBe(false)
  })
})
