import { buildDesktopServiceEntries } from "../../../src/agents/mcode-desktop/serviceDiscovery"

const desktopConnection = {
  targetAgent: "mcode-desktop" as const,
  routeMode: "gateway" as const,
  gatewayBaseUrl: "https://gateway.example.com/",
  gatewaySession: {
    accessToken: "access",
    targetId: "desktop-1",
  },
  targetProfile: {
    targetId: "desktop-1",
    capabilities: ["desktop.tunnel.available"],
  },
}

describe("desktop service discovery", () => {
  it("builds HTTP tunnel entries from discovered local services", () => {
    const entries = buildDesktopServiceEntries(desktopConnection as any, [
      { name: "Code", host: "127.0.0.1", port: 1080, protocol: "http", enabled: true },
    ])

    expect(entries).toEqual([
      expect.objectContaining({
        name: "Code",
        label: "Code",
        bind: "127.0.0.1:1080",
        protocol: "http",
        enabled: true,
        url: "https://gateway.example.com/v1/tunnel/desktop-1/1080/",
      }),
    ])
  })

  it("keeps TCP entries informational", () => {
    const entries = buildDesktopServiceEntries(desktopConnection as any, [
      { name: "Raw TCP", host: "127.0.0.1", port: 9000, protocol: "tcp", enabled: true },
    ])

    expect(entries[0]).toMatchObject({
      name: "Raw TCP",
      bind: "127.0.0.1:9000",
      protocol: "tcp",
      enabled: true,
      url: "https://gateway.example.com/v1/tunnel-tcp/desktop-1/9000",
    })
  })

  it("filters unsafe and duplicate service metadata", () => {
    const entries = buildDesktopServiceEntries(desktopConnection as any, [
      { name: "Unsafe", host: "0.0.0.0" as "127.0.0.1", port: 1080, protocol: "http", enabled: true },
      { name: "Code", host: "127.0.0.1", port: 1080, protocol: "http", enabled: true },
      { name: "Duplicate", host: "127.0.0.1", port: 1080, protocol: "http", enabled: true },
    ])

    expect(entries.map((entry) => entry.name)).toEqual(["Code"])
  })

  it("marks desktop-disabled services as unavailable", () => {
    const entries = buildDesktopServiceEntries(desktopConnection as any, [
      { name: "Code", host: "127.0.0.1", port: 1080, protocol: "http", enabled: false },
    ])

    expect(entries[0]).toMatchObject({
      enabled: false,
      reason: "服务已在 Desktop 端停用。",
    })
  })
})
