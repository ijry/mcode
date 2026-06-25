import {
  buildConnectionConfigCode,
  decodeConnectionConfigCode,
  parseConnectionConfigCodeToConnection,
} from "@/pages/connections/connectionConfigCode"

describe("connection config code", () => {
  it("encodes legacy direct connections into v2 config codes", () => {
    const code = buildConnectionConfigCode({
      name: "Local Codeg",
      mode: "direct",
      url: "http://192.168.1.8:3089/",
      directToken: "direct-token",
    })

    expect(decodeConnectionConfigCode(code)).toEqual({
      version: 2,
      name: "Local Codeg",
      targetAgent: "codeg",
      routeMode: "direct",
      directBaseUrl: "http://192.168.1.8:3089",
      directToken: "direct-token",
    })
  })

  it("encodes and decodes v2 desktop gateway config codes", () => {
    const code = buildConnectionConfigCode({
      name: "Desk Relay",
      targetAgent: "mcode-desktop",
      routeMode: "gateway",
      gatewayProvider: "official",
      gatewayBaseUrl: "https://relay.example.com/",
      pairCode: "ABCD-1234",
      pairSecret: "pair-secret",
    })

    expect(parseConnectionConfigCodeToConnection(code)).toEqual({
      version: 2,
      name: "Desk Relay",
      targetAgent: "mcode-desktop",
      routeMode: "gateway",
      gatewayProvider: "official",
      gatewayBaseUrl: "https://relay.example.com",
      pairCode: "ABCD-1234",
      pairSecret: "pair-secret",
      mode: "relay",
      url: "https://relay.example.com",
      relaySession: undefined,
    })
  })

  it("migrates legacy v1 direct config codes on import", () => {
    const code = Buffer.from(
      JSON.stringify({
        version: 1,
        name: "Legacy Direct",
        mode: "direct",
        directBaseUrl: "http://192.168.1.8:3089/",
        directToken: "direct-token",
      }),
      "utf8"
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "")

    expect(parseConnectionConfigCodeToConnection(code)).toEqual({
      version: 2,
      name: "Legacy Direct",
      targetAgent: "codeg",
      routeMode: "direct",
      directBaseUrl: "http://192.168.1.8:3089",
      directToken: "direct-token",
      mode: "direct",
      url: "http://192.168.1.8:3089",
      relaySession: undefined,
    })
  })

  it("migrates legacy v1 relay config codes on import", () => {
    const code = Buffer.from(
      JSON.stringify({
        version: 1,
        name: "Relay Box",
        mode: "relay",
        relayUrl: "https://relay.example.com/",
        relaySession: {
          accessToken: "access-token",
          refreshToken: "refresh-token",
          targetId: "target-id",
        },
      }),
      "utf8"
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "")

    expect(parseConnectionConfigCodeToConnection(code)).toEqual({
      version: 2,
      name: "Relay Box",
      targetAgent: "codeg",
      routeMode: "gateway",
      gatewayProvider: "official",
      gatewayBaseUrl: "https://relay.example.com",
      gatewaySession: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        targetId: "target-id",
      },
      mode: "relay",
      url: "https://relay.example.com",
      relaySession: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        targetId: "target-id",
      },
    })
  })

  it("rejects connections missing credentials", () => {
    expect(() =>
      buildConnectionConfigCode({
        name: "Bad",
        mode: "direct",
        url: "http://host",
      })
    ).toThrow("直连配置缺少 token")
  })

  it("rejects relay config codes without usable credentials", () => {
    const code = Buffer.from(
      JSON.stringify({
        version: 1,
        name: "Broken Relay",
        mode: "relay",
        relayUrl: "https://relay.example.com",
      }),
      "utf8"
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "")

    expect(() => parseConnectionConfigCodeToConnection(code)).toThrow("配置码缺少中继凭据")
  })
})
