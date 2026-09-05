import {
  readTaskAgentOptionMemory,
  writeTaskAgentOptionMemory,
} from "@/services/taskAgentOptionMemory"

/**
 * 「上次为这个 agent 配好的智能体选项」的本机记忆。
 *
 * 这一组判定的共同点是**错了不会报错**，只会让新建任务悄悄跑在另一套配置上（或者让
 * 「记住上次配置」静默失效），所以每条都单独锁一次。
 */
describe("task agent option memory", () => {
  const entry = {
    mode_id: "bypassPermissions",
    config_values: { model: "opus-4.6", reasoning: "high" },
    label_snapshot: { mode_label: "bypass", config_labels: { model: "Opus 4.6" } },
  }

  it("round-trips one entry per agent on the same connection", () => {
    writeTaskAgentOptionMemory("remote-a", "claude_code", entry)
    writeTaskAgentOptionMemory("remote-a", "codex", {
      mode_id: "agent",
      config_values: { model: "gpt-5-codex" },
      label_snapshot: null,
    })

    expect(readTaskAgentOptionMemory("remote-a", "claude_code")).toEqual(entry)
    expect(readTaskAgentOptionMemory("remote-a", "codex")).toEqual({
      mode_id: "agent",
      config_values: { model: "gpt-5-codex" },
      label_snapshot: null,
    })
  })

  it("keeps connections apart", () => {
    // 不同电脑上装的 agent 版本与可选取值都可能不同，一份记忆套过去会指向不存在的取值。
    writeTaskAgentOptionMemory("remote-a", "claude_code", entry)
    expect(readTaskAgentOptionMemory("remote-b", "claude_code")).toBeNull()
  })

  it("returns null for an agent it never recorded", () => {
    writeTaskAgentOptionMemory("remote-a", "claude_code", entry)
    expect(readTaskAgentOptionMemory("remote-a", "gemini")).toBeNull()
  })

  /**
   * 别名要在两侧折叠成 canonical id，否则写进去的 `codex_cli` 与下次比对用的 `codex`
   * 对不上，记忆静默失效 —— `persistSelectedAgentType` 已经记录过同一个坑。
   */
  it("folds agent aliases on both sides", () => {
    writeTaskAgentOptionMemory("remote-a", "codex_cli", entry)
    expect(readTaskAgentOptionMemory("remote-a", "codex")).toEqual(entry)
    expect(readTaskAgentOptionMemory("remote-a", "Codex-CLI")).toEqual(entry)
  })

  /**
   * 空 instanceKey 会把所有连接的记忆塌到同一个槽位上 —— 宁可不记。取不到网关时
   * 调用方传的就是空串。
   */
  it("ignores an empty connection key on both sides", () => {
    writeTaskAgentOptionMemory("", "claude_code", entry)
    expect(readTaskAgentOptionMemory("", "claude_code")).toBeNull()
    expect(readTaskAgentOptionMemory("remote-a", "claude_code")).toBeNull()
  })

  /**
   * 「没记过」与「记了一份空的」必须是两种结果：后者会被当成一份显式覆盖，从而盖住
   * 文件夹的生效设置。
   */
  it("treats an all-empty selection as no memory at all", () => {
    writeTaskAgentOptionMemory("remote-a", "claude_code", {
      mode_id: "",
      config_values: {},
      label_snapshot: { agent_label: "Claude Code" },
    })
    expect(readTaskAgentOptionMemory("remote-a", "claude_code")).toBeNull()
  })

  it("drops an existing entry when the selection becomes empty", () => {
    writeTaskAgentOptionMemory("remote-a", "claude_code", entry)
    writeTaskAgentOptionMemory("remote-a", "claude_code", {
      mode_id: null,
      config_values: {},
      label_snapshot: null,
    })
    expect(readTaskAgentOptionMemory("remote-a", "claude_code")).toBeNull()
  })

  it("overwrites the previous selection for the same agent", () => {
    writeTaskAgentOptionMemory("remote-a", "claude_code", entry)
    writeTaskAgentOptionMemory("remote-a", "claude_code", {
      mode_id: "default",
      config_values: { model: "sonnet-5" },
      label_snapshot: null,
    })
    expect(readTaskAgentOptionMemory("remote-a", "claude_code")).toEqual({
      mode_id: "default",
      config_values: { model: "sonnet-5" },
      label_snapshot: null,
    })
  })

  /**
   * **没有 TTL**：上次挑的配置不该因为放了一天就被忘掉。与探测快照缓存那 5 分钟刻意不同
   * （那份描述的是「这个 agent 此刻支持什么」）。
   */
  it("never expires the remembered selection", () => {
    const realNow = Date.now
    Date.now = () => 1_000
    try {
      writeTaskAgentOptionMemory("remote-a", "claude_code", entry)
    } finally {
      Date.now = realNow
    }
    expect(readTaskAgentOptionMemory("remote-a", "claude_code")).toEqual(entry)
  })

  it("drops junk values instead of projecting them onto a task", () => {
    writeTaskAgentOptionMemory("remote-a", "claude_code", {
      mode_id: "  plan  ",
      // 非字符串取值与空串都不是合法的 option value。
      config_values: { model: " opus-4.6 ", broken: "" } as Record<string, string>,
      label_snapshot: [] as unknown as Record<string, unknown>,
    })
    expect(readTaskAgentOptionMemory("remote-a", "claude_code")).toEqual({
      mode_id: "plan",
      config_values: { model: "opus-4.6" },
      label_snapshot: null,
    })
  })

  it("survives a storage read that returns junk", () => {
    ;(uni.setStorageSync as jest.Mock)("mcode_task_agent_options_v1", "not-an-object")
    expect(readTaskAgentOptionMemory("remote-a", "claude_code")).toBeNull()
    writeTaskAgentOptionMemory("remote-a", "claude_code", entry)
    expect(readTaskAgentOptionMemory("remote-a", "claude_code")).toEqual(entry)
  })
})
