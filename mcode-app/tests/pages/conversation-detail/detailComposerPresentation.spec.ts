import {
  activeModelStatusLabel,
  detailAgentConfigSelectionPayload,
  detailConfigOptionSummary,
  detailPermissionSummary,
  nextExpandedConfigKey,
  withSelectedDetailConfigValue,
  withSelectedDetailMode,
} from "@/pages/conversation-detail/detailComposerPresentation"
import {
  createReadyDetailAgentConfigState,
  createEmptyDetailAgentConfigState,
  type DetailAgentConfigState,
} from "@/services/conversation/composerTools"
import type { SessionConfigOptionInfo } from "@/types/acp"

const option = (
  id: string,
  currentValue: string,
  values: Array<{ value: string; name: string }>
): SessionConfigOptionInfo => ({
  id,
  name: id,
  kind: {
    type: "select",
    current_value: currentValue,
    options: values,
    groups: [],
  },
})

const configState = (patch: Partial<DetailAgentConfigState> = {}): DetailAgentConfigState => ({
  ...createEmptyDetailAgentConfigState(),
  status: "ready",
  modes: {
    current_mode_id: "default",
    available_modes: [
      { id: "default", name: "默认授权" },
      { id: "plan", name: "计划模式" },
    ],
  },
  configOptions: [
    option("model", "gpt-5", [
      { value: "gpt-5", name: "GPT-5" },
      { value: "gpt-5-mini", name: "GPT-5 mini" },
    ]),
    option("reasoning", "medium", [
      { value: "low", name: "低" },
      { value: "medium", name: "中" },
    ]),
  ],
  selectedModeId: "default",
  selectedValues: {
    model: "gpt-5",
    reasoning: "medium",
  },
  ...patch,
})

describe("detailComposerPresentation", () => {
  it("builds option, permission, and active model summaries", () => {
    const state = configState()
    expect(detailConfigOptionSummary({
      status: state.status,
      option: state.configOptions[0],
      selectedValues: state.selectedValues,
      message: "",
    })).toBe("GPT-5")
    expect(detailConfigOptionSummary({
      status: "loading",
      option: state.configOptions[0],
      selectedValues: state.selectedValues,
      message: "",
    })).toBe("加载中")
    expect(detailConfigOptionSummary({
      status: "ready",
      option: null,
      selectedValues: {},
      message: "使用默认配置",
    })).toBe("使用默认配置")
    expect(detailPermissionSummary({
      status: state.status,
      state,
      permissionOption: null,
    })).toBe("默认授权")
    expect(activeModelStatusLabel({ modelSummary: "GPT-5", runtimeStatus: "thinking" }))
      .toBe("GPT-5 思考中")
    expect(activeModelStatusLabel({ modelSummary: "远端未提供", runtimeStatus: "thinking" }))
      .toBe("")
  })

  it("toggles config rows only when options are available", () => {
    const availability = {
      hasModelOptions: true,
      hasReasoningOption: false,
      hasPermissionOptions: true,
    }
    expect(nextExpandedConfigKey({
      currentKey: "",
      targetKey: "model",
      availability,
    })).toBe("model")
    expect(nextExpandedConfigKey({
      currentKey: "model",
      targetKey: "model",
      availability,
    })).toBe("")
    expect(nextExpandedConfigKey({
      currentKey: "model",
      targetKey: "reasoning",
      availability,
    })).toBe("model")
  })

  it("updates selected mode and values immutably", () => {
    const state = configState()
    const nextMode = withSelectedDetailMode(state, "plan")
    expect(nextMode.selectedModeId).toBe("plan")
    expect(state.selectedModeId).toBe("default")

    const nextValue = withSelectedDetailConfigValue({
      state,
      configId: "model",
      valueId: "gpt-5-mini",
    })
    expect(nextValue.selectedValues).toEqual({
      model: "gpt-5-mini",
      reasoning: "medium",
    })
    expect(state.selectedValues.model).toBe("gpt-5")
  })

  it("builds persistence payloads without sharing the state's objects", () => {
    const state = configState({
      selectedModeId: "plan",
      selectedValues: {
        model: "gpt-5-mini",
        reasoning: "medium",
      },
    })
    const payload = detailAgentConfigSelectionPayload(state)
    payload.selectedValues.model = "changed"
    expect(state.selectedValues.model).toBe("gpt-5-mini")
    expect(payload.selectedModeId).toBe("plan")
  })

  /**
   * P53：有真实会话模式时，那个 id 为 `mode` 的配置项是 UI 镜像，必须从投影结果里摘掉 ——
   * 对它调 `acp_set_config_option` 会被拒绝。
   *
   * 这里只断言投影本身。曾经还有一个 `pendingComposerConfigActions()` 助手把这份状态摊成
   * 「待补发的 mode/config 动作」，它随「不自动重放会话配置」那次决定
   * （`docs/mcode-architecture-notes/2026-07-03-detail-session-config-no-auto-replay.md`）
   * 一起作废，现已删除 —— 保留它只会让人以为重放这条路还在。
   */
  it("P53 drops the mirrored mode config option when session modes exist", () => {
    const state = createReadyDetailAgentConfigState({
      modes: {
        current_mode_id: "default",
        available_modes: [
          { id: "default", name: "默认授权" },
          { id: "plan", name: "计划模式" },
        ],
      },
      config_options: [
        option("mode", "default", [
          { value: "default", name: "默认授权" },
          { value: "plan", name: "计划模式" },
        ]),
        option("model", "gpt-5", [
          { value: "gpt-5", name: "GPT-5" },
        ]),
      ],
    })

    expect(state.configOptions.map((item) => item.id)).toEqual(["model"])
    // 模式仍然留在模式通道里（`acp_set_mode` 用它），只是不再作为配置项出现。
    expect(state.selectedModeId).toBe("default")
    expect(state.selectedValues.mode).toBeUndefined()
  })
})
