import type { RelaySessionInfo } from "@/services/gateway/types"
import type { ConnectionTargetAgent } from "@/services/connectionSchema"

export function assertPairTargetAgentMatchesSelection(
  session: Pick<RelaySessionInfo, "targetAgent">,
  selectedTargetAgent: ConnectionTargetAgent
) {
  const pairedTargetAgent = session.targetAgent
  if (!pairedTargetAgent) {
    throw new Error("网关配对响应缺少目标类型，请更新 MCode Desktop 或网关后重新配对")
  }
  if (pairedTargetAgent === selectedTargetAgent) return
  throw new Error(
    `配对码属于 ${formatTargetAgentLabel(pairedTargetAgent)}，不是 ${formatTargetAgentLabel(selectedTargetAgent)}`
  )
}

function formatTargetAgentLabel(targetAgent: string) {
  if (targetAgent === "opencode") return "OpenCode"
  if (targetAgent === "mcode-desktop") return "MCode Desktop"
  if (targetAgent === "codeg") return "Codeg"
  return targetAgent
}
