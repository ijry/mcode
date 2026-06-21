import {
  findModeName,
  findSelectedOptionValueName,
  type ComposerConfigKey,
  type DetailAgentConfigState,
} from "@/services/conversation/composerTools"
import type { SessionConfigOptionInfo } from "@/types/acp"

export interface DetailConfigAvailability {
  hasModelOptions: boolean
  hasReasoningOption: boolean
  hasPermissionOptions: boolean
}

export function detailConfigOptionSummary(input: {
  status: DetailAgentConfigState["status"]
  option: SessionConfigOptionInfo | null
  selectedValues: Record<string, string>
  message: string
}) {
  if (input.status === "loading") return "加载中"
  return findSelectedOptionValueName(input.option, input.selectedValues)
    || input.message
    || "远端未提供"
}

export function detailPermissionSummary(input: {
  status: DetailAgentConfigState["status"]
  state: DetailAgentConfigState
  permissionOption: SessionConfigOptionInfo | null
}) {
  if (input.status === "loading") return "加载中"
  return findModeName(input.state.modes, input.state.selectedModeId)
    || findSelectedOptionValueName(input.permissionOption, input.state.selectedValues)
    || input.state.message
    || "远端未提供"
}

export function activeModelStatusLabel(input: {
  modelSummary: string
  runtimeStatus: string
}) {
  const modelName = String(input.modelSummary || "").trim()
  if (!modelName || modelName === "加载中" || modelName === "远端未提供") {
    return ""
  }
  if (input.runtimeStatus === "thinking") return `${modelName} 思考中`
  if (input.runtimeStatus === "running_tool") return `${modelName} 执行命令中`
  return modelName
}

export function canToggleDetailConfigRow(
  key: ComposerConfigKey,
  availability: DetailConfigAvailability
) {
  if (key === "model") return availability.hasModelOptions
  if (key === "reasoning") return availability.hasReasoningOption
  if (key === "permission") return availability.hasPermissionOptions
  return false
}

export function nextExpandedConfigKey(input: {
  currentKey: ComposerConfigKey
  targetKey: ComposerConfigKey
  availability: DetailConfigAvailability
}): ComposerConfigKey {
  if (!canToggleDetailConfigRow(input.targetKey, input.availability)) return input.currentKey
  return input.currentKey === input.targetKey ? "" : input.targetKey
}

export function detailAgentConfigSelectionPayload(state: DetailAgentConfigState) {
  return {
    selectedModeId: state.selectedModeId,
    selectedValues: { ...state.selectedValues },
  }
}

export function withSelectedDetailMode(
  state: DetailAgentConfigState,
  modeId: string
): DetailAgentConfigState {
  return {
    ...state,
    selectedModeId: modeId,
  }
}

export function withSelectedDetailConfigValue(input: {
  state: DetailAgentConfigState
  configId: string
  valueId: string
}): DetailAgentConfigState {
  return {
    ...input.state,
    selectedValues: {
      ...input.state.selectedValues,
      [input.configId]: input.valueId,
    },
  }
}

export function pendingComposerConfigActions(state: DetailAgentConfigState) {
  return {
    modeId: state.selectedModeId || "",
    configValues: state.configOptions
      .map((option) => ({
        configId: option.id,
        valueId: state.selectedValues[option.id] || "",
      }))
      .filter((item) => item.configId && item.valueId),
  }
}
