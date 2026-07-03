import {
  createRemoteQuickMessage,
  deleteRemoteQuickMessage,
  getRemoteDelegationSettings,
  getRemoteFeedbackSettings,
  getRemoteLanguageSettings,
  getRemoteQuestionSettings,
  isUnsupportedSettingsCommand,
  listRemoteQuickMessages,
  normalizeDelegationSettings,
  normalizeLanguageSettings,
  setRemoteDelegationSettings,
  setRemoteFeedbackSettings,
  setRemoteQuestionSettings,
  updateRemoteLanguageSettings,
  updateRemoteQuickMessage,
} from "@/services/connectionDetailSettings"

describe("connectionDetailSettings service", () => {
  it("normalizes language settings", () => {
    expect(normalizeLanguageSettings({ mode: "manual", language: "zh_cn" })).toEqual({
      mode: "manual",
      language: "zh_cn",
    })
    expect(normalizeLanguageSettings({ mode: "bad", language: "bad" })).toEqual({
      mode: "system",
      language: "en",
    })
  })

  it("normalizes delegation settings with bounded numbers", () => {
    expect(
      normalizeDelegationSettings({
        enabled: true,
        depth_limit: 12,
        completed_cache_max_mb: -1,
        agent_defaults: { codex: {} },
      })
    ).toEqual({
      enabled: true,
      depth_limit: 8,
      completed_cache_max_mb: 0,
      agent_defaults: { codex: {} },
    })
  })

  it("calls desktop setting commands with expected payloads", async () => {
    const gateway = { call: jest.fn().mockResolvedValue({ enabled: true }) }

    await getRemoteLanguageSettings(gateway as any)
    await updateRemoteLanguageSettings(gateway as any, { mode: "manual", language: "zh_cn" })
    await getRemoteDelegationSettings(gateway as any)
    await setRemoteDelegationSettings(gateway as any, {
      enabled: true,
      depth_limit: 2,
      completed_cache_max_mb: 512,
    })
    await listRemoteQuickMessages(gateway as any)
    await createRemoteQuickMessage(gateway as any, { title: "A", content: "B" })
    await updateRemoteQuickMessage(gateway as any, { id: 1, title: "C", content: "D" })
    await deleteRemoteQuickMessage(gateway as any, 1)
    await getRemoteFeedbackSettings(gateway as any)
    await setRemoteFeedbackSettings(gateway as any, { enabled: true })
    await getRemoteQuestionSettings(gateway as any)
    await setRemoteQuestionSettings(gateway as any, { enabled: false })

    expect(gateway.call).toHaveBeenCalledWith("get_system_language_settings")
    expect(gateway.call).toHaveBeenCalledWith("update_system_language_settings", {
      settings: { mode: "manual", language: "zh_cn" },
    })
    expect(gateway.call).toHaveBeenCalledWith("get_delegation_settings")
    expect(gateway.call).toHaveBeenCalledWith("set_delegation_settings", {
      settings: { enabled: true, depth_limit: 2, completed_cache_max_mb: 512 },
    })
    expect(gateway.call).toHaveBeenCalledWith("quick_messages_list")
    expect(gateway.call).toHaveBeenCalledWith("quick_messages_create", {
      title: "A",
      content: "B",
    })
    expect(gateway.call).toHaveBeenCalledWith("quick_messages_update", {
      id: 1,
      title: "C",
      content: "D",
    })
    expect(gateway.call).toHaveBeenCalledWith("quick_messages_delete", { id: 1 })
    expect(gateway.call).toHaveBeenCalledWith("get_feedback_settings")
    expect(gateway.call).toHaveBeenCalledWith("set_feedback_settings", {
      settings: { enabled: true },
    })
    expect(gateway.call).toHaveBeenCalledWith("get_question_settings")
    expect(gateway.call).toHaveBeenCalledWith("set_question_settings", {
      settings: { enabled: false },
    })
  })

  it("detects unsupported command errors", () => {
    expect(isUnsupportedSettingsCommand(new Error("404 not found"))).toBe(true)
    expect(isUnsupportedSettingsCommand("unsupported desktop folder command")).toBe(true)
    expect(isUnsupportedSettingsCommand(new Error("network timeout"))).toBe(false)
  })
})
