import {
  forgetConversationSessionSelection,
  readConversationSessionSelection,
  rememberConversationSessionConfigValue,
  rememberConversationSessionMode,
} from "@/services/conversation/sessionModeMemory"

/**
 * 会话现场选择的本机记忆 —— 它唯一的用途是在**下一次建连**时作为
 * `preferredModeId` / `preferredConfigValues` 交回去。
 *
 * 每条判定错了都不会报错，只会让「手机上切成 bypass，回一条消息又退回 Manual」这个
 * 症状原样保留（或者更糟：把一份不属于该 agent 的模式 id 交上去）。
 */
describe("conversation session mode memory", () => {
  it("remembers the mode the user picked for a conversation", () => {
    rememberConversationSessionMode({
      conversationId: 12,
      agentType: "claude_code",
      modeId: "bypassPermissions",
    })

    expect(readConversationSessionSelection(12, "claude_code")).toEqual({
      modeId: "bypassPermissions",
      configValues: {},
    })
  })

  it("merges config values one explicit pick at a time", () => {
    rememberConversationSessionConfigValue({
      conversationId: 12,
      agentType: "claude_code",
      configId: "model",
      valueId: "opus-4.6",
    })
    rememberConversationSessionConfigValue({
      conversationId: 12,
      agentType: "claude_code",
      configId: "effort",
      valueId: "high",
    })

    expect(readConversationSessionSelection(12, "claude_code")).toEqual({
      modeId: "",
      configValues: { model: "opus-4.6", effort: "high" },
    })
  })

  it("keeps conversations apart", () => {
    rememberConversationSessionMode({
      conversationId: 12,
      agentType: "claude_code",
      modeId: "bypassPermissions",
    })
    expect(readConversationSessionSelection(13, "claude_code")).toBeNull()
  })

  /**
   * `conversationId` 只在单个远端实例内唯一，而手机可以连多台电脑。agent 对不上就当
   * 没记过 —— 把 `bypassPermissions` 交给 Codex 只会换来一次被拒绝的 `set_mode`。
   */
  it("ignores a record that belongs to another agent", () => {
    rememberConversationSessionMode({
      conversationId: 12,
      agentType: "claude_code",
      modeId: "bypassPermissions",
    })
    expect(readConversationSessionSelection(12, "codex")).toBeNull()
  })

  it("folds agent aliases so the record still matches", () => {
    rememberConversationSessionMode({
      conversationId: 12,
      agentType: "codex_cli",
      modeId: "agent",
    })
    expect(readConversationSessionSelection(12, "codex")).toEqual({
      modeId: "agent",
      configValues: {},
    })
  })

  /** 换 agent 要从零开始：旧 agent 的取值在新 agent 上没有意义。 */
  it("starts over when the conversation switches agent", () => {
    rememberConversationSessionMode({
      conversationId: 12,
      agentType: "claude_code",
      modeId: "bypassPermissions",
    })
    rememberConversationSessionConfigValue({
      conversationId: 12,
      agentType: "claude_code",
      configId: "model",
      valueId: "opus-4.6",
    })
    rememberConversationSessionConfigValue({
      conversationId: 12,
      agentType: "codex",
      configId: "model",
      valueId: "gpt-5-codex",
    })

    expect(readConversationSessionSelection(12, "claude_code")).toBeNull()
    expect(readConversationSessionSelection(12, "codex")).toEqual({
      modeId: "",
      configValues: { model: "gpt-5-codex" },
    })
  })

  it("ignores unusable ids on both sides", () => {
    rememberConversationSessionMode({ conversationId: 0, agentType: "claude_code", modeId: "plan" })
    rememberConversationSessionMode({ conversationId: 12, agentType: "claude_code", modeId: "  " })
    rememberConversationSessionConfigValue({
      conversationId: 12,
      agentType: "claude_code",
      configId: "model",
      valueId: "",
    })

    expect(readConversationSessionSelection(0, "claude_code")).toBeNull()
    expect(readConversationSessionSelection(12, "claude_code")).toBeNull()
  })

  it("forgets one conversation on request", () => {
    rememberConversationSessionMode({
      conversationId: 12,
      agentType: "claude_code",
      modeId: "bypassPermissions",
    })
    forgetConversationSessionSelection(12)
    expect(readConversationSessionSelection(12, "claude_code")).toBeNull()
  })

  /**
   * 一个会话一条、只增不减，不设上限就是一条永远长大的 localStorage 记录。超出时丢
   * 最旧的（那些会话早就不在手边了），**并且保住最近写的那一条**。
   */
  it("caps the map instead of growing without bound", () => {
    const realNow = Date.now
    let clock = 1_000
    Date.now = () => (clock += 1_000)
    try {
      for (let id = 1; id <= 130; id += 1) {
        rememberConversationSessionMode({
          conversationId: id,
          agentType: "claude_code",
          modeId: "bypassPermissions",
        })
      }
    } finally {
      Date.now = realNow
    }

    expect(readConversationSessionSelection(130, "claude_code")).not.toBeNull()
    expect(readConversationSessionSelection(1, "claude_code")).toBeNull()
    const stored = uni.getStorageSync("mcode_conversation_session_mode_v1")
    expect(Object.keys(stored as Record<string, unknown>).length).toBeLessThanOrEqual(120)
  })

  it("survives a storage read that returns junk", () => {
    uni.setStorageSync("mcode_conversation_session_mode_v1", "not-an-object")
    expect(readConversationSessionSelection(12, "claude_code")).toBeNull()
    rememberConversationSessionMode({
      conversationId: 12,
      agentType: "claude_code",
      modeId: "plan",
    })
    expect(readConversationSessionSelection(12, "claude_code")).toEqual({
      modeId: "plan",
      configValues: {},
    })
  })
})
