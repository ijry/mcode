import {
  getAgentAvailabilityPresentation,
  getAgentDistributionPresentation,
  getAgentLabel,
  isModelProviderAgentType,
  type AcpAgentInfo,
  type ModelProviderInfo,
} from "@/services/remoteSettings"

export interface AgentSummaryPresentation {
  title: string
  subtitle: string
  statusLabel: string
  distributionLabel: string
  providerLabel: string
}

export function buildAgentSummaryPresentation(
  agent: AcpAgentInfo,
  providers: ModelProviderInfo[]
): AgentSummaryPresentation {
  const availability = getAgentAvailabilityPresentation(agent)
  const distribution = getAgentDistributionPresentation(agent.distribution_type)
  const provider = providers.find((item) => item.id === agent.model_provider_id)
  return {
    title: getAgentLabel(agent.agent_type),
    subtitle: agent.description || agent.name || agent.agent_type,
    statusLabel: availability.label,
    distributionLabel: distribution.label,
    providerLabel: provider?.name || (isModelProviderAgentType(agent.agent_type) ? "未绑定供应商" : "不支持供应商"),
  }
}

export function countEditableConfigFields(agent: Pick<
  AcpAgentInfo,
  "config_json" | "codex_config_toml" | "codex_auth_json" | "opencode_auth_json"
>) {
  return [
    agent.config_json,
    agent.codex_config_toml,
    agent.codex_auth_json,
    agent.opencode_auth_json,
  ].filter((value) => typeof value === "string" && value.trim()).length
}
