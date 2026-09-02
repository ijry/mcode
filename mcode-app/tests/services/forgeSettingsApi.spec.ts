import {
  defaultForgePanelSettings,
  effectiveForgeSettings,
  fetchForgeSettings,
  FORGE_PROMPT_SLOTS,
  normalizeForgePanelSettings,
  normalizeForgeSettingsStore,
  ownForgeSettings,
  saveForgeSettings,
  validateForgePrompts,
} from "@/services/forge/forgeSettingsApi"
import { FORGE_PROMPT_CAP } from "@/types/forge"
import type { CodegGateway } from "@/services/gateway"
import type { ForgePanelSettings } from "@/types/forge"

function makeGateway(result: unknown = null) {
  const calls: Array<{ command: string; payload: any }> = []
  const gateway = {
    mode: "direct" as const,
    async pair() {
      return null
    },
    async call(command: string, payload?: Record<string, unknown>) {
      calls.push({ command, payload })
      return result as any
    },
    async connectEvents() {
      throw new Error("not used")
    },
    async refreshAuth() {},
    getRemoteInstanceDescriptor() {
      return { instanceKey: "test", mode: "direct" as const, baseUrl: "", principal: "" }
    },
  }
  return { gateway: gateway as unknown as CodegGateway, calls }
}

function settingsWith(overrides: Partial<ForgePanelSettings> = {}): ForgePanelSettings {
  return { ...defaultForgePanelSettings(), ...overrides }
}

describe("fetchForgeSettings", () => {
  it("reads every scope with an empty payload", async () => {
    const { gateway, calls } = makeGateway({ global: {}, folders: {} })
    await fetchForgeSettings(gateway)
    expect(calls).toEqual([{ command: "forge_settings_get", payload: {} }])
  })
})

describe("saveForgeSettings", () => {
  /**
   * **这是这个文件最容易出错的地方。** 线上全局行是 `folderId: null`，而 UI 的哨兵值是
   * `0`。忘了转换会把全局设置写到一个不存在的 folder 0 上 —— 表现是「保存成功但下次
   * 打开什么都没变」。
   */
  it("converts the UI's zero sentinel into the wire's null", async () => {
    const { gateway, calls } = makeGateway({ global: {}, folders: {} })
    await saveForgeSettings(gateway, 0, settingsWith())
    expect(calls[0].payload.folderId).toBeNull()
  })

  it("keeps a real folder id", async () => {
    const { gateway, calls } = makeGateway({ global: {}, folders: {} })
    await saveForgeSettings(gateway, 7, settingsWith())
    expect(calls[0].payload.folderId).toBe(7)
  })

  /** `settings: null` 是「删掉这个项目自己那行让它回去跟随全局」，不是「清空设置」。 */
  it("sends a null settings to drop a folder's own row", async () => {
    const { gateway, calls } = makeGateway({ global: {}, folders: {} })
    await saveForgeSettings(gateway, 7, null)
    expect(calls[0]).toEqual({
      command: "forge_settings_set",
      payload: { folderId: 7, settings: null },
    })
  })

  /** 内层 DTO 是 **snake_case**（这是直接进存储的同一个 blob）。 */
  it("writes the settings blob in snake_case", async () => {
    const { gateway, calls } = makeGateway({ global: {}, folders: {} })
    await saveForgeSettings(
      gateway,
      0,
      settingsWith({
        default_issue_scenario: "plan_first",
        default_pr_scenario: "review_only",
        writeback_default: false,
        scenario_prompts: { all: "be brief" },
      })
    )
    expect(calls[0].payload.settings).toEqual({
      default_issue_scenario: "plan_first",
      default_pr_scenario: "review_only",
      writeback_default: false,
      scenario_prompts: { all: "be brief" },
    })
    expect(JSON.stringify(calls[0].payload)).not.toContain("defaultIssueScenario")
  })

  /**
   * 空白提示词**整个键删掉**而不是写一个 `""`（与服务端 `normalized()` 一致）——
   * 一个清空过的输入框不该在存储里留下一条空记录。
   */
  it("drops a blank prompt instead of storing an empty string", async () => {
    const { gateway, calls } = makeGateway({ global: {}, folders: {} })
    await saveForgeSettings(
      gateway,
      0,
      settingsWith({ scenario_prompts: { all: "   ", fix: "  keep  " } })
    )
    expect(calls[0].payload.settings.scenario_prompts).toEqual({ fix: "keep" })
  })
})

describe("effectiveForgeSettings", () => {
  const store = {
    global: settingsWith({ default_issue_scenario: "fix", writeback_default: true }),
    folders: {
      "7": settingsWith({ default_issue_scenario: "plan_first", writeback_default: false }),
    },
  }

  it("falls back to the global row", () => {
    expect(effectiveForgeSettings(store, 1).default_issue_scenario).toBe("fix")
  })

  /**
   * 覆盖是**整份替换**，不是逐字段合并。这条断言的重点是 `writeback_default`：
   * 文件夹那份把它设成了 false，而全局是 true —— 混合的实现会给出 true。
   */
  it("replaces the whole row rather than merging field by field", () => {
    const effective = effectiveForgeSettings(store, 7)
    expect(effective.default_issue_scenario).toBe("plan_first")
    expect(effective.writeback_default).toBe(false)
  })

  /** JSON 没有整数键 —— folder id 到了 TS 是字符串，读的时候要转。 */
  it("looks a numeric folder id up as a string key", () => {
    expect(effectiveForgeSettings(store, 7)).toBe(store.folders["7"])
  })

  it("uses the global row for the global scope", () => {
    expect(effectiveForgeSettings(store, 0)).toBe(store.global)
  })

  it("falls back to the built-in defaults with no store", () => {
    expect(effectiveForgeSettings(null, 7)).toEqual(defaultForgePanelSettings())
  })
})

describe("ownForgeSettings", () => {
  /**
   * 弹层靠这个区分「有自己的设置」与「在跟随全局」—— 一个显示着全局值却写着「自定义」
   * 的表单会让用户以为他已经脱离了全局，而实际上还没有。
   */
  it("returns null when the folder follows the global row", () => {
    const store = { global: settingsWith(), folders: {} }
    expect(ownForgeSettings(store, 7)).toBeNull()
  })

  it("returns the folder's own row when it has one", () => {
    const own = settingsWith({ default_issue_scenario: "plan_first" })
    expect(ownForgeSettings({ global: settingsWith(), folders: { "7": own } }, 7)).toBe(own)
  })

  /** 全局作用域没有「自己那份」的概念 —— 它就是那一份。 */
  it("has no own row for the global scope", () => {
    expect(ownForgeSettings({ global: settingsWith(), folders: {} }, 0)).toBeNull()
  })
})

describe("normalizeForgePanelSettings", () => {
  /**
   * `writeback_default` 的内置默认是 **true** —— 缺省不能读成 false，只有显式 `false`
   * 才是关。读错会让每个从旧 blob 加载的面板都静默停止回写评论。
   */
  it("defaults writeback to true and honours an explicit false", () => {
    expect(normalizeForgePanelSettings({}).writeback_default).toBe(true)
    expect(normalizeForgePanelSettings({ writeback_default: false }).writeback_default).toBe(false)
  })

  /**
   * 场景名走白名单：一个不认识的值当成「没配置」而不是原样透传 —— 透传会让弹层预选
   * 一个它自己都不提供的选项，于是打开时什么都没选上。
   */
  it("drops an unrecognized scenario rather than passing it through", () => {
    expect(
      normalizeForgePanelSettings({ default_issue_scenario: "investigate" })
        .default_issue_scenario
    ).toBeNull()
    expect(
      normalizeForgePanelSettings({ default_pr_scenario: "review_only" }).default_pr_scenario
    ).toBe("review_only")
  })

  /**
   * **未知提示词键要保留**（与服务端一致）：一个未来版本的场景不该在这一端被静默丢掉，
   * 否则用户在新版本配的提示词会在旧版本保存一次之后消失。
   */
  it("keeps a prompt key this build does not know about", () => {
    const settings = normalizeForgePanelSettings({
      scenario_prompts: { all: "a", some_future_scenario: "b", junk: 3 },
    })
    expect(settings.scenario_prompts).toEqual({ all: "a", some_future_scenario: "b" })
  })

  /** 缺失字段一律补默认 —— 设置弹层是受控表单，`undefined` 会让 switch 变成非受控。 */
  it("fills every field so the form stays controlled", () => {
    expect(normalizeForgePanelSettings(null)).toEqual(defaultForgePanelSettings())
  })
})

describe("normalizeForgeSettingsStore", () => {
  it("reads both scopes", () => {
    const store = normalizeForgeSettingsStore({
      global: { default_issue_scenario: "fix" },
      folders: { "7": { writeback_default: false } },
    })
    expect(store.global.default_issue_scenario).toBe("fix")
    expect(store.folders["7"].writeback_default).toBe(false)
  })

  /** 坏掉的键在 UI 上是一个点不开的「项目 #NaN」。 */
  it("drops a folder key that is not a positive integer", () => {
    const store = normalizeForgeSettingsStore({
      global: {},
      folders: { "7": {}, abc: {}, "0": {}, "-3": {} },
    })
    expect(Object.keys(store.folders)).toEqual(["7"])
  })

  it("survives a junk response", () => {
    expect(normalizeForgeSettingsStore(null)).toEqual({
      global: defaultForgePanelSettings(),
      folders: {},
    })
  })
})

describe("validateForgePrompts", () => {
  /**
   * 服务端保存时会以错误拒绝（**不静默截断** —— 用户敲进去的字不该无声消失），所以这里
   * 在打字时就撞到上限，而不是让他写完 4000 字之后被告知。
   */
  it("names the slot that is over the cap", () => {
    const error = validateForgePrompts({ fix: "x".repeat(FORGE_PROMPT_CAP + 1) })
    expect(error).toContain("直接修复")
    expect(error).toContain(String(FORGE_PROMPT_CAP))
  })

  it("accepts exactly the cap", () => {
    expect(validateForgePrompts({ all: "x".repeat(FORGE_PROMPT_CAP) })).toBeNull()
  })

  it("passes an empty set", () => {
    expect(validateForgePrompts({})).toBeNull()
  })
})

describe("FORGE_PROMPT_SLOTS", () => {
  /** 5 个槽位：保留的 `all` 加四个场景。少一个会让那个场景的提示词无法配置。 */
  it("covers the reserved key and every scenario", () => {
    expect(FORGE_PROMPT_SLOTS.map((slot) => slot.key)).toEqual([
      "all",
      "fix",
      "plan_first",
      "review_fix",
      "review_only",
    ])
    FORGE_PROMPT_SLOTS.forEach((slot) => {
      expect(slot.label).toBeTruthy()
      expect(slot.hint).toBeTruthy()
    })
  })
})
