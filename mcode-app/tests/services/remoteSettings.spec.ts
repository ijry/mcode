import {
  ACP_AGENTS_UPDATED_EVENT_CHANNEL,
  AGENT_INSTALL_EVENT_CHANNEL,
  buildConnectionAgentsRoute,
  buildModelProvidersRoute,
  createAgentTaskId,
  createRemoteModelProvider,
  deleteRemoteModelProvider,
  downloadRemoteAgentBinary,
  getAgentAvailabilityPresentation,
  getAgentDistributionPresentation,
  installRemoteUvTool,
  listRemoteAgents,
  normalizeAgentInstallEvent,
  normalizeAgentsUpdatedEvent,
  normalizeGlobalEventFrame,
  parseEnvText,
  prepareRemoteNpxAgent,
  reorderRemoteAgents,
  serializeEnvText,
  uninstallRemoteAgent,
  updateRemoteAgentConfig,
  updateRemoteAgentEnv,
  updateRemoteModelProvider,
  type AcpAgentInfo,
} from "@/services/remoteSettings"

describe("remoteSettings service", () => {
  it("builds connection-scoped routes", () => {
    expect(buildConnectionAgentsRoute({ encodedConnection: "ctx123" })).toBe(
      "/pages/connection-agents/index?connection=ctx123"
    )
    expect(buildModelProvidersRoute({ encodedConnection: "ctx123" })).toBe(
      "/pages/model-providers/index?connection=ctx123"
    )
  })

  it("parses KEY=value env text and ignores comments or invalid keys", () => {
    expect(
      parseEnvText(`
# comment
API_KEY=abc=123
EMPTY=
1BAD=value
 VALID_KEY = spaced
NO_SEPARATOR
`)
    ).toEqual({
      API_KEY: "abc=123",
      EMPTY: "",
      VALID_KEY: " spaced",
    })
  })

  it("serializes env text with stable key order", () => {
    expect(serializeEnvText({ ZED: "last", ALPHA: "first", EMPTY: "" })).toBe(
      "ALPHA=first\nEMPTY=\nZED=last"
    )
  })

  it("normalizes gateway global event frames", () => {
    expect(
      normalizeGlobalEventFrame({
        channel: AGENT_INSTALL_EVENT_CHANNEL,
        payload: { task_id: "task-1" },
      })
    ).toEqual({
      channel: AGENT_INSTALL_EVENT_CHANNEL,
      payload: { task_id: "task-1" },
    })

    expect(
      normalizeGlobalEventFrame({
        channel: "acp://event",
        payload: {
          channel: ACP_AGENTS_UPDATED_EVENT_CHANNEL,
          payload: { reason: "preferences" },
        },
      })
    ).toEqual({
      channel: ACP_AGENTS_UPDATED_EVENT_CHANNEL,
      payload: { reason: "preferences" },
    })
  })

  it("normalizes install and agent update event payloads", () => {
    expect(
      normalizeAgentInstallEvent({
        task_id: "task-1",
        kind: "log",
        payload: "downloaded",
      })
    ).toEqual({ task_id: "task-1", kind: "log", payload: "downloaded" })

    expect(
      normalizeAgentsUpdatedEvent({ reason: "env", agent_type: "codex" })
    ).toEqual({ reason: "env", agent_type: "codex" })
  })

  it("creates task ids with operation and agent hints", () => {
    const id = createAgentTaskId("Prepare NPX", "codex")
    expect(id).toMatch(/^mcode-prepare-npx-codex-[a-z0-9]+-[a-z0-9]+$/)
  })

  it("sorts remote agents by backend sort order then label", async () => {
    const agents: AcpAgentInfo[] = [
      makeAgent({ agent_type: "gemini", sort_order: 2, name: "Gemini CLI" }),
      makeAgent({ agent_type: "codex", sort_order: 1, name: "Codex" }),
    ]
    const gateway = {
      call: jest.fn().mockResolvedValue(agents),
    }

    await expect(listRemoteAgents(gateway as any)).resolves.toEqual([
      agents[1],
      agents[0],
    ])
    expect(gateway.call).toHaveBeenCalledWith("acp_list_agents")
  })

  it("uses backend payload names for agent updates and tasks", async () => {
    const gateway = {
      call: jest.fn().mockResolvedValue(0),
    }

    await updateRemoteAgentEnv(gateway as any, "codex", {
      enabled: true,
      env: { OPENAI_API_KEY: "sk-test" },
      modelProviderId: 7,
    })
    await updateRemoteAgentConfig(gateway as any, "codex", {
      config_json: "{}",
      codex_auth_json: "{\"token\":\"x\"}",
      codex_config_toml: "model = \"gpt-5\"",
      opencode_auth_json: null,
    })
    await reorderRemoteAgents(gateway as any, ["codex", "gemini"])
    await downloadRemoteAgentBinary(gateway as any, "open_code", "task-1", "1.2.3")
    await installRemoteUvTool(gateway as any, "task-2")
    await prepareRemoteNpxAgent(gateway as any, "gemini", "0.1.0", "task-3", true)
    await uninstallRemoteAgent(gateway as any, "codex", "task-4")

    expect(gateway.call).toHaveBeenCalledWith("acp_update_agent_env", {
      agentType: "codex",
      enabled: true,
      env: { OPENAI_API_KEY: "sk-test" },
      modelProviderId: 7,
    })
    expect(gateway.call).toHaveBeenCalledWith("acp_update_agent_config", {
      agentType: "codex",
      configJson: "{}",
      codexAuthJson: "{\"token\":\"x\"}",
      codexConfigToml: "model = \"gpt-5\"",
      opencodeAuthJson: null,
    })
    expect(gateway.call).toHaveBeenCalledWith("acp_reorder_agents", {
      agentTypes: ["codex", "gemini"],
    })
    expect(gateway.call).toHaveBeenCalledWith("acp_download_agent_binary", {
      agentType: "open_code",
      version: "1.2.3",
      taskId: "task-1",
    })
    expect(gateway.call).toHaveBeenCalledWith("acp_install_uv_tool", {
      taskId: "task-2",
    })
    expect(gateway.call).toHaveBeenCalledWith("acp_prepare_npx_agent", {
      agentType: "gemini",
      registryVersion: "0.1.0",
      version: null,
      cleanFirst: true,
      taskId: "task-3",
    })
    expect(gateway.call).toHaveBeenCalledWith("acp_uninstall_agent", {
      agentType: "codex",
      taskId: "task-4",
    })
  })

  it("uses backend payload names for provider CRUD", async () => {
    const gateway = {
      call: jest.fn().mockResolvedValue({}),
    }

    await createRemoteModelProvider(gateway as any, {
      name: "OpenAI",
      apiUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      agentType: "codex",
      model: "gpt-5",
    })
    await updateRemoteModelProvider(gateway as any, {
      id: 3,
      name: "OpenAI 2",
      apiUrl: "https://example.com/v1",
      apiKey: "",
      agentType: "gemini",
      model: "gemini-2.5-pro",
    })
    await deleteRemoteModelProvider(gateway as any, 3)

    expect(gateway.call).toHaveBeenCalledWith("create_model_provider", {
      name: "OpenAI",
      apiUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      agentType: "codex",
      model: "gpt-5",
    })
    expect(gateway.call).toHaveBeenCalledWith("update_model_provider", {
      id: 3,
      name: "OpenAI 2",
      apiUrl: "https://example.com/v1",
      apiKey: "",
      agentType: "gemini",
      model: "gemini-2.5-pro",
    })
    expect(gateway.call).toHaveBeenCalledWith("delete_model_provider", { id: 3 })
  })

  it("formats agent list presentation helpers", () => {
    expect(
      getAgentAvailabilityPresentation({
        enabled: false,
        available: true,
        installed_version: "1.0.0",
      })
    ).toEqual({ label: "已停用", tone: "warning" })

    expect(getAgentDistributionPresentation("npx")).toEqual({
      label: "NPX / npm",
      actionLabel: "Prepare",
    })
  })
})

function makeAgent(overrides: Partial<AcpAgentInfo>): AcpAgentInfo {
  return {
    agent_type: "codex",
    registry_id: "codex",
    registry_version: "1.0.0",
    name: "Codex",
    description: "",
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
