import {
  buildDesktopReadinessDiagnosticText,
  buildDesktopReadinessSummary,
} from "../../../src/agents/mcode-desktop/readiness"

const healthyConnection = {
  name: "Work Desktop",
  targetAgent: "mcode-desktop" as const,
  routeMode: "gateway" as const,
  gatewayBaseUrl: "https://relay.example.com",
  gatewaySession: {
    accessToken: "secret-access-token",
    refreshToken: "secret-refresh-token",
    targetId: "desktop-1",
    displayName: "Desktop A",
    capabilities: ["desktop.runtime.codex-cli", "desktop.runtime.claude-cli", "desktop.tunnel.available"],
    protocolVersion: "2",
  },
  targetProfile: {
    targetId: "desktop-1",
    displayName: "Desktop A",
    capabilities: ["desktop.runtime.codex-cli", "desktop.runtime.claude-cli", "desktop.tunnel.available"],
    protocolVersion: "2",
  },
}

describe("desktop readiness", () => {
  it("builds a ready summary from paired desktop metadata and services", () => {
    const summary = buildDesktopReadinessSummary(healthyConnection as any, [
      {
        name: "Code",
        label: "Code",
        host: "127.0.0.1",
        port: 1080,
        bind: "127.0.0.1:1080",
        protocol: "http",
        enabled: true,
        url: "https://relay.example.com/v1/tunnel/desktop-1/1080/",
      },
      {
        name: "TCP",
        label: "TCP",
        host: "127.0.0.1",
        port: 9000,
        bind: "127.0.0.1:9000",
        protocol: "tcp",
        enabled: false,
        url: "",
        reason: "disabled",
      },
    ])

    expect(summary).toMatchObject({
      level: "ready",
      title: "Desktop 网关已就绪",
      displayName: "Desktop A",
      gatewayBaseUrl: "https://relay.example.com",
      targetId: "desktop-1",
      protocolVersion: "2",
      serviceCounts: {
        total: 2,
        enabled: 1,
        http: 1,
        tcp: 1,
      },
    })
    expect(summary.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Codex CLI", available: true }),
        expect.objectContaining({ label: "Claude CLI", available: true }),
        expect.objectContaining({ label: "内网穿透", available: true }),
      ])
    )
  })

  it("reports missing desktop connection as an actionable error", () => {
    const summary = buildDesktopReadinessSummary(null, [])

    expect(summary.level).toBe("error")
    expect(summary.diagnostics[0]).toMatchObject({
      code: "desktop.connection.missing",
      level: "error",
    })
  })

  it("surfaces warnings for unpaired or capability-missing desktop records", () => {
    const summary = buildDesktopReadinessSummary({
      name: "Desktop",
      targetAgent: "mcode-desktop",
      routeMode: "gateway",
      gatewayBaseUrl: "https://relay.example.com",
      gatewaySession: null,
      targetProfile: null,
    } as any)

    expect(summary.level).toBe("warning")
    expect(summary.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(["desktop.gateway.unpaired", "desktop.capabilities.missing"])
    )
  })

  it("copies only non-secret diagnostic metadata", () => {
    const summary = buildDesktopReadinessSummary(healthyConnection as any, [])
    const text = buildDesktopReadinessDiagnosticText(summary)

    expect(text).toContain("targetId: desktop-1")
    expect(text).toContain("gatewayBaseUrl: https://relay.example.com")
    expect(text).not.toContain("secret-access-token")
    expect(text).not.toContain("secret-refresh-token")
  })
})
