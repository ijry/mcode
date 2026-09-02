import {
  DEFAULT_STORED_FORGE_SCOPE,
  FORGE_PAGE_SIZES,
  readStoredForgeScope,
  writeStoredForgeScope,
} from "@/services/forge/forgeScopePreference"

/**
 * 作用域偏好。
 *
 * 这些断言里最重要的一条是「**不存** state / sort / labels / page」——
 * 每一条都对应一个具体的坏体验，见模块注释。
 */
describe("forge scope preference", () => {
  beforeEach(() => {
    uni.clearStorageSync()
  })

  it("starts from the defaults when nothing is stored", () => {
    expect(readStoredForgeScope()).toEqual(DEFAULT_STORED_FORGE_SCOPE)
  })

  it("round-trips a scope", () => {
    writeStoredForgeScope({ connectionId: "conn-1", folderId: 7, tab: "prs", perPage: 30 })
    expect(readStoredForgeScope()).toEqual({
      connectionId: "conn-1",
      folderId: 7,
      tab: "prs",
      perPage: 30,
    })
  })

  /**
   * 只存四个字段。`labels` 是每个仓库自己的词汇表（换仓库后旧选择会筛出一个不存在
   * 的标签）；`page` 回到第 7 页而列表已经动过比回第 1 页更糟；`state`/`sort` 让
   * triage 总是从「还没处理完的」开始。
   */
  it("persists only the four fields that survive a repository change", () => {
    writeStoredForgeScope({
      connectionId: "conn-1",
      folderId: 7,
      tab: "issues",
      perPage: 20,
      // @ts-expect-error 故意多塞几个字段，断言它们不会被写进去。
      labels: ["bug"],
      page: 7,
      state: "closed",
      sort: "oldest",
    })
    const raw = uni.getStorageSync("mcode_forge_scope") as Record<string, unknown>
    expect(Object.keys(raw).sort()).toEqual(["connectionId", "folderId", "perPage", "tab"])
  })

  /** 未知 tab 回退：tab 以后可能改名，存着旧名字的偏好不能让列表永远空着。 */
  it("falls back to issues for an unknown tab", () => {
    uni.setStorageSync("mcode_forge_scope", { tab: "discussions" })
    expect(readStoredForgeScope().tab).toBe("issues")
  })

  it("drops a non-positive folder id to the let-the-page-decide sentinel", () => {
    uni.setStorageSync("mcode_forge_scope", { folderId: -3 })
    expect(readStoredForgeScope().folderId).toBe(0)
    uni.setStorageSync("mcode_forge_scope", { folderId: "abc" })
    expect(readStoredForgeScope().folderId).toBe(0)
  })

  /**
   * 页大小只要落在服务端的 `1..=100` 里就接受，**不限于 `FORGE_PAGE_SIZES`** ——
   * 一个未来版本提供过的档位读回来仍是一个服务端会照做的数字。
   */
  it("accepts any per-page the backend would honour", () => {
    uni.setStorageSync("mcode_forge_scope", { perPage: 25 })
    expect(readStoredForgeScope().perPage).toBe(25)
    uni.setStorageSync("mcode_forge_scope", { perPage: 100 })
    expect(readStoredForgeScope().perPage).toBe(100)
  })

  it("rejects a per-page the backend would clamp", () => {
    uni.setStorageSync("mcode_forge_scope", { perPage: 0 })
    expect(readStoredForgeScope().perPage).toBe(DEFAULT_STORED_FORGE_SCOPE.perPage)
    uni.setStorageSync("mcode_forge_scope", { perPage: 500 })
    expect(readStoredForgeScope().perPage).toBe(DEFAULT_STORED_FORGE_SCOPE.perPage)
  })

  it("survives a hand-edited entry of the wrong shape", () => {
    uni.setStorageSync("mcode_forge_scope", "not an object")
    expect(readStoredForgeScope()).toEqual(DEFAULT_STORED_FORGE_SCOPE)
    uni.setStorageSync("mcode_forge_scope", [1, 2, 3])
    expect(readStoredForgeScope()).toEqual(DEFAULT_STORED_FORGE_SCOPE)
  })

  /** 存储失败不能炸页面 —— 偏好丢了只是下次从默认开始。 */
  it("does not throw when storage refuses the write", () => {
    const original = uni.setStorageSync
    ;(uni as any).setStorageSync = () => {
      throw new Error("quota")
    }
    expect(() => writeStoredForgeScope(DEFAULT_STORED_FORGE_SCOPE)).not.toThrow()
    ;(uni as any).setStorageSync = original
  })

  it("keeps the offered page sizes inside the backend's bounds", () => {
    FORGE_PAGE_SIZES.forEach((size) => {
      expect(size).toBeGreaterThanOrEqual(1)
      expect(size).toBeLessThanOrEqual(100)
    })
  })
})
