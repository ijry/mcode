import { resolveConnectionDriver } from "@/services/gateway/connectionDriverRegistry"
import { codegDirectDriver } from "@/agents/codeg/driver"

describe("connectionDriverRegistry", () => {
  it("resolves desktop gateway connections to the desktop gateway driver", () => {
    const driver = resolveConnectionDriver({
      version: 2,
      name: "Desktop Gateway",
      targetAgent: "mcode-desktop",
      routeMode: "gateway",
      gatewayProvider: "official",
      gatewayBaseUrl: "https://relay.example.com",
    })

    expect(driver.id).toBe("desktop-gateway")
  })

  it("keeps legacy codeg gateway records on the compatibility driver", () => {
    const driver = resolveConnectionDriver({
      version: 2,
      name: "Legacy Gateway",
      targetAgent: "codeg",
      routeMode: "gateway",
      gatewayProvider: "official",
      gatewayBaseUrl: "https://relay.example.com",
    })

    expect(driver.id).toBe("codeg-gateway-legacy")
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
})
