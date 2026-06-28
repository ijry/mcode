import type { RelaySessionInfo } from "@/services/gateway"
import type { ConnectionTargetAgent } from "@/services/connectionSchema"
import { getConnectionTargetLabel } from "./connectionPresentation"

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
  if (
    targetAgent === "codeg" ||
    targetAgent === "opencode" ||
    targetAgent === "mcode-desktop"
  ) {
    return getConnectionTargetLabel({ targetAgent })
  }
  return targetAgent
}

