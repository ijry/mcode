import {
  activeModelStatusLabel,
  detailAgentConfigSelectionPayload,
  detailConfigOptionSummary,
  detailPermissionSummary,
  nextExpandedConfigKey,
  pendingComposerConfigActions,
  withSelectedDetailConfigValue,
  withSelectedDetailMode,
} from "@/pages/conversation-detail/detailComposerPresentation"
import {
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

  it("builds persistence payloads and pending apply actions", () => {
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

    expect(pendingComposerConfigActions(state)).toEqual({
      modeId: "plan",
      configValues: [
        { configId: "model", valueId: "gpt-5-mini" },
        { configId: "reasoning", valueId: "medium" },
      ],
    })
  })
})
