import {
  buildConnectionConfigCode,
  decodeConnectionConfigCode,
  parseConnectionConfigCodeToConnection,
} from "@/pages/connections/connectionConfigCode"

function encodePayload(payload: object): string {
  return Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

describe("connection config code", () => {
  it("encodes v2 direct connections into v2 config codes", () => {
    const code = buildConnectionConfigCode({
      version: 2,
      name: "Local Codeg",
      targetAgent: "codeg",
      routeMode: "direct",
      directBaseUrl: "http://192.168.1.8:3089/",
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

  it("omits local-only connection ids from config code payloads", () => {
    const code = buildConnectionConfigCode({
      version: 2,
      id: "conn_local_123",
      name: "Local Codeg",
      targetAgent: "codeg",
      routeMode: "direct",
      directBaseUrl: "http://192.168.1.8:3089/",
      directToken: "direct-token",
    })

    expect(decodeConnectionConfigCode(code)).not.toHaveProperty("id")
  })

  it("encodes and decodes v2 desktop gateway config codes", () => {
    const code = buildConnectionConfigCode({
      version: 2,
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
    })
  })

  it("encodes and decodes v2 opencode gateway config codes", () => {
    const code = buildConnectionConfigCode({
      version: 2,
      name: "OpenCode Relay",
      targetAgent: "opencode",
      routeMode: "gateway",
      gatewayProvider: "official",
      gatewayBaseUrl: "https://relay.example.com/",
      pairCode: "OPEN-1234",
      pairSecret: "pair-secret",
    })

    expect(parseConnectionConfigCodeToConnection(code)).toEqual({
      version: 2,
      name: "OpenCode Relay",
      targetAgent: "opencode",
      routeMode: "gateway",
      gatewayProvider: "official",
      gatewayBaseUrl: "https://relay.example.com",
      pairCode: "OPEN-1234",
      pairSecret: "pair-secret",
    })
  })

  it("rejects legacy v1 direct config codes on import", () => {
    const code = encodePayload({
      version: 1,
      name: "Legacy Direct",
      mode: "direct",
      directBaseUrl: "http://192.168.1.8:3089/",
      directToken: "direct-token",
    })

    expect(() => parseConnectionConfigCodeToConnection(code)).toThrow("不支持的配置码内容")
  })

  it("rejects legacy v1 relay config codes on import", () => {
    const code = encodePayload({
      version: 1,
      name: "Relay Box",
      mode: "relay",
      relayUrl: "https://relay.example.com/",
      relaySession: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        targetId: "target-id",
      },
    })

    expect(() => parseConnectionConfigCodeToConnection(code)).toThrow("不支持的配置码内容")
  })

  it("rejects connections missing credentials", () => {
    expect(() =>
      buildConnectionConfigCode({
        version: 2,
        name: "Bad",
        targetAgent: "codeg",
        routeMode: "direct",
        directBaseUrl: "http://host",
      })
    ).toThrow("直连配置缺少 token")
  })

  it("rejects v2 gateway config codes without usable gateway credentials", () => {
    const code = encodePayload({
      version: 2,
      name: "Broken Relay",
      targetAgent: "codeg",
      routeMode: "gateway",
      gatewayProvider: "official",
      gatewayBaseUrl: "https://relay.example.com",
    })

    expect(() => parseConnectionConfigCodeToConnection(code)).toThrow("配置码缺少网关凭据")
  })
})
