import {
  buildConnectionKey,
  buildDescriptorFromStoredConnection,
  findStoredConnectionByKey,
  normalizeConnectionUrl,
  normalizeStoredConnectionLike,
  resolveStoredConnectionTargetAgent,
} from "@/pages/conversation-detail/detailConnectionResolution"

describe("detailConnectionResolution", () => {
  it("normalizes connection urls and builds stable keys", () => {
    expect(normalizeConnectionUrl(" https://host/// ")).toBe("https://host")
    expect(buildConnectionKey("direct", " https://host/// ")).toBe("direct::https://host")
  })

  it("normalizes stored direct and relay connections defensively", () => {
    expect(normalizeStoredConnectionLike({ mode: "direct", url: " https://host/ ", directToken: " token " }))
      .toEqual({
        mode: "direct",
        url: "https://host",
        directToken: "token",
        pairCode: undefined,
        pairSecret: undefined,
        relaySession: undefined,
      })

    expect(normalizeStoredConnectionLike({
      mode: "relay",
      url: "https://relay/",
      relaySession: {
        accessToken: " access ",
        refreshToken: " refresh ",
        targetId: " target ",
      },
    })).toEqual({
      mode: "relay",
      url: "https://relay",
      directToken: undefined,
      pairCode: undefined,
      pairSecret: undefined,
      relaySession: {
        accessToken: "access",
        refreshToken: "refresh",
        targetId: "target",
      },
    })

    expect(normalizeStoredConnectionLike({ mode: "other", url: "https://host" })).toBeNull()
    expect(normalizeStoredConnectionLike({ mode: "direct", url: " " })).toBeNull()
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
      gatewaySession: {
        accessToken: "access",
        refreshToken: "refresh",
        targetId: "target",
        targetAgent: "codeg",
        capabilities: ["prompt.attachments"],
      },
      targetProfile: {
        targetAgent: "codeg",
        displayName: "Workstation",
      },
      mode: "relay",
      url: "https://relay.example",
      directToken: undefined,
      pairCode: undefined,
      pairSecret: undefined,
      relaySession: {
        accessToken: "access",
        refreshToken: "refresh",
        targetId: "target",
        targetAgent: "codeg",
        capabilities: ["prompt.attachments"],
      },
    })
  })

  it("finds stored connections by normalized key", () => {
    const saved = [
      { mode: "direct", url: "https://one" },
      {
        version: 2,
        name: "Codeg Gateway",
        targetAgent: "codeg",
        routeMode: "gateway",
        gatewayBaseUrl: "https://relay",
        gatewaySession: { accessToken: "access", targetId: "target" },
      },
      { mode: "relay", url: "https://relay///", relaySession: { targetId: "target" } },
    ]

    expect(findStoredConnectionByKey(saved, "codeg::gateway::https://relay")).toEqual(expect.objectContaining({
      version: 2,
      targetAgent: "codeg",
      routeMode: "gateway",
      mode: "relay",
      url: "https://relay",
    }))

    expect(findStoredConnectionByKey(saved, "relay::https://relay")).toEqual({
      mode: "relay",
      url: "https://relay",
      directToken: undefined,
      pairCode: undefined,
      pairSecret: undefined,
      relaySession: {
        accessToken: undefined,
        refreshToken: undefined,
        targetId: "target",
      },
    })
    expect(findStoredConnectionByKey(saved, "direct::https://missing")).toBeNull()
    expect(findStoredConnectionByKey({}, "relay::https://relay")).toBeNull()
  })

  it("resolves target agent with legacy Codeg defaults", () => {
    expect(resolveStoredConnectionTargetAgent({
      mode: "relay",
      url: "https://relay",
    })).toBe("codeg")

    expect(resolveStoredConnectionTargetAgent({
      version: 2,
      name: "OpenCode",
      targetAgent: "opencode",
      routeMode: "direct",
      directBaseUrl: "https://opencode",
      mode: "direct",
      url: "https://opencode",
    })).toBe("opencode")
  })

  it("builds direct descriptors with explicit or fallback tokens", () => {
    expect(buildDescriptorFromStoredConnection({
      mode: "direct",
      url: "https://host/",
    }, "fallback-token-1234567890")).toEqual({
      instanceKey: "direct::https://host::direct:fallback-token-1",
      mode: "direct",
      baseUrl: "https://host",
      principal: "direct:fallback-token-1",
      authToken: "fallback-token-1234567890",
    })

    expect(buildDescriptorFromStoredConnection({
      mode: "direct",
      url: "https://host",
      directToken: "inline-token",
    }, "fallback-token")).toEqual(expect.objectContaining({
      principal: "direct:inline-token",
      authToken: "inline-token",
    }))
  })

  it("builds relay descriptors from target, refresh, or access token", () => {
    expect(buildDescriptorFromStoredConnection({
      mode: "relay",
      url: "https://relay/",
      relaySession: {
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
      mode: "relay",
      url: "https://relay",
      relaySession: {
        refreshToken: "refresh",
      },
    })).toEqual(expect.objectContaining({
      principal: "refresh",
      authToken: undefined,
      refreshToken: "refresh",
    }))
  })
})
