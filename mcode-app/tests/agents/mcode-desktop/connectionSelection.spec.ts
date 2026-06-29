import {
  buildDesktopConnectionOptions,
  chooseDesktopConnection,
} from "../../../src/agents/mcode-desktop/connectionSelection"

function desktop(overrides: Record<string, unknown> = {}) {
  return {
    version: 2,
    name: "Desktop",
    targetAgent: "mcode-desktop",
    routeMode: "gateway",
    gatewayProvider: "official",
    gatewayBaseUrl: "https://relay.example.com",
    gatewaySession: {
      accessToken: "access",
      targetId: "desktop-1",
      displayName: "Desktop 1",
    },
    targetProfile: {
      targetAgent: "mcode-desktop",
      targetId: "desktop-1",
      displayName: "Desktop 1",
    },
    mode: "relay",
    url: "https://relay.example.com",
    ...overrides,
  }
}

describe("desktop connection selection", () => {
  it("builds options only for desktop gateway connections", () => {
    const options = buildDesktopConnectionOptions([
      desktop() as any,
      desktop({ targetAgent: "codeg" }) as any,
      desktop({ routeMode: "direct", directBaseUrl: "http://127.0.0.1:3000" }) as any,
    ])

    expect(options).toHaveLength(1)
    expect(options[0]).toMatchObject({
      label: "Desktop 1",
      subtitle: "https://relay.example.com",
      targetId: "desktop-1",
      paired: true,
    })
    expect(options[0].key).toBe("mcode-desktop::gateway::https://relay.example.com")
  })

  it("restores the preferred option when it still exists", () => {
    const options = buildDesktopConnectionOptions([
      desktop({ gatewayBaseUrl: "https://a.example.com", gatewaySession: null, targetProfile: null, name: "Desktop A" }) as any,
      desktop({ gatewayBaseUrl: "https://b.example.com", gatewaySession: null, targetProfile: null, name: "Desktop B" }) as any,
    ])

    expect(chooseDesktopConnection(options, "mcode-desktop::gateway::https://b.example.com")?.label).toBe("Desktop B")
  })

  it("prefers paired options when no preferred key exists", () => {
    const options = buildDesktopConnectionOptions([
      desktop({ gatewayBaseUrl: "https://a.example.com", gatewaySession: null, targetProfile: null, name: "Unpaired" }) as any,
      desktop({
        gatewayBaseUrl: "https://b.example.com",
        name: "Paired",
        gatewaySession: { accessToken: "access", targetId: "desktop-b", displayName: "Paired" },
        targetProfile: { targetAgent: "mcode-desktop", targetId: "desktop-b", displayName: "Paired" },
      }) as any,
    ])

    expect(chooseDesktopConnection(options, "")?.label).toBe("Paired")
  })

  it("falls back to the first unpaired desktop gateway", () => {
    const options = buildDesktopConnectionOptions([
      desktop({ gatewaySession: null, targetProfile: null, name: "Unpaired" }) as any,
    ])

    expect(chooseDesktopConnection(options, "missing")?.label).toBe("Unpaired")
  })
})
