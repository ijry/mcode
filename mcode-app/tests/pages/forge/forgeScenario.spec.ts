import {
  defaultForgeScenario,
  forgeChipState,
  forgeScenariosFor,
  forgeStandingPrompt,
  forgeTaskStatusLabel,
  forgeTaskStatusTone,
  initialForgeScenario,
} from "@/pages/forge/forgeScenario"
import type { ForgePanelSettings } from "@/types/forge"

function settingsWith(overrides: Partial<ForgePanelSettings> = {}): ForgePanelSettings {
  return {
    default_issue_scenario: null,
    default_pr_scenario: null,
    writeback_default: true,
    scenario_prompts: {},
    ...overrides,
  }
}

describe("forgeScenariosFor", () => {
  it("offers each kind its own two scenarios", () => {
    expect(forgeScenariosFor("issue").map((option) => option.id)).toEqual(["fix", "plan_first"])
    expect(forgeScenariosFor("pr").map((option) => option.id)).toEqual([
      "review_fix",
      "review_only",
    ])
  })

  /**
   * 「只调查」曾经存在过，服务端现在会**拒绝**它而不是映射到别的场景 —— 它承诺过 agent
   * 不碰代码，而吸收了它的两个流程都可能提交。所以这里绝不能再出现它。
   */
  it("never offers the retired investigate-only scenario", () => {
    const all = [...forgeScenariosFor("issue"), ...forgeScenariosFor("pr")]
    expect(all.map((option) => option.id)).not.toContain("investigate")
  })

  it("explains every scenario", () => {
    ;[...forgeScenariosFor("issue"), ...forgeScenariosFor("pr")].forEach((option) => {
      expect(option.label).toBeTruthy()
      expect(option.hint).toBeTruthy()
    })
  })

  /** issue 的两个模板都以「先确认问题真的存在」开头 —— 那是工作的一个步骤，不是可选项。 */
  it("says both issue scenarios verify the problem first", () => {
    forgeScenariosFor("issue").forEach((option) => {
      expect(option.hint).toContain("确认")
    })
  })
})

describe("defaultForgeScenario", () => {
  it("matches the backend's built-in defaults", () => {
    expect(defaultForgeScenario("issue")).toBe("fix")
    expect(defaultForgeScenario("pr")).toBe("review_fix")
  })
})

describe("initialForgeScenario", () => {
  it("uses the built-in default when nothing is configured", () => {
    expect(initialForgeScenario("issue", null)).toBe("fix")
    expect(initialForgeScenario("pr", settingsWith())).toBe("review_fix")
  })

  it("honours a configured default", () => {
    expect(
      initialForgeScenario("issue", settingsWith({ default_issue_scenario: "plan_first" }))
    ).toBe("plan_first")
    expect(
      initialForgeScenario("pr", settingsWith({ default_pr_scenario: "review_only" }))
    ).toBe("review_only")
  })

  /**
   * 存的是一个**字符串**（服务端不做白名单校验，未来可能新增场景），所以要检查它是不是
   * 这个 kind 提供的选项之一 —— 一个属于另一个 kind 的默认值会让弹层打开时什么都没选上。
   */
  it("ignores a default that belongs to the other kind", () => {
    expect(
      initialForgeScenario("issue", settingsWith({ default_issue_scenario: "review_fix" as any }))
    ).toBe("fix")
    expect(
      initialForgeScenario("pr", settingsWith({ default_pr_scenario: "plan_first" as any }))
    ).toBe("review_fix")
  })

  it("ignores an unknown default", () => {
    expect(
      initialForgeScenario("issue", settingsWith({ default_issue_scenario: "investigate" as any }))
    ).toBe("fix")
  })
})

describe("forgeStandingPrompt", () => {
  /** 顺序与拼法要与服务端 `standing_prompt` 一致：`all` 在前，场景自己的在后，空行隔开。 */
  it("concatenates the all-scenario text before the scenario's own", () => {
    const settings = settingsWith({
      scenario_prompts: { all: "always be brief", fix: "prefer small diffs" },
    })
    expect(forgeStandingPrompt("fix", settings)).toBe("always be brief\n\nprefer small diffs")
  })

  it("uses whichever half exists", () => {
    expect(forgeStandingPrompt("fix", settingsWith({ scenario_prompts: { all: "a" } }))).toBe("a")
    expect(forgeStandingPrompt("fix", settingsWith({ scenario_prompts: { fix: "b" } }))).toBe("b")
  })

  /** 另一个场景的提示词不该出现 —— 预览必须与任务真正收到的东西一致。 */
  it("does not leak another scenario's prompt", () => {
    const settings = settingsWith({ scenario_prompts: { plan_first: "plan carefully" } })
    expect(forgeStandingPrompt("fix", settings)).toBe("")
  })

  it("trims and drops the blank ones", () => {
    const settings = settingsWith({ scenario_prompts: { all: "  ", fix: "  keep  " } })
    expect(forgeStandingPrompt("fix", settings)).toBe("keep")
  })

  it("says nothing without settings", () => {
    expect(forgeStandingPrompt("fix", null)).toBe("")
  })
})

describe("forgeChipState", () => {
  it("offers start when nothing has been triggered", () => {
    expect(forgeChipState(null)).toBe("none")
    expect(forgeChipState(undefined)).toBe("none")
  })

  it("recognizes every active status the engine can be in", () => {
    ;["todo", "queued", "preparing", "running", "awaiting_input", "review", "merging"].forEach(
      (status) => {
        expect(forgeChipState({ status })).toBe("active")
      }
    )
  })

  it("recognizes the terminal ones", () => {
    ;["done", "canceled", "failed"].forEach((status) => {
      expect(forgeChipState({ status })).toBe("terminal")
    })
  })

  /**
   * 未知状态按**终态**处理（给「再次处理」）而不是活跃 —— 后者会让一个其实已经结束的
   * 任务永久挡住用户重新触发，而那没有任何出路。
   */
  it("treats an unknown status as terminal rather than blocking the user", () => {
    expect(forgeChipState({ status: "some_new_status" })).toBe("terminal")
  })
})

describe("forgeTaskStatusLabel", () => {
  it("names every status the engine reports", () => {
    const labels = [
      "todo",
      "queued",
      "preparing",
      "running",
      "awaiting_input",
      "review",
      "merging",
      "done",
      "canceled",
      "failed",
    ].map(forgeTaskStatusLabel)
    expect(new Set(labels).size).toBe(labels.length)
    labels.forEach((label) => expect(label).toBeTruthy())
  })

  /** 未知状态原样透传 —— 服务端可能新增状态，编一个说法比透传更糟。 */
  it("passes an unknown status through", () => {
    expect(forgeTaskStatusLabel("some_new_status")).toBe("some_new_status")
    expect(forgeTaskStatusLabel("")).toBe("未知")
  })
})

describe("forgeTaskStatusTone", () => {
  it("gives every tone a literal fallback colour", () => {
    ;["running", "review", "done", "failed", "todo"].forEach((status) => {
      expect(forgeTaskStatusTone(status).fallback).toMatch(/^#[0-9a-f]{6}$/i)
    })
  })

  /** 三种终态要能一眼区分：完成是绿的，失败是红的，取消是中性的。 */
  it("keeps the terminal states visually apart", () => {
    const done = forgeTaskStatusTone("done").fallback
    const failed = forgeTaskStatusTone("failed").fallback
    const canceled = forgeTaskStatusTone("canceled").fallback
    expect(new Set([done, failed, canceled]).size).toBe(3)
  })
})
