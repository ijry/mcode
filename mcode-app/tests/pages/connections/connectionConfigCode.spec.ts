import {
  buildConnectionConfigCode,
  decodeConnectionConfigCode,
  parseConnectionConfigCodeToConnection,
  type ConfigCodeConnection,
} from "@/pages/connections/connectionConfigCode"

describe("connection config code", () => {
  it("encodes direct connections for watch import", () => {
    const connection: ConfigCodeConnection = {
      name: "Local Codeg",
      mode: "direct",
      url: "http://192.168.1.8:3089/",
      directToken: "direct-token",
    }

    const code = buildConnectionConfigCode(connection)

    expect(decodeConnectionConfigCode(code)).toEqual({
      version: 1,
      name: "Local Codeg",
      mode: "direct",
      directBaseUrl: "http://192.168.1.8:3089",
      directToken: "direct-token",
    })
  })

  it("encodes relay connections with session and pair fallback", () => {
    const connection: ConfigCodeConnection = {
      name: "Mac Studio",
      mode: "relay",
      url: "https://relay.example.com/",
      pairCode: "123456",
      pairSecret: "pair-secret",
      relaySession: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        targetId: "target-id",
      },
    }

    const code = buildConnectionConfigCode(connection)

    expect(decodeConnectionConfigCode(code)).toEqual({
      version: 1,
      name: "Mac Studio",
      mode: "relay",
      relayUrl: "https://relay.example.com",
      pairCode: "123456",
      pairSecret: "pair-secret",
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

  it("parses direct config codes into connection objects", () => {
    const code = buildConnectionConfigCode({
      name: "Local Codeg",
      mode: "direct",
      url: "http://192.168.1.8:3089/",
      directToken: "direct-token",
    })

    expect(parseConnectionConfigCodeToConnection(code)).toEqual({
      name: "Local Codeg",
      mode: "direct",
      url: "http://192.168.1.8:3089",
      directToken: "direct-token",
    })
  })

  it("parses relay config codes into connection objects", () => {
    const code = buildConnectionConfigCode({
      name: "Relay Box",
      mode: "relay",
      url: "https://relay.example.com/",
      relaySession: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        targetId: "target-id",
      },
    })

    expect(parseConnectionConfigCodeToConnection(code)).toEqual({
      name: "Relay Box",
      mode: "relay",
      url: "https://relay.example.com",
      relaySession: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        targetId: "target-id",
      },
    })
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
