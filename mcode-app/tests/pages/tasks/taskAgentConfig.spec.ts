import {
  effectiveTaskAgentSelection,
  hasTaskAgentConfigChoices,
  isInheritedTaskAgentSelection,
  mergeTaskAgentSelection,
  readTaskAgentSelection,
  selectableTaskConfigOptions,
  taskAgentConfigPlaceholderState,
  taskAgentConfigStateFromSnapshot,
  taskAgentConfigSummary,
  taskAgentLabel,
  taskAgentLabelSnapshot,
  withTaskAgentConfigValue,
  withTaskAgentMode,
} from "@/pages/tasks/taskAgentConfig"
import type { AgentOptionsSnapshot, SessionConfigOptionInfo } from "@/types/acp"

/**
 * 任务智能体选项（授权模式 / 模型 / 推理程度）的存储↔界面换算。
 *
 * 这套判定决定「保存下去的到底是哪一份配置」，错了不会报错 —— 只会让任务半年后
 * 悄悄跑在另一个模型上，或者把用户在 PC 端配好的选项抹掉。每条断言都对应一个具体
 * 的坑，注释说明它防的是什么。
 */

function selectOption(
  id: string,
  currentValue: string,
  values: { value: string; name: string }[],
  extra: Partial<SessionConfigOptionInfo> = {}
): SessionConfigOptionInfo {
  return {
    id,
    name: id,
    ...extra,
    kind: {
      type: "select",
      current_value: currentValue,
      options: values,
      groups: [],
    },
  } as SessionConfigOptionInfo
}

const MODEL_OPTION = selectOption(
  "model",
  "sonnet",
  [
    { value: "sonnet", name: "Sonnet 5" },
    { value: "opus", name: "Opus 5" },
  ],
  { name: "模型" }
)

const REASONING_OPTION = selectOption(
  "reasoning_effort",
  "medium",
  [
    { value: "medium", name: "中" },
    { value: "high", name: "高" },
  ],
  { name: "推理程度" }
)

const SNAPSHOT: AgentOptionsSnapshot = {
  modes: {
    current_mode_id: "default",
    available_modes: [
      { id: "default", name: "常规" },
      { id: "acceptEdits", name: "自动接受编辑" },
    ],
  },
  config_options: [MODEL_OPTION, REASONING_OPTION],
}

describe("readTaskAgentSelection", () => {
  it("reads the stored pair out of either record shape", () => {
    expect(
      readTaskAgentSelection({ mode_id: "acceptEdits", config_values: { model: "opus" } })
    ).toEqual({ mode_id: "acceptEdits", config_values: { model: "opus" } })
  })

  /** `config` 列解析失败时是 null，读取方一律要能吃下 null / undefined。 */
  it("treats a missing record as inheriting", () => {
    expect(readTaskAgentSelection(null)).toEqual({ mode_id: null, config_values: {} })
    expect(readTaskAgentSelection(undefined)).toEqual({ mode_id: null, config_values: {} })
    expect(isInheritedTaskAgentSelection(readTaskAgentSelection(null))).toBe(true)
  })

  /** 空串是「没配」而不是一个合法 id —— 否则 `mode_id: ""` 会被当成一次覆盖发给引擎。 */
  it("normalizes blank ids and drops non-string values", () => {
    expect(
      readTaskAgentSelection({
        mode_id: "   ",
        config_values: { model: " opus ", broken: 3 as unknown as string, blank: "" },
      })
    ).toEqual({ mode_id: null, config_values: { model: "opus" } })
  })
})

describe("selectableTaskConfigOptions", () => {
  /**
   * ACP 还有 boolean 这种 kind（Cline 的 `auto_approve`），`types/acp.ts` 只声明了
   * select。没有取值列表的选项在 chip 界面里会渲染成一个空的分组标题 —— 一行看不懂
   * 也点不动的字。
   */
  it("drops options that have no values to pick from", () => {
    const broken = { id: "auto_approve", name: "自动批准", kind: { type: "boolean" } } as unknown as SessionConfigOptionInfo
    expect(selectableTaskConfigOptions([MODEL_OPTION, broken])).toEqual([MODEL_OPTION])
    expect(selectableTaskConfigOptions(null as unknown as SessionConfigOptionInfo[])).toEqual([])
  })
})

describe("taskAgentConfigStateFromSnapshot", () => {
  it("projects the stored selection onto the probe", () => {
    const state = taskAgentConfigStateFromSnapshot(SNAPSHOT, {
      mode_id: "acceptEdits",
      config_values: { model: "opus" },
    })

    expect(state.status).toBe("ready")
    expect(state.selectedModeId).toBe("acceptEdits")
    expect(state.selectedValues.model).toBe("opus")
    // 没存过的选项落到该选项的当前值，而不是空。
    expect(state.selectedValues.reasoning_effort).toBe("medium")
  })

  /** 存的取值远端已经不提供了（换了 agent 版本）：退回当前值，不显示一个选不中的 id。 */
  it("falls back to the current value when the stored one vanished", () => {
    const state = taskAgentConfigStateFromSnapshot(SNAPSHOT, {
      mode_id: "gone",
      config_values: { model: "gpt-42" },
    })

    expect(state.selectedModeId).toBe("default")
    expect(state.selectedValues.model).toBe("sonnet")
  })

  /**
   * 有真实会话模式时，那个 id 为 `mode` 的配置项是 UI 镜像，必须摘掉 —— replay 它会被
   * `acp_set_config_option` 拒绝。见 `2026-07-03-p53-detail-mode-config-replay.md`。
   */
  it("removes the mirrored mode config option when real session modes exist", () => {
    const state = taskAgentConfigStateFromSnapshot(
      {
        ...SNAPSHOT,
        config_options: [selectOption("mode", "default", [{ value: "default", name: "常规" }]), MODEL_OPTION],
      },
      { mode_id: null, config_values: {} }
    )

    expect(state.configOptions.map((option) => option.id)).toEqual(["model"])
  })
})

describe("effectiveTaskAgentSelection", () => {
  /**
   * 界面上没有「继承」这个选项，每个 chip 组显示的都是一个具体值 —— 所以存下去的也必须
   * 是那个具体值。存空等于跟随远端默认，而远端默认将来会变：用户看到 Sonnet，半年后
   * 同一个任务却跑在别的模型上。
   */
  it("pins what the UI is showing, including untouched options", () => {
    const state = taskAgentConfigStateFromSnapshot(SNAPSHOT, {
      mode_id: null,
      config_values: {},
    })

    expect(effectiveTaskAgentSelection(state, { mode_id: null, config_values: {} })).toEqual({
      mode_id: "default",
      config_values: { model: "sonnet", reasoning_effort: "medium" },
    })
  })

  it("keeps an explicit pick over the option's current value", () => {
    let state = taskAgentConfigStateFromSnapshot(SNAPSHOT, { mode_id: null, config_values: {} })
    state = withTaskAgentMode(state, "acceptEdits")
    state = withTaskAgentConfigValue(state, "model", "opus")

    expect(effectiveTaskAgentSelection(state, { mode_id: null, config_values: {} })).toEqual({
      mode_id: "acceptEdits",
      config_values: { model: "opus", reasoning_effort: "medium" },
    })
  })

  /**
   * 探测没落地时界面一个具体值都没显示过。凭一次读取失败去改写记录里的配置是最坏的
   * 结果 —— 用户只是改了个标题，模型选择却被清空了。
   */
  it("returns the stored selection untouched when the probe never landed", () => {
    const stored = { mode_id: "acceptEdits", config_values: { model: "opus" } }

    expect(effectiveTaskAgentSelection(taskAgentConfigPlaceholderState("failed"), stored)).toEqual(stored)
    expect(effectiveTaskAgentSelection(taskAgentConfigPlaceholderState("loading"), stored)).toEqual(stored)
    expect(effectiveTaskAgentSelection(taskAgentConfigPlaceholderState("idle"), stored)).toEqual(stored)
  })

  /** 快照没广告过的取值可能是 PC 端配的、本机 agent 版本还不认的选项，不能顺手删掉。 */
  it("preserves stored values this snapshot does not advertise", () => {
    const state = taskAgentConfigStateFromSnapshot(SNAPSHOT, { mode_id: null, config_values: {} })

    const selection = effectiveTaskAgentSelection(state, {
      mode_id: null,
      config_values: { sandbox: "workspace-write" },
    })

    expect(selection.config_values.sandbox).toBe("workspace-write")
    expect(selection.config_values.model).toBe("sonnet")
  })

  /** 没有会话模式的 agent（权限只作为普通配置项）不该被塞进一个 mode_id。 */
  it("leaves mode_id alone for an agent without session modes", () => {
    const state = taskAgentConfigStateFromSnapshot(
      { modes: null, config_options: [MODEL_OPTION] },
      { mode_id: null, config_values: {} }
    )

    expect(effectiveTaskAgentSelection(state, { mode_id: null, config_values: {} }).mode_id).toBeNull()
  })
})

describe("taskAgentLabelSnapshot", () => {
  /**
   * 存名字而不是只存 id：详情页要显示「Claude Code · Opus 5」，而那时候 agent 可能已被
   * 卸载、或选项集换了版本，探不出名字来。
   */
  it("captures human-readable labels for the pinned selection", () => {
    const state = taskAgentConfigStateFromSnapshot(SNAPSHOT, { mode_id: null, config_values: {} })
    const selection = effectiveTaskAgentSelection(state, { mode_id: null, config_values: {} })

    expect(taskAgentLabelSnapshot({ agentType: "claude_code", state, selection })).toEqual({
      agent_label: "Claude Code",
      mode_label: "常规",
      config_labels: { model: "Sonnet 5", reasoning_effort: "中" },
    })
  })

  /**
   * 分组形态下取值名要能从分组里查到。
   *
   * 线上形状是**分组与平铺列表同时给**（服务端 `map_session_config_option` 把分组摊平了
   * 一份放进 `options`），整条链路都依赖那份平铺列表 —— 包括共享的
   * `composerTools.buildDefaultSelectedValues` / 投影。所以这里的 fixture 两者都给。
   */
  it("resolves a value name out of grouped options", () => {
    const grouped: SessionConfigOptionInfo = {
      id: "model",
      name: "模型",
      kind: {
        type: "select",
        current_value: "opus",
        options: [{ value: "opus", name: "Opus 5" }],
        groups: [
          { group: "anthropic", name: "Anthropic", options: [{ value: "opus", name: "Opus 5" }] },
        ],
      },
    } as SessionConfigOptionInfo
    const state = taskAgentConfigStateFromSnapshot(
      { modes: null, config_options: [grouped] },
      { mode_id: null, config_values: { model: "opus" } }
    )

    expect(
      taskAgentLabelSnapshot({
        agentType: "codex",
        state,
        selection: { mode_id: null, config_values: { model: "opus" } },
      })
    ).toEqual({ agent_label: "Codex", config_labels: { model: "Opus 5" } })
  })

  /** 未知 agent 原样透传，不冒充成 claude_code。 */
  it("passes an unknown agent type through as its own label", () => {
    expect(taskAgentLabel("brand_new_agent")).toBe("brand_new_agent")
    expect(taskAgentLabel("claude_code")).toBe("Claude Code")
    expect(taskAgentLabel(null)).toBe("")
  })
})

describe("taskAgentConfigSummary", () => {
  it("joins the displayed names", () => {
    const state = taskAgentConfigStateFromSnapshot(SNAPSHOT, { mode_id: null, config_values: {} })

    expect(
      taskAgentConfigSummary({ state, stored: { mode_id: null, config_values: {} } })
    ).toBe("常规 · Sonnet 5 · 中")
  })

  it("says it is loading while the probe is in flight", () => {
    expect(
      taskAgentConfigSummary({
        state: taskAgentConfigPlaceholderState("loading"),
        stored: { mode_id: null, config_values: {} },
      })
    ).toBe("正在读取可用配置...")
  })

  /**
   * 探测失败时靠上次存下来的 `label_snapshot` 说话。显示原始 id 会让用户以为配置坏了；
   * 什么都不显示会让他以为从没配过，进而重配一遍（覆盖掉原本正确的那份）。
   */
  it("falls back to the saved labels when the probe failed", () => {
    expect(
      taskAgentConfigSummary({
        state: taskAgentConfigPlaceholderState("failed", "读取失败"),
        stored: { mode_id: "acceptEdits", config_values: { model: "opus" } },
        fallbackLabels: { mode_label: "自动接受编辑", config_labels: { model: "Opus 5" } },
      })
    ).toBe("自动接受编辑 · Opus 5")
  })

  /** 连名字都没有（老记录）时退回原始 id —— 仍然比空白诚实。 */
  it("degrades to raw ids rather than showing nothing", () => {
    expect(
      taskAgentConfigSummary({
        state: taskAgentConfigPlaceholderState("failed"),
        stored: { mode_id: "acceptEdits", config_values: { model: "opus" } },
      })
    ).toBe("acceptEdits · opus")
  })

  it("says the agent will use remote defaults when it exposes nothing", () => {
    const state = taskAgentConfigStateFromSnapshot(
      { modes: null, config_options: [] },
      { mode_id: null, config_values: {} }
    )

    expect(hasTaskAgentConfigChoices(state)).toBe(false)
    expect(taskAgentConfigSummary({ state, stored: { mode_id: null, config_values: {} } })).toBe(
      "该智能体将使用远端默认配置"
    )
  })
})

describe("hasTaskAgentConfigChoices", () => {
  it("counts either channel", () => {
    expect(
      hasTaskAgentConfigChoices(
        taskAgentConfigStateFromSnapshot(
          { modes: SNAPSHOT.modes, config_options: [] },
          { mode_id: null, config_values: {} }
        )
      )
    ).toBe(true)
    expect(
      hasTaskAgentConfigChoices(
        taskAgentConfigStateFromSnapshot(
          { modes: null, config_options: [MODEL_OPTION] },
          { mode_id: null, config_values: {} }
        )
      )
    ).toBe(true)
  })
})

/**
 * 把「本机上次为这个 agent 配好的选项」叠在记录值之上。
 *
 * 这是「新建任务记住上次配置」的换算核心，两个方向都会静默出错：叠得太狠会抹掉记录里
 * 记忆不认识的取值（可能是 PC 端配的），叠得不够则功能形同不存在。
 */
describe("mergeTaskAgentSelection", () => {
  const base = { mode_id: "default", config_values: { model: "sonnet-5", effort: "medium" } }

  it("returns the record untouched when nothing was remembered", () => {
    expect(mergeTaskAgentSelection(base, null)).toEqual(base)
  })

  it("does not hand back the caller's own object", () => {
    // 调用方会把结果继续投影，共享引用会让一次投影改到记录 ref 上。
    const merged = mergeTaskAgentSelection(base, null)
    expect(merged.config_values).not.toBe(base.config_values)
  })

  it("lets the memory win per field", () => {
    expect(
      mergeTaskAgentSelection(base, {
        mode_id: "bypassPermissions",
        config_values: { model: "opus-4.6" },
      })
    ).toEqual({
      mode_id: "bypassPermissions",
      // effort 只在记录里有 —— 逐字段覆盖必须留着它。
      config_values: { model: "opus-4.6", effort: "medium" },
    })
  })

  it("keeps the record's mode when the memory has none", () => {
    expect(
      mergeTaskAgentSelection(base, { mode_id: null, config_values: { model: "opus-4.6" } })
    ).toEqual({ mode_id: "default", config_values: { model: "opus-4.6", effort: "medium" } })
  })

  it("adds options the record never had", () => {
    expect(
      mergeTaskAgentSelection(
        { mode_id: null, config_values: {} },
        { mode_id: "plan", config_values: { model: "opus-4.6" } }
      )
    ).toEqual({ mode_id: "plan", config_values: { model: "opus-4.6" } })
  })

  it("stays inherited when neither side defines anything", () => {
    expect(
      isInheritedTaskAgentSelection(
        mergeTaskAgentSelection({ mode_id: null, config_values: {} }, {
          mode_id: null,
          config_values: {},
        })
      )
    ).toBe(true)
  })
})
