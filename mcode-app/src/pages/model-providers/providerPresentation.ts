import {
  AGENT_LABELS,
  MODEL_PROVIDER_AGENT_TYPES,
  type ModelProviderAgentType,
  type ModelProviderInfo,
} from "@/services/remoteSettings"

export interface ProviderAgentOption {
  label: string
  value: ModelProviderAgentType
}

export function buildProviderAgentOptions(): ProviderAgentOption[] {
  return MODEL_PROVIDER_AGENT_TYPES.map((value) => ({
    value,
    label: AGENT_LABELS[value],
  }))
}

export function formatProviderSubtitle(provider: ModelProviderInfo) {
  const model = provider.model?.trim() || "默认模型"
  return `${AGENT_LABELS[provider.agent_type]} · ${model}`
}

export function maskProviderKey(provider: Pick<ModelProviderInfo, "api_key_masked" | "api_key">) {
  return provider.api_key_masked || provider.api_key || "未设置 API Key"
}
