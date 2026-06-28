import type { RelaySessionInfo } from "@/services/gateway/types"
import type { ConnectionTargetAgent } from "@/services/connectionSchema"

export function assertPairTargetAgentMatchesSelection(
  session: Pick<RelaySessionInfo, "targetAgent">,
  selectedTargetAgent: ConnectionTargetAgent
) {
  const pairedTargetAgent = session.targetAgent
  if (!pairedTargetAgent || pairedTargetAgent === selectedTargetAgent) return
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
