import {
  filterConnectedConnections,
  isConnectionConnected,
  markConnectionConnected,
  markConnectionDisconnected,
  pruneConnectedMap,
  readConnectedMap,
  replaceConnectedMap,
} from "@/services/connection/connectedMapStore"
import { buildConnectionRecordKey } from "@/services/connectionSchema"
import { buildConnectionKey } from "@/services/connectionContext"

const directConn = {
  version: 2 as const,
  name: "本地 CodeG",
  targetAgent: "codeg" as const,
  routeMode: "direct" as const,
  directBaseUrl: "http://127.0.0.1:3089",
}

describe("connectedMapStore", () => {
  it("round-trips a mark through the same key the readers use", () => {
    markConnectionConnected(directConn)

    expect(isConnectionConnected(directConn)).toBe(true)
    expect(readConnectedMap()).toEqual({ "codeg::direct::http://127.0.0.1:3089": true })
  })

  it("treats a trailing slash as the same connection", () => {
    markConnectionConnected(directConn)

    expect(isConnectionConnected({ ...directConn, directBaseUrl: "http://127.0.0.1:3089/" }))
      .toBe(true)
  })

  /**
   * 这是收口要防的那个 bug：写方原先用 `buildConnectionRecordKey`（不归一化），
   * 读方用 `buildConnectionKey`（先归一化）。对无法通过 v2 归一化的记录两者分叉，
   * 写进去的键读方永远匹配不上。
   *
   * 实测三种分叉：targetAgent 大小写、version 不是 2、缺 directBaseUrl。
   */
  it.each([
    ["uppercase targetAgent", { ...directConn, targetAgent: "CodeG" as any }],
    ["non-v2 version", { ...directConn, version: 1 as any }],
    ["missing directBaseUrl", { ...directConn, directBaseUrl: "" }],
  ])("refuses to write a key the readers could never match: %s", (_label, conn) => {
    // 前提：这类记录确实会让两个 key 函数分叉
    expect(buildConnectionKey(conn as any)).toBe("")
    expect(buildConnectionRecordKey(conn as any)).not.toBe("")

    markConnectionConnected(conn as any)

    // 宁可不标记，也不要写一个谁都读不到的键
    expect(readConnectedMap()).toEqual({})
    expect(isConnectionConnected(conn as any)).toBe(false)
  })

  it("clears a mark", () => {
    markConnectionConnected(directConn)
    markConnectionDisconnected(directConn)

    expect(isConnectionConnected(directConn)).toBe(false)
    expect(readConnectedMap()).toEqual({})
  })

  it("filters connections by the mark", () => {
    const other = {
      ...directConn,
      name: "另一台",
      directBaseUrl: "http://127.0.0.1:4000",
    }
    markConnectionConnected(directConn)

    expect(filterConnectedConnections([directConn, other])).toEqual([directConn])
  })

  it("drops junk values when reading", () => {
    uni.setStorageSync("mcode_connected_map", {
      "codeg::direct::http://127.0.0.1:3089": true,
      "codeg::direct::http://127.0.0.1:4000": false,
      "": true,
    })

    expect(readConnectedMap()).toEqual({ "codeg::direct::http://127.0.0.1:3089": true })
  })

  it("survives a non-object stored value", () => {
    uni.setStorageSync("mcode_connected_map", "garbage")
    expect(readConnectedMap()).toEqual({})
  })

  it("replaces the whole map, dropping empty and falsy keys", () => {
    replaceConnectedMap({
      "codeg::direct::http://127.0.0.1:3089": true,
      "codeg::direct::http://127.0.0.1:4000": false,
      "": true,
    })

    expect(readConnectedMap()).toEqual({ "codeg::direct::http://127.0.0.1:3089": true })
  })

  /**
   * 剪枝必须和置位用同一个 key 函数，否则健在的条目会被误判成陈旧并剪掉 ——
   * 这正是 `pages/conversations/index.vue` 里那份实现的隐患。
   */
  it("prunes only entries whose connection is gone", () => {
    const other = {
      ...directConn,
      name: "另一台",
      directBaseUrl: "http://127.0.0.1:4000",
    }
    markConnectionConnected(directConn)
    markConnectionConnected(other)

    const next = pruneConnectedMap([directConn])

    expect(next).toEqual({ "codeg::direct::http://127.0.0.1:3089": true })
    expect(readConnectedMap()).toEqual({ "codeg::direct::http://127.0.0.1:3089": true })
  })

  it("keeps a live entry that the writer stored under the normalized key", () => {
    markConnectionConnected(directConn)

    // 传入带尾斜杠的记录：归一化后与已存键一致，不该被剪掉
    const next = pruneConnectedMap([{ ...directConn, directBaseUrl: "http://127.0.0.1:3089/" }])

    expect(next).toEqual({ "codeg::direct::http://127.0.0.1:3089": true })
  })
})
