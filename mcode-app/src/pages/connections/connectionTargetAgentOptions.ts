import type { ConnectionTargetAgent } from "@/services/connectionSchema"

/**
 * 新增/编辑连接表单里的「目标类型」选项。
 *
 * OpenCode 与 MCode Desktop 暂时隐藏（产品决定先只对外暴露 Codeg），但**不能**从选项表里
 * 删掉：`editConnection()` 会把存量记录的 `targetAgent` 灌进表单，选项表里查不到就会把
 * 下标算成 0，用户一保存就把一条 mcode-desktop 连接静默改成 codeg。所以这里保留全量，
 * 只用 `hidden` 标记，再由 `getVisibleTargetAgentOptions()` 按当前选中值放行。
 */

export interface TargetAgentOption {
  label: string
  value: ConnectionTargetAgent
  hidden?: boolean
}

export const TARGET_AGENT_OPTIONS: TargetAgentOption[] = [
  { label: "Codeg", value: "codeg" },
  { label: "OpenCode", value: "opencode", hidden: true },
  { label: "MCode Desktop", value: "mcode-desktop", hidden: true },
]

/**
 * 可见选项 = 未隐藏的选项，外加「当前已选中的隐藏选项」。
 *
 * 后者是为编辑存量记录留的口子：一条已保存的 mcode-desktop 连接打开表单时必须能看到
 * 自己的目标类型，否则界面显示的和即将保存的不是一回事。顺序按 `TARGET_AGENT_OPTIONS`
 * 原序，避免选中项忽然跳到列表尾部。
 */
export function getVisibleTargetAgentOptions(
  selected?: ConnectionTargetAgent
): TargetAgentOption[] {
  return TARGET_AGENT_OPTIONS.filter((option) => !option.hidden || option.value === selected)
}

/** 选中值在可见选项里的下标；查不到返回 0，交给调用方的默认值兜底。 */
export function getTargetAgentIndex(selected?: ConnectionTargetAgent): number {
  const index = getVisibleTargetAgentOptions(selected).findIndex(
    (option) => option.value === selected
  )
  return index >= 0 ? index : 0
}

export function resolveTargetAgentByIndex(
  index: number,
  selected?: ConnectionTargetAgent
): ConnectionTargetAgent {
  return getVisibleTargetAgentOptions(selected)[index]?.value || "codeg"
}

/**
 * 配对代码提示语。只剩一个目标类型时不要再罗列另外两个 —— 那会把刚隐藏掉的东西
 * 又念一遍。
 */
export function getPairCodeTip(selected?: ConnectionTargetAgent): string {
  const visible = getVisibleTargetAgentOptions(selected)
  if (visible.length <= 1) {
    return `请使用 ${visible[0]?.label || "Codeg"} 生成的配对代码。`
  }
  return `请使用所选目标生成的配对代码。${visible
    .map((option) => option.label)
    .join("、")} 可以分别通过同一网关连接。`
}
