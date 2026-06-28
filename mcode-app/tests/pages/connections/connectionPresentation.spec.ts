import {
  getConnectionBadgeText,
  getConnectionCapabilityChips,
  getConnectionProviderLabel,
  getConnectionRouteLabel,
  getConnectionSubtitle,
  getConnectionTargetLabel,
} from "@/pages/connections/connectionPresentation"

describe("connection presentation", () => {
  it("renders direct connection labels from target and route", () => {
    expect(getConnectionTargetLabel({ targetAgent: "codeg" } as any)).toBe("Codeg")
    expect(getConnectionTargetLabel({ targetAgent: "opencode" } as any)).toBe("OpenCode")
    expect(getConnectionRouteLabel({ routeMode: "direct" } as any)).toBe("直连")
    expect(getConnectionProviderLabel({ routeMode: "direct" } as any)).toBe("")
    expect(
      getConnectionSubtitle({
        targetAgent: "opencode",
        routeMode: "direct",
        directBaseUrl: "http://127.0.0.1:3089/",
      } as any)
    ).toBe("OpenCode · 直连 · http://127.0.0.1:3089")
  })

  it("renders gateway subtitles with provider context", () => {
    const subtitle = getConnectionSubtitle({
      targetAgent: "mcode-desktop",
      routeMode: "gateway",
      gatewayProvider: "official",
      gatewayBaseUrl: "https://relay.example.com",
    } as any)

    expect(getConnectionTargetLabel({ targetAgent: "mcode-desktop" } as any)).toBe("MCode Desktop")
    expect(getConnectionRouteLabel({ routeMode: "gateway" } as any)).toBe("网关")
    expect(getConnectionProviderLabel({ gatewayProvider: "official" } as any)).toBe("MCode 官方网关")
    expect(subtitle).toContain("MCode Desktop")
    expect(subtitle).toContain("网关")
    expect(subtitle).toContain("MCode 官方网关")
  })

  it("renders custom gateway subtitles with custom domain", () => {
    expect(
      getConnectionSubtitle({
        targetAgent: "mcode-desktop",
        routeMode: "gateway",
        gatewayProvider: "custom",
        gatewayBaseUrl: "https://relay.example.com/",
      } as any)
    ).toBe("MCode Desktop · 网关 · 自定义网关 · https://relay.example.com")
  })

  it("maps online state to badge text", () => {
    expect(getConnectionBadgeText(true)).toBe("CONNECTED")
    expect(getConnectionBadgeText(false)).toBe("OFFLINE")
  })

  it("exposes desktop capability chips from target metadata", () => {
    expect(
      getConnectionCapabilityChips({
        targetAgent: "mcode-desktop",
        targetProfile: {
          targetAgent: "mcode-desktop",
          capabilities: ["desktop.runtime.codex-cli", "desktop.tunnel.available"],
        },
      } as any)
    ).toEqual(["Codex CLI", "内网穿透"])
  })
})
