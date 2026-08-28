import {
  buildConnectionAuthMode,
  connectionBaseUrl,
  findConnectedConnectionByKey,
} from "@/services/connection/connectionLookup"

const direct = {
  routeMode: "direct" as const,
  directBaseUrl: "https://direct.example.com/",
  directToken: "tok-direct",
}

const relay = {
  routeMode: "gateway" as const,
  gatewayBaseUrl: "https://relay.example.com",
  gatewaySession: { accessToken: "tok-relay" },
}

describe("connectionBaseUrl", () => {
  it("reads the base url matching the route mode", () => {
    expect(connectionBaseUrl(direct)).toBe("https://direct.example.com")
    expect(connectionBaseUrl(relay)).toBe("https://relay.example.com")
  })

  it("strips trailing slashes so the same host yields one key", () => {
    // baseUrl 会参与连接键与 token 存储键。带不带尾斜杠会算出两个键，
    // 于是「同一台机器」在存储里变成两条记录 —— 表现是 token 突然找不到。
    expect(connectionBaseUrl({ ...direct, directBaseUrl: "https://a.com///" }))
      .toBe("https://a.com")
  })

  it("trims whitespace before stripping", () => {
    expect(connectionBaseUrl({ ...direct, directBaseUrl: "  https://a.com/  " }))
      .toBe("https://a.com")
  })

  it("returns an empty string when the mode's url is absent", () => {
    // direct 记录没有 directBaseUrl 时不能退回去读 gatewayBaseUrl —— 那会把请求
    // 发到网关地址上。
    expect(connectionBaseUrl({ routeMode: "direct", gatewayBaseUrl: "https://relay.com" }))
      .toBe("")
    expect(connectionBaseUrl({ routeMode: "gateway", directBaseUrl: "https://direct.com" }))
      .toBe("")
  })
})

describe("buildConnectionAuthMode", () => {
  it("describes direct mode with its resolved token", () => {
    expect(buildConnectionAuthMode(direct, () => "")).toEqual({
      mode: "direct",
      baseUrl: "https://direct.example.com",
      token: "tok-direct",
    })
  })

  it("falls back to the stored direct token when the record has none", () => {
    // 配置码导入的连接记录不带 token，token 在配对时单独落进 directTokenStore。
    expect(buildConnectionAuthMode({ ...direct, directToken: "" }, () => "tok-stored"))
      .toEqual({
        mode: "direct",
        baseUrl: "https://direct.example.com",
        token: "tok-stored",
      })
  })

  it("returns null for direct mode with no token anywhere", () => {
    // 没有 token 就不该改动全局 auth 状态 —— 把 baseUrl 切过去但没凭据，
    // 后续所有请求都会 401，而原来那套可用凭据已经被覆盖了。
    expect(buildConnectionAuthMode({ ...direct, directToken: "" }, () => "")).toBeNull()
  })

  it("describes relay mode with the gateway session", () => {
    expect(buildConnectionAuthMode(relay, () => "")).toEqual({
      mode: "relay",
      baseUrl: "https://relay.example.com",
      session: { accessToken: "tok-relay" },
    })
  })

  it("returns null for relay mode without an access token", () => {
    expect(buildConnectionAuthMode({ ...relay, gatewaySession: undefined }, () => "")).toBeNull()
    expect(buildConnectionAuthMode(
      { ...relay, gatewaySession: { accessToken: "" } },
      () => ""
    )).toBeNull()
  })
})

describe("findConnectedConnectionByKey", () => {
  const a = { ...direct, directBaseUrl: "https://a.com", targetAgent: "codeg", version: 2 }
  const b = { ...direct, directBaseUrl: "https://b.com", targetAgent: "codeg", version: 2 }

  it("finds a connection by its canonical key", () => {
    const found = findConnectedConnectionByKey("x", () => [a, b], (c) =>
      c === a ? "x" : "y"
    )
    expect(found).toBe(a)
  })

  it("returns undefined for an unknown key", () => {
    expect(findConnectedConnectionByKey("zzz", () => [a, b], () => "x")).toBeUndefined()
  })

  it("never matches an empty key", () => {
    // `buildConnectionKey` 对无法归一化的记录返回空串。用空串去查会匹配上第一条
    // 同样算不出键的记录 —— 那是随机连接，比查不到更糟。
    expect(findConnectedConnectionByKey("", () => [a, b], () => "")).toBeUndefined()
  })

  it("reads the connection list once per lookup", () => {
    // 这个查询在页面里被调十几次，每次都全量读存储。把读取做成入参，让调用方能缓存。
    const list = jest.fn(() => [a, b])
    findConnectedConnectionByKey("x", list, () => "x")
    expect(list).toHaveBeenCalledTimes(1)
  })
})
