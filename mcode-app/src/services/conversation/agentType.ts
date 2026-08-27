/**
 * agent 类型标识的唯一归一化实现。
 *
 * **抽出来的理由是仓库里曾有 7 份副本，且其中 2 份是弱化版。** 完整版会把别名映射到
 * canonical id（`codex_cli` → `codex`）；`mobileDetailTabs.ts` 与 `pcTabSyncService.ts`
 * 那两份只做了 lowercase + 分隔符替换，**不映射别名**。于是同一个 agent 在写 tab 记录时
 * 存成 `codex_cli`、在别处一律是 `codex`。
 *
 * 目前没有可见故障，因为读取侧（`pages/conversation-detail/index.vue` 切 tab 时）又归一化
 * 了一遍，把差异盖住了。但 `pcTabSyncService` 会把这个值**发到 PC 端**，那一侧没有这层
 * 兜底；而且任何新增的 `agentType === "codex"` 判断都会在 tab 这条路上静默失配。
 *
 * 放在 `services/` 而不是页面模块：它被 services 层（tab 同步、落库、快照）和页面层同时
 * 使用。此前的 canonical 版本住在 `pages/conversation-detail/detailDataNormalization.ts`，
 * 导致 service 想复用就得反向依赖页面 —— 那正是那两份弱化副本出现的原因。
 *
 * **必须幂等**：同一个值在链路上会被反复归一化（写存储、读存储、渲染各一次）。
 */
const AGENT_TYPE_ALIASES: Record<string, string> = {
  claudecode: "claude_code",
  codex_cli: "codex",
  gemini_cli: "gemini",
  google_gemini: "gemini",
  gemini_code: "gemini",
  cline_cli: "cline",
  opencode: "open_code",
  open_code_cli: "open_code",
  openclaw: "open_claw",
  open_claw_cli: "open_claw",
}

export function normalizeAgentType(raw?: string): string {
  // 归一化必须在别名匹配**之前** —— 否则 "Codex-CLI" 这种拼法会漏过别名表。
  const value = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]/g, "_")
  if (!value) return "claude_code"
  // 未知 id 原样透传：别名表不是封闭枚举，新 agent 上线时应退化成通用渲染，
  // 而不是被误判成 claude_code。
  return AGENT_TYPE_ALIASES[value] ?? value
}
