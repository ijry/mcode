import {
  AGENT_LIST_CACHE_TTL_MS,
  buildAgentConfigContextKey,
  hasSessionModeOptions,
  persistAgentListCache,
  persistSelectedAgentType,
  readFreshAgentListCache,
  readPersistedSelectedAgentType,
} from "@/services/conversation/composerTools"

describe("buildAgentConfigContextKey", () => {
  it("keeps create-flow keys stable when no scope is provided", () => {
    expect(buildAgentConfigContextKey("remote-a", "Codex", "/workspace/demo")).toBe(
      JSON.stringify(["remote-a", "codex", "/workspace/demo"])
    )
  })

  it("separates detail selections by explicit conversation scope", () => {
    const left = buildAgentConfigContextKey("remote-a", "codex", "/workspace/demo", 101)
    const right = buildAgentConfigContextKey("remote-a", "codex", "/workspace/demo", 202)

    expect(left).not.toBe(right)
    expect(left).toBe(JSON.stringify(["remote-a", "codex", "/workspace/demo", "101"]))
    expect(right).toBe(JSON.stringify(["remote-a", "codex", "/workspace/demo", "202"]))
  })

  it("treats returned session modes as create-flow authorization options", () => {
    expect(hasSessionModeOptions(null)).toBe(false)
    expect(hasSessionModeOptions({ current_mode_id: "", available_modes: [] })).toBe(false)
    expect(hasSessionModeOptions({
      current_mode_id: "agent",
      available_modes: [{ id: "agent", name: "Agent" }],
    })).toBe(true)
  })
})

describe("agent list cache", () => {
  const options = [
    { value: "codex", label: "Codex", description: "" },
    { value: "claude_code", label: "Claude Code", description: "" },
  ]

  it("round-trips the agent list per connection", () => {
    persistAgentListCache("conn-a", options)
    persistAgentListCache("conn-b", [options[0]])

    expect(readFreshAgentListCache("conn-a")).toEqual(options)
    expect(readFreshAgentListCache("conn-b")).toEqual([options[0]])
  })

  it("returns null for a connection it never cached", () => {
    persistAgentListCache("conn-a", options)
    expect(readFreshAgentListCache("conn-z")).toBeNull()
  })

  it("ignores an empty connection key on both sides", () => {
    // 空 key 会把所有连接的缓存塌到同一个槽位上 —— 宁可不缓存。
    persistAgentListCache("", options)
    expect(readFreshAgentListCache("")).toBeNull()
  })

  // 这是本次抽取最容易踩的坑：`composerTools` 自己的 agent **配置**缓存 TTL 是 5 分钟，
  // 而列表页的 agent **列表**缓存一直是 24 小时。两个常量原本同名
  // （CREATE_AGENT_CACHE_TTL_MS），各在自己文件里。合并时若让列表缓存沿用
  // composerTools 的默认 TTL，24 小时会静默缩成 5 分钟 —— 表现是「每次打开新建弹层
  // 都要重新拉一遍智能体列表」，而没有任何报错。
  it("keeps the 24h list TTL instead of the 5min config TTL", () => {
    expect(AGENT_LIST_CACHE_TTL_MS).toBe(24 * 60 * 60 * 1000)
  })

  it("drops an entry older than the list TTL", () => {
    const realNow = Date.now
    try {
      persistAgentListCache("conn-a", options)
      Date.now = () => realNow() + AGENT_LIST_CACHE_TTL_MS + 1
      expect(readFreshAgentListCache("conn-a")).toBeNull()
    } finally {
      Date.now = realNow
    }
  })

  it("keeps an entry that is still inside the list TTL", () => {
    const realNow = Date.now
    try {
      persistAgentListCache("conn-a", options)
      // 6 分钟：早已超过配置缓存的 5 分钟 TTL，但远未到列表的 24 小时。
      Date.now = () => realNow() + 6 * 60 * 1000
      expect(readFreshAgentListCache("conn-a")).toEqual(options)
    } finally {
      Date.now = realNow
    }
  })
})

describe("selected agent type memory", () => {
  it("remembers the last picked agent per connection", () => {
    persistSelectedAgentType("conn-a", "codex")
    persistSelectedAgentType("conn-b", "claude_code")

    expect(readPersistedSelectedAgentType("conn-a")).toBe("codex")
    expect(readPersistedSelectedAgentType("conn-b")).toBe("claude_code")
  })

  it("normalizes the stored agent type on both write and read", () => {
    // 服务端可能给 `codex_cli` / `ClaudeCode` 这类别名。不归一化的话，存进去的值与
    // 下次比对用的归一化值对不上，「记住上次选择」就会静默失效。
    persistSelectedAgentType("conn-a", "codex_cli")
    expect(readPersistedSelectedAgentType("conn-a")).toBe("codex")

    persistSelectedAgentType("conn-b", "ClaudeCode")
    expect(readPersistedSelectedAgentType("conn-b")).toBe("claude_code")
  })

  it("returns an empty string when nothing was remembered", () => {
    expect(readPersistedSelectedAgentType("conn-none")).toBe("")
    expect(readPersistedSelectedAgentType("")).toBe("")
  })

  it("ignores an empty agent type instead of storing a blank choice", () => {
    persistSelectedAgentType("conn-a", "codex")
    persistSelectedAgentType("conn-a", "")
    expect(readPersistedSelectedAgentType("conn-a")).toBe("codex")
  })

  // 选择记忆**没有** TTL：用户上次挑的智能体不该因为放了一天就被忘掉。
  // 这条与上面列表缓存的 TTL 断言成对 —— 两者刻意不同。
  it("never expires the remembered choice", () => {
    const realNow = Date.now
    try {
      persistSelectedAgentType("conn-a", "codex")
      Date.now = () => realNow() + 30 * 24 * 60 * 60 * 1000
      expect(readPersistedSelectedAgentType("conn-a")).toBe("codex")
    } finally {
      Date.now = realNow
    }
  })
})
