import {
  buildDescriptorFromStoredConnection,
  findStoredConnectionByKey,
  normalizeConnectionUrl,
  normalizeStoredConnectionLike,
  resolveStoredConnectionTargetAgent,
} from "@/pages/conversation-detail/detailConnectionResolution"

describe("detailConnectionResolution", () => {
  it("normalizes connection urls", () => {
    expect(normalizeConnectionUrl(" https://host/// ")).toBe("https://host")
  })

  it("rejects legacy stored connection shapes outside the homepage migration", () => {
    expect(normalizeStoredConnectionLike({ mode: "direct", url: "https://host", directToken: "token" }))
      .toBeNull()
    expect(normalizeStoredConnectionLike({ mode: "relay", url: "https://relay" })).toBeNull()
  })

  it("normalizes v2 connection context and preserves target agent metadata", () => {
    expect(normalizeStoredConnectionLike({
      version: 2,
      name: "Gateway Codeg",
      targetAgent: "codeg",
      routeMode: "gateway",
      gatewayProvider: "official",
      gatewayBaseUrl: " https://relay.example/ ",
      gatewaySession: {
        accessToken: " access ",
        refreshToken: " refresh ",
        targetId: " target ",
        targetAgent: "codeg",
        capabilities: ["prompt.attachments"],
      },
      targetProfile: {
        targetAgent: "codeg",
        displayName: "Workstation",
      },
    })).toEqual({
      version: 2,
      name: "Gateway Codeg",
      targetAgent: "codeg",
      routeMode: "gateway",
      gatewayProvider: "official",
      gatewayBaseUrl: "https://relay.example",
      directToken: undefined,
      pairCode: undefined,
      pairSecret: undefined,
      gatewaySession: {
        accessToken: "access",
        refreshToken: "refresh",
        targetId: "target",
        targetAgent: "codeg",
        displayName: undefined,
        capabilities: ["prompt.attachments"],
        protocolVersion: undefined,
      },
      targetProfile: {
        targetAgent: "codeg",
        displayName: "Workstation",
      },
    })
  })

  it("finds stored connections by v2 key only", () => {
    const saved = [
      {
        version: 2,
        name: "Codeg Direct",
        targetAgent: "codeg",
        routeMode: "direct",
        directBaseUrl: "https://one",
      },
      {
        version: 2,
        name: "Codeg Gateway",
        targetAgent: "codeg",
        routeMode: "gateway",
        gatewayBaseUrl: "https://relay",
        gatewaySession: { accessToken: "access", targetId: "target" },
      },
    ]

    expect(findStoredConnectionByKey(saved, "codeg::gateway::https://relay")).toEqual(expect.objectContaining({
      version: 2,
      targetAgent: "codeg",
      routeMode: "gateway",
      gatewayBaseUrl: "https://relay",
    }))

    expect(findStoredConnectionByKey(saved, "relay::https://relay")).toBeNull()
    expect(findStoredConnectionByKey({}, "codeg::gateway::https://relay")).toBeNull()
  })

  it("resolves target agent with Codeg fallback for missing metadata", () => {
    expect(resolveStoredConnectionTargetAgent(null)).toBe("codeg")

    expect(resolveStoredConnectionTargetAgent({
      targetAgent: "opencode",
    })).toBe("opencode")
  })

  it("builds direct descriptors with explicit or fallback tokens", () => {
    expect(buildDescriptorFromStoredConnection({
      version: 2,
      name: "Codeg Direct",
      targetAgent: "codeg",
      routeMode: "direct",
      directBaseUrl: "https://host/",
    }, "fallback-token-1234567890")).toEqual({
      instanceKey: "direct::https://host::direct:fallback-token-1",
      mode: "direct",
      baseUrl: "https://host",
      principal: "direct:fallback-token-1",
      authToken: "fallback-token-1234567890",
    })

    expect(buildDescriptorFromStoredConnection({
      version: 2,
      name: "Codeg Direct",
      targetAgent: "codeg",
      routeMode: "direct",
      directBaseUrl: "https://host",
      directToken: "inline-token",
    }, "fallback-token")).toEqual(expect.objectContaining({
      principal: "direct:inline-token",
      authToken: "inline-token",
    }))
  })

  it("builds gateway descriptors from target, refresh, or access token", () => {
    expect(buildDescriptorFromStoredConnection({
      version: 2,
      name: "Codeg Gateway",
      targetAgent: "codeg",
      routeMode: "gateway",
      gatewayProvider: "official",
      gatewayBaseUrl: "https://relay/",
      gatewaySession: {
        accessToken: "access",
        refreshToken: "refresh",
        targetId: "target",
      },
    })).toEqual({
      instanceKey: "relay::https://relay::target",
      mode: "relay",
      baseUrl: "https://relay",
      principal: "target",
      authToken: "access",
      refreshToken: "refresh",
    })

    expect(buildDescriptorFromStoredConnection({
      version: 2,
      name: "Codeg Gateway",
      targetAgent: "codeg",
      routeMode: "gateway",
      gatewayProvider: "official",
      gatewayBaseUrl: "https://relay",
      gatewaySession: {
        refreshToken: "refresh",
      },
    })).toEqual(expect.objectContaining({
      principal: "refresh",
      authToken: undefined,
      refreshToken: "refresh",
    }))
  })
})
