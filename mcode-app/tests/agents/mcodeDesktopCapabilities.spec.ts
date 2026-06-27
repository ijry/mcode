import {
  buildDesktopTunnelEntry,
  DESKTOP_CAPABILITY_CODEX,
  DESKTOP_CAPABILITY_TUNNEL,
  diagnoseDesktopGatewayConnection,
  getDesktopCapabilityLabels,
  hasDesktopCapability,
} from "@/agents/mcode-desktop/capabilities"
import type { ConnectionRecordV2 } from "@/services/connectionSchema"

function desktopConnection(
  input: Partial<ConnectionRecordV2> = {}
): ConnectionRecordV2 {
  return {
    version: 2,
    name: "Desktop",
    targetAgent: "mcode-desktop",
    routeMode: "gateway",
    gatewayProvider: "official",
    gatewayBaseUrl: "https://gateway.example.com",
    gatewaySession: {
      accessToken: "access",
      targetId: "desktop-1",
    },
    targetProfile: {
      targetAgent: "mcode-desktop",
      targetId: "desktop-1",
      capabilities: [DESKTOP_CAPABILITY_TUNNEL, DESKTOP_CAPABILITY_CODEX],
    },
    ...input,
  }
}

describe("mcode desktop capabilities", () => {
  it("maps desktop capabilities to stable labels", () => {
    expect(
      getDesktopCapabilityLabels([
        DESKTOP_CAPABILITY_TUNNEL,
        DESKTOP_CAPABILITY_CODEX,
        "desktop.unknown",
        DESKTOP_CAPABILITY_CODEX,
      ])
    ).toEqual(["内网穿透", "Codex CLI"])
  })

  it("gates desktop capabilities by target agent", () => {
    expect(hasDesktopCapability(desktopConnection(), DESKTOP_CAPABILITY_TUNNEL)).toBe(true)
    expect(
      hasDesktopCapability(
        {
          targetAgent: "codeg",
          targetProfile: { targetAgent: "codeg", capabilities: [DESKTOP_CAPABILITY_TUNNEL] },
        },
        DESKTOP_CAPABILITY_TUNNEL
      )
    ).toBe(false)
  })

  it("diagnoses incomplete desktop gateway connections", () => {
    const diagnostics = diagnoseDesktopGatewayConnection(
      desktopConnection({
        gatewayBaseUrl: "",
        gatewaySession: null,
        targetProfile: null,
      })
    )

    expect(diagnostics.map((item) => item.code)).toEqual([
      "desktop.gateway.missing_base_url",
      "desktop.gateway.unpaired",
      "desktop.capabilities.missing",
    ])
  })

  it("builds HTTP and TCP tunnel entries only when gateway capability exists", () => {
    const http = buildDesktopTunnelEntry({
      connection: desktopConnection(),
      label: "Code",
      port: 1080,
      protocol: "http",
      path: "preview",
    })
    const tcp = buildDesktopTunnelEntry({
      connection: desktopConnection(),
      port: 2222,
      protocol: "tcp",
    })
    const disabled = buildDesktopTunnelEntry({
      connection: desktopConnection({
        targetProfile: {
          targetAgent: "mcode-desktop",
          targetId: "desktop-1",
          capabilities: [],
        },
      }),
      port: 1080,
    })

    expect(http).toMatchObject({
      enabled: true,
      url: "https://gateway.example.com/v1/tunnel/desktop-1/1080/preview",
    })
    expect(tcp).toMatchObject({
      enabled: true,
      url: "https://gateway.example.com/v1/tunnel-tcp/desktop-1/2222",
    })
    expect(disabled.enabled).toBe(false)
    expect(disabled.reason).toContain("内网穿透")
  })
})
