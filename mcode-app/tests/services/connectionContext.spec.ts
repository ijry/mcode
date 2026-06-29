import {
  applyPairMetadata,
  buildConnectionKey,
  connectionKeyMatches,
  isConnectionMarkedConnected,
  persistResolvedConnection,
} from "@/services/connectionContext"
import { buildConnectionRecordKey } from "@/services/connectionSchema"

describe("connectionContext", () => {
  it("applies pair target metadata to session and target profile", () => {
    const connection = {
      version: 2 as const,
      name: "Desktop Gateway",
      targetAgent: "mcode-desktop" as const,
      routeMode: "gateway" as const,
      gatewayProvider: "official" as const,
      gatewayBaseUrl: "https://relay.example.com",
    }

    expect(
      applyPairMetadata(
        connection as any,
        {
          accessToken: "access-token",
          refreshToken: "refresh-token",
        },
        {
          targetId: "desktop-1",
          targetAgent: "mcode-desktop",
          displayName: "Workstation",
          capabilities: ["desktop.runtime.codex-cli", "desktop.tunnel.available"],
          protocolVersion: "1",
        }
      )
    ).toMatchObject({
      targetAgent: "mcode-desktop",
      gatewaySession: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        targetId: "desktop-1",
        targetAgent: "mcode-desktop",
        displayName: "Workstation",
        capabilities: ["desktop.runtime.codex-cli", "desktop.tunnel.available"],
        protocolVersion: "1",
      },
      targetProfile: {
        targetAgent: "mcode-desktop",
        targetId: "desktop-1",
        displayName: "Workstation",
        capabilities: ["desktop.runtime.codex-cli", "desktop.tunnel.available"],
        protocolVersion: "1",
      },
    })
  })

  it("rejects pair metadata for a different target agent", () => {
    const connection = {
      version: 2 as const,
      name: "OpenCode Gateway",
      targetAgent: "opencode" as const,
      routeMode: "gateway" as const,
      gatewayProvider: "official" as const,
      gatewayBaseUrl: "https://relay.example.com",
    }

    expect(() =>
      applyPairMetadata(
        connection as any,
        { accessToken: "access-token" },
        { targetAgent: "mcode-desktop" }
      )
    ).toThrow("配对码属于 MCode Desktop，不是 OpenCode")
  })

  it("updates v2 gateway records in place when pair metadata refreshes target profile", () => {
    const storedRecord = {
      version: 2 as const,
      name: "Desktop Gateway",
      targetAgent: "mcode-desktop" as const,
      routeMode: "gateway" as const,
      gatewayProvider: "official" as const,
      gatewayBaseUrl: "https://relay.example.com",
      gatewaySession: {
        accessToken: "old-access",
      },
    }

    uni.setStorageSync("mcode_connections", [storedRecord])

    persistResolvedConnection(
      {
        ...storedRecord,
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
    })
  })

  it("matches only v2 keys for connected-map state", () => {
    const connection = {
      version: 2 as const,
      name: "OpenCode Gateway",
      targetAgent: "opencode" as const,
      routeMode: "gateway" as const,
      gatewayProvider: "custom" as const,
      gatewayBaseUrl: "https://relay.example.com/",
      gatewaySession: {
        accessToken: "access-token",
      },
    }

    expect(buildConnectionKey(connection)).toBe("opencode::gateway::https://relay.example.com")
    expect(connectionKeyMatches(connection, "opencode::gateway::https://relay.example.com")).toBe(true)
    expect(connectionKeyMatches(connection, "relay::https://relay.example.com")).toBe(false)
    expect(isConnectionMarkedConnected(connection, {
      "relay::https://relay.example.com": true,
    })).toBe(false)
    expect(isConnectionMarkedConnected(connection, {
      "opencode::gateway::https://relay.example.com": true,
    })).toBe(true)
  })
})
