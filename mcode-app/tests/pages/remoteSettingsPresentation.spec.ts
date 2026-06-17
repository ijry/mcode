import {
  buildAgentSummaryPresentation,
  countEditableConfigFields,
} from "@/pages/connection-agents/agentPresentation"
import {
  buildProviderAgentOptions,
  formatProviderSubtitle,
  maskProviderKey,
} from "@/pages/model-providers/providerPresentation"
import type { AcpAgentInfo, ModelProviderInfo } from "@/services/remoteSettings"

describe("remote settings presentation", () => {
  it("builds agent summary with provider binding", () => {
    const agent = makeAgent({ agent_type: "codex", model_provider_id: 9 })
    const provider = makeProvider({ id: 9, name: "OpenAI", agent_type: "codex" })

    expect(buildAgentSummaryPresentation(agent, [provider])).toEqual({
      title: "Codex",
      subtitle: "Codex agent",
      statusLabel: "可用 · 1.0.0",
      distributionLabel: "NPX / npm",
      providerLabel: "OpenAI",
    })
  })

  it("counts raw config editors that contain values", () => {
    expect(
      countEditableConfigFields({
        config_json: "{}",
        codex_config_toml: "",
        codex_auth_json: null,
        opencode_auth_json: "{\"apiKey\":\"x\"}",
      })
    ).toBe(2)
  })

  it("builds provider agent options and subtitles", () => {
    expect(buildProviderAgentOptions()).toEqual([
      { value: "claude_code", label: "Claude Code" },
      { value: "codex", label: "Codex" },
      { value: "gemini", label: "Gemini CLI" },
    ])

    expect(
      formatProviderSubtitle(
        makeProvider({ agent_type: "gemini", model: "gemini-2.5-pro" })
      )
    ).toBe("Gemini CLI · gemini-2.5-pro")
  })

  it("prefers masked provider keys", () => {
    expect(maskProviderKey(makeProvider({ api_key_masked: "sk-***1234", api_key: "sk-real" }))).toBe(
      "sk-***1234"
    )
  })
})

function makeAgent(overrides: Partial<AcpAgentInfo>): AcpAgentInfo {
  return {
    agent_type: "codex",
    registry_id: "codex",
    registry_version: "1.0.0",
    name: "Codex",
    description: "Codex agent",
    available: true,
    distribution_type: "npx",
    enabled: true,
    sort_order: 0,
    installed_version: "1.0.0",
    env: {},
    config_json: null,
    config_file_path: null,
    opencode_auth_json: null,
    codex_auth_json: null,
    codex_config_toml: null,
    cline_secrets_json: null,
    hermes_config_yaml: null,
    model_provider_id: null,
    ...overrides,
  }
}

function makeProvider(overrides: Partial<ModelProviderInfo>): ModelProviderInfo {
  return {
    id: 1,
    name: "Provider",
    api_url: "https://example.com/v1",
    api_key: "",
    api_key_masked: "",
    agent_type: "codex",
    model: null,
    created_at: "2026-06-17T00:00:00Z",
    updated_at: "2026-06-17T00:00:00Z",
    ...overrides,
  }
}
