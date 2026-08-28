import { createPinia, setActivePinia } from "pinia"

jest.mock("@/services/gateway/directTokenStore", () => ({
  getDirectToken: jest.fn(() => ""),
  // `auth.setDirectMode` 会写它（`stores/auth.ts`）。不 mock 会报「不是函数」——
  // 而那个报错发生在 store 内部，看起来像 store 坏了。
  setDirectToken: jest.fn(),
}))
jest.mock("@/services/connectionContext", () => ({
  buildConnectionKey: jest.fn((conn: any) => String(conn?.id || "")),
  readStoredConnections: jest.fn(() => []),
  resolveConnectionContext: jest.fn(),
}))
jest.mock("@/services/connection/connectedMapStore", () => ({
  filterConnectedConnections: jest.fn((list: any[]) => list),
}))

import {
  applyConnectionAuth,
  findConnectedConnection,
  listConnectedConnections,
  normalizeGatewayList,
  openConnectionGateway,
} from "@/services/connection/connectionAccess"
import { useAuthStore } from "@/stores/auth"

const connectionContext = require("@/services/connectionContext")
const connectedMapStore = require("@/services/connection/connectedMapStore")
const directTokenStore = require("@/services/gateway/directTokenStore")

describe("connectionAccess", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    connectionContext.readStoredConnections.mockReturnValue([])
    connectedMapStore.filterConnectedConnections.mockImplementation((list: any[]) => list)
    directTokenStore.getDirectToken.mockReturnValue("")
  })

  describe("listConnectedConnections", () => {
    it("filters stored connections through the connected map", () => {
      connectionContext.readStoredConnections.mockReturnValue([
        { id: "a" },
        { id: "b" },
      ])
      connectedMapStore.filterConnectedConnections.mockImplementation((list: any[]) =>
        list.filter((item) => item.id === "b")
      )

      expect(listConnectedConnections()).toEqual([{ id: "b" }])
    })

    it("rereads storage on every call", () => {
      // 连接状态会被别的页面改（连接页断开一条、todos 页新建一条）。缓存住会让
      // 「刚断开的连接仍能被选中」，直到用户重启 App。
      listConnectedConnections()
      listConnectedConnections()

      expect(connectionContext.readStoredConnections).toHaveBeenCalledTimes(2)
    })
  })

  describe("findConnectedConnection", () => {
    it("matches by canonical key", () => {
      connectionContext.readStoredConnections.mockReturnValue([
        { id: "one" },
        { id: "two" },
      ])

      expect(findConnectedConnection("two")).toEqual({ id: "two" })
    })

    it("returns undefined for an empty key instead of the first keyless record", () => {
      // `buildConnectionKey` 对算不出键的记录返回空串。拿空串去查会匹配上第一条同样
      // 算不出键的记录 —— 那是个**随机连接**，比查不到更糟（会往错误的机器上发请求）。
      connectionContext.readStoredConnections.mockReturnValue([{ id: "" }, { id: "real" }])

      expect(findConnectedConnection("")).toBeUndefined()
      expect(findConnectedConnection("   ")).toBeUndefined()
    })

    it("does not match a disconnected connection", () => {
      connectionContext.readStoredConnections.mockReturnValue([{ id: "gone" }])
      connectedMapStore.filterConnectedConnections.mockReturnValue([])

      expect(findConnectedConnection("gone")).toBeUndefined()
    })
  })

  describe("openConnectionGateway", () => {
    it("writes the resolved fields back into the caller's object", async () => {
      // driver 在连接过程中会补全 id / sessionId / baseUrl。调用方手里那份必须跟着更新 ——
      // 否则下一次用它算连接键得到的是**旧键**，查不到自己刚建好的连接。
      const gateway = { call: jest.fn() }
      const connection: any = { id: "before", routeMode: "direct" }
      connectionContext.resolveConnectionContext.mockResolvedValue({
        connection: { id: "after", directBaseUrl: "https://resolved.example.com" },
        gateway,
      })

      const result = await openConnectionGateway(connection)

      expect(result).toBe(gateway)
      expect(connection.id).toBe("after")
      expect(connection.directBaseUrl).toBe("https://resolved.example.com")
      // 就地改写而不是替换：调用方持有的是同一个引用。
      expect(connection.routeMode).toBe("direct")
    })
  })

  describe("applyConnectionAuth", () => {
    it("switches the store into direct mode", () => {
      const auth = useAuthStore()
      applyConnectionAuth({
        routeMode: "direct",
        directBaseUrl: "https://direct.example.com/",
        directToken: "tok",
      } as any)

      expect(auth.mode).toBe("direct")
      // 尾斜杠已被 `connectionBaseUrl` 剥掉：它参与连接键与 token 存储键，带不带
      // 会算出两个键，症状是 token 突然找不到。
      expect(auth.directBaseUrl).toBe("https://direct.example.com")
      expect(directTokenStore.setDirectToken).toHaveBeenCalledWith(
        "https://direct.example.com",
        "tok"
      )
    })

    it("falls back to the stored direct token when the record has none", () => {
      directTokenStore.getDirectToken.mockReturnValue("stored-tok")
      const auth = useAuthStore()

      applyConnectionAuth({
        routeMode: "direct",
        directBaseUrl: "https://direct.example.com",
      } as any)

      expect(auth.mode).toBe("direct")
      expect(directTokenStore.setDirectToken).toHaveBeenCalledWith(
        "https://direct.example.com",
        "stored-tok"
      )
    })

    it("switches the store into relay mode", () => {
      const auth = useAuthStore()
      const session = { accessToken: "tok-relay" }

      applyConnectionAuth({
        routeMode: "gateway",
        gatewayBaseUrl: "https://relay.example.com",
        gatewaySession: session,
      } as any)

      expect(auth.mode).toBe("relay")
      expect(auth.relayUrl).toBe("https://relay.example.com")
      // pinia 把 state 包成 reactive proxy，所以这里比不了引用相等。
      expect(auth.relaySession).toEqual(session)
    })

    it("leaves the store untouched when credentials are missing", () => {
      // 缺凭据却把 baseUrl 切过去，会让后续所有请求 401 —— 而原来那套**可用**凭据
      // 已经被覆盖掉了。所以判断返回 null 时必须什么都不做。
      const auth = useAuthStore()
      auth.setRelayMode("https://existing.example.com", { accessToken: "keep-me" } as any)

      applyConnectionAuth({
        routeMode: "direct",
        directBaseUrl: "https://direct.example.com",
      } as any)

      expect(auth.mode).toBe("relay")
      expect(auth.relayUrl).toBe("https://existing.example.com")
      expect(auth.directBaseUrl).toBe("")
      expect(directTokenStore.setDirectToken).not.toHaveBeenCalled()
    })

    it("leaves the store untouched when a relay record has no access token", () => {
      const auth = useAuthStore()
      auth.setRelayMode("https://existing.example.com", { accessToken: "keep-me" } as any)

      applyConnectionAuth({
        routeMode: "gateway",
        gatewayBaseUrl: "https://relay.example.com",
        gatewaySession: null,
      } as any)

      expect(auth.relayUrl).toBe("https://existing.example.com")
    })
  })

  describe("normalizeGatewayList", () => {
    it("passes an array through", () => {
      expect(normalizeGatewayList([1, 2])).toEqual([1, 2])
    })

    it("unwraps a data envelope", () => {
      expect(normalizeGatewayList({ data: ["x"] })).toEqual(["x"])
    })

    it("does not unwrap an items envelope", () => {
      // `items` 是**分页响应**的形状，会话列表页对它有专门的
      // `normalizeOpenedTabsResponse`（要读同级的 `version` 字段）。在这里一并接管
      // 会让那条路悄悄绕过版本号，症状是标签顺序偶发回滚。
      expect(normalizeGatewayList({ items: ["x"], version: 3 })).toEqual([])
    })

    it("returns an empty array for anything else", () => {
      expect(normalizeGatewayList(null)).toEqual([])
      expect(normalizeGatewayList(undefined)).toEqual([])
      expect(normalizeGatewayList("nope")).toEqual([])
      expect(normalizeGatewayList({})).toEqual([])
    })
  })
})
