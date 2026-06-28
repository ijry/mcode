import { resolveConnectionDriver } from "@/services/gateway/connectionDriverRegistry"
import { codegDirectDriver } from "@/agents/codeg/driver"

describe("connectionDriverRegistry", () => {
  it("resolves gateway agents independently", () => {
    expect(resolveConnectionDriver({
      version: 2,
      name: "Codeg Gateway",
      targetAgent: "codeg",
      routeMode: "gateway",
      gatewayProvider: "official",
      gatewayBaseUrl: "https://relay.example.com",
    }).id).toBe("codeg-gateway")

    expect(resolveConnectionDriver({
      version: 2,
      name: "OpenCode Gateway",
      targetAgent: "opencode",
      routeMode: "gateway",
      gatewayProvider: "official",
      gatewayBaseUrl: "https://relay.example.com",
    }).id).toBe("opencode-gateway")

    expect(resolveConnectionDriver({
      version: 2,
      name: "Desktop Gateway",
      targetAgent: "mcode-desktop",
      routeMode: "gateway",
      gatewayProvider: "official",
      gatewayBaseUrl: "https://relay.example.com",
    }).id).toBe("desktop-gateway")
  })

  it("resolves direct agents independently", () => {
    expect(
      resolveConnectionDriver({
        version: 2,
        name: "OpenCode",
        targetAgent: "opencode",
        routeMode: "direct",
        directBaseUrl: "http://127.0.0.1:3089",
      }).id
    ).toBe("opencode-direct")

    expect(
      resolveConnectionDriver({
        version: 2,
        name: "Desktop",
        targetAgent: "mcode-desktop",
        routeMode: "direct",
        directBaseUrl: "http://127.0.0.1:1080",
      }).id
    ).toBe("desktop-direct")
  })

  it("keeps direct driver instance keys aligned with the gateway descriptor", async () => {
    const resolved = await codegDirectDriver.connect({
      version: 2,
      name: "Local Codeg",
      targetAgent: "codeg",
      routeMode: "direct",
      directBaseUrl: "http://127.0.0.1:3089",
      directToken: "direct-token-1234567890",
    })

    expect(resolved.instanceKey).toBe(resolved.gateway.getRemoteInstanceDescriptor().instanceKey)
  })

  it("rejects gateway re-pair responses for a different target agent", async () => {
    ;(uni.request as jest.Mock).mockResolvedValue({
      statusCode: 200,
      data: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        target: {
          targetId: "desktop-1",
          targetAgent: "mcode-desktop",
          displayName: "Desktop",
        },
      },
    })

    await expect(
      resolveConnectionDriver({
        version: 2,
        name: "OpenCode Gateway",
        targetAgent: "opencode",
        routeMode: "gateway",
        gatewayProvider: "official",
        gatewayBaseUrl: "https://relay.example.com",
        pairCode: "OPEN-1234",
        pairSecret: "pair-secret",
      }).connect({
        version: 2,
        name: "OpenCode Gateway",
        targetAgent: "opencode",
        routeMode: "gateway",
        gatewayProvider: "official",
        gatewayBaseUrl: "https://relay.example.com",
        pairCode: "OPEN-1234",
        pairSecret: "pair-secret",
      })
    ).rejects.toThrow("配对码属于 MCode Desktop，不是 OpenCode")
  })
})
