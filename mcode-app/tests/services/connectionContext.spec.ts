import { persistResolvedConnection } from "@/services/connectionContext"
import { buildConnectionRecordKey } from "@/services/connectionSchema"

describe("connectionContext", () => {
  it("upgrades legacy gateway records in place when pair metadata changes target agent", () => {
    const storedRecord = {
      version: 2 as const,
      name: "Legacy Gateway",
      targetAgent: "codeg" as const,
      routeMode: "gateway" as const,
      gatewayProvider: "official" as const,
      gatewayBaseUrl: "https://relay.example.com",
      gatewaySession: {
        accessToken: "legacy-access",
      },
    }

    uni.setStorageSync("mcode_connections", [storedRecord])

    persistResolvedConnection(
      {
        ...storedRecord,
        targetAgent: "mcode-desktop",
        gatewaySession: {
          accessToken: "next-access",
          refreshToken: "refresh-token",
          targetId: "desktop-1",
          targetAgent: "mcode-desktop",
          displayName: "Workstation",
          capabilities: ["desktop.runtime.codex-cli"],
          protocolVersion: "1",
        },
        targetProfile: {
          targetAgent: "mcode-desktop",
          targetId: "desktop-1",
          displayName: "Workstation",
          capabilities: ["desktop.runtime.codex-cli"],
          protocolVersion: "1",
        },
      },
      buildConnectionRecordKey(storedRecord)
    )

    const saved = uni.getStorageSync("mcode_connections")
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({
      version: 2,
      targetAgent: "mcode-desktop",
      routeMode: "gateway",
      gatewayBaseUrl: "https://relay.example.com",
      mode: "relay",
      url: "https://relay.example.com",
      targetProfile: {
        targetAgent: "mcode-desktop",
        targetId: "desktop-1",
        displayName: "Workstation",
        capabilities: ["desktop.runtime.codex-cli"],
        protocolVersion: "1",
      },
      gatewaySession: {
        accessToken: "next-access",
        refreshToken: "refresh-token",
        targetId: "desktop-1",
        targetAgent: "mcode-desktop",
        displayName: "Workstation",
        capabilities: ["desktop.runtime.codex-cli"],
        protocolVersion: "1",
      },
      relaySession: {
        accessToken: "next-access",
        refreshToken: "refresh-token",
        targetId: "desktop-1",
        targetAgent: "mcode-desktop",
        displayName: "Workstation",
        capabilities: ["desktop.runtime.codex-cli"],
        protocolVersion: "1",
      },
    })
  })
})
