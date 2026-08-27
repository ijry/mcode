import { normalizeAgentType } from "@/services/conversation/agentType"

describe("normalizeAgentType", () => {
  it("maps every known alias to its canonical id", () => {
    expect(normalizeAgentType("claudecode")).toBe("claude_code")
    expect(normalizeAgentType("codex_cli")).toBe("codex")
    expect(normalizeAgentType("gemini_cli")).toBe("gemini")
    expect(normalizeAgentType("google_gemini")).toBe("gemini")
    expect(normalizeAgentType("gemini_code")).toBe("gemini")
    expect(normalizeAgentType("cline_cli")).toBe("cline")
    expect(normalizeAgentType("opencode")).toBe("open_code")
    expect(normalizeAgentType("open_code_cli")).toBe("open_code")
    expect(normalizeAgentType("openclaw")).toBe("open_claw")
    expect(normalizeAgentType("open_claw_cli")).toBe("open_claw")
  })

  it("normalizes casing, padding and separators before matching", () => {
    // 服务端与本地存储都出现过带空格/短横线/大写的写法。归一化必须在别名匹配**之前**，
    // 否则 "Codex-CLI" 这种拼法会漏过别名表。
    expect(normalizeAgentType("  Codex-CLI  ")).toBe("codex")
    expect(normalizeAgentType("ClaudeCode")).toBe("claude_code")
    expect(normalizeAgentType("Open Code")).toBe("open_code")
  })

  it("defaults to claude_code for empty input", () => {
    expect(normalizeAgentType("")).toBe("claude_code")
    expect(normalizeAgentType("   ")).toBe("claude_code")
    expect(normalizeAgentType(undefined)).toBe("claude_code")
  })

  it("passes through an unknown id instead of forcing a default", () => {
    // 别名表不是封闭枚举 —— 新 agent 上线时应该原样透传（页面会退化成通用渲染），
    // 而不是被误判成 claude_code。
    expect(normalizeAgentType("brand_new_agent")).toBe("brand_new_agent")
  })

  it("is idempotent", () => {
    // 这条最要紧：同一个值在链路上会被反复归一化（写存储、读存储、渲染各一次）。
    // 不幂等的实现会让第二遍把 canonical 值又改回去。
    for (const raw of ["codex_cli", "claudecode", "opencode", "brand_new_agent", ""]) {
      const once = normalizeAgentType(raw)
      expect(normalizeAgentType(once)).toBe(once)
    }
  })
})
