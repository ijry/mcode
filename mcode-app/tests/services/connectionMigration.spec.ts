import { migrateLegacyStoredConnectionsToV2 } from "@/services/connectionMigration"

describe("connectionMigration", () => {
  it("migrates legacy stored direct and relay connections only from the homepage migration boundary", () => {
    uni.setStorageSync("mcode_connections", [
      {
        name: "Legacy Direct",
        mode: "direct",
        url: "http://127.0.0.1:3089/",
        directToken: "token-1",
      },
      {
        name: "Legacy Relay",
        mode: "relay",
        url: "https://relay.example.com/",
        pairCode: "PAIR",
        pairSecret: "SECRET",
        relaySession: {
          accessToken: "access",
          refreshToken: "refresh",
          targetId: "target",
        },
      },
      {
        version: 2,
        name: "OpenCode Gateway",
        targetAgent: "opencode",
        routeMode: "gateway",
        gatewayProvider: "official",
        gatewayBaseUrl: "https://relay.example.com",
        pairCode: "OPEN",
        pairSecret: "SECRET",
      },
      { mode: "broken" },
    ])

    expect(migrateLegacyStoredConnectionsToV2()).toEqual({
      migrated: 2,
      dropped: 1,
      connections: [
        {
          version: 2,
          name: "Legacy Direct",
          targetAgent: "codeg",
          routeMode: "direct",
          directBaseUrl: "http://127.0.0.1:3089",
          directToken: "token-1",
        },
        {
          version: 2,
          name: "Legacy Relay",
          targetAgent: "codeg",
          routeMode: "gateway",
          gatewayProvider: "official",
          gatewayBaseUrl: "https://relay.example.com",
          pairCode: "PAIR",
          pairSecret: "SECRET",
          gatewaySession: {
            accessToken: "access",
            refreshToken: "refresh",
            targetId: "target",
          },
        },
        {
          version: 2,
          name: "OpenCode Gateway",
          targetAgent: "opencode",
          routeMode: "gateway",
          gatewayProvider: "official",
          gatewayBaseUrl: "https://relay.example.com",
          pairCode: "OPEN",
          pairSecret: "SECRET",
        },
      ],
    })

    expect(uni.getStorageSync("mcode_connections")).toEqual([
      expect.objectContaining({ version: 2, targetAgent: "codeg", routeMode: "direct" }),
      expect.objectContaining({ version: 2, targetAgent: "codeg", routeMode: "gateway" }),
      expect.objectContaining({ version: 2, targetAgent: "opencode", routeMode: "gateway" }),
    ])
  })
})
