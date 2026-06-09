import {
  buildConnectionConfigCode,
  decodeConnectionConfigCode,
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
})
