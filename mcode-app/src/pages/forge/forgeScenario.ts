import type { ForgeItemKind, ForgePanelSettings, ForgeScenarioId } from "@/types/forge"

/**
 * 「处理成任务」的场景选择。**纯模块**。
 *
 * 场景是一个**模板名**，服务端据此选一段自己的指令文本 —— 提示词永远不过线
 * （见 `codeg-plus/src-tauri/src/commands/forge.rs` 的信任边界注释）。客户端只负责
 * 让用户挑一个名字。
 *
 * 每个 issue 模板都以「先确认问题真的存在」开头，所以这里**没有**「只调查」这一项：
 * 那个选项曾经存在过，服务端现在会**拒绝**它而不是映射到别的场景 —— 它承诺过 agent
 * 不碰代码，而吸收了它的两个流程都可能提交。
 */

export interface ForgeScenarioOption {
  id: ForgeScenarioId
  label: string
  hint: string
}

/** issue 的两种处理方式。 */
const ISSUE_SCENARIOS: ForgeScenarioOption[] = [
  {
    id: "fix",
    label: "直接修复 / 实现",
    hint: "先在工作区里确认问题真的存在，再动手修 —— 确认不了就实地报告，不硬改代码。",
  },
  {
    id: "plan_first",
    label: "先出方案",
    hint: "确认问题后产出实施方案并停下；你确认后可以把任务退回来，在同一个工作区继续实施。",
  },
]

/** PR / MR 的两种处理方式。 */
const PR_SCENARIOS: ForgeScenarioOption[] = [
  {
    id: "review_fix",
    label: "评审并修复",
    hint: "评审这个变更，顺手修掉发现的问题，验收后提交会推回原分支。",
  },
  {
    id: "review_only",
    label: "只评审",
    hint: "只产出评审报告（问题、位置、建议），不改代码 —— 需要时把任务退回来即可。",
  },
]

export function forgeScenariosFor(kind: ForgeItemKind): ForgeScenarioOption[] {
  return kind === "pr" ? PR_SCENARIOS : ISSUE_SCENARIOS
}

/** 该 kind 的内置默认（与服务端 `ForgeScenario` 的默认一致）。 */
export function defaultForgeScenario(kind: ForgeItemKind): ForgeScenarioId {
  return kind === "pr" ? "review_fix" : "fix"
}

/**
 * 弹层打开时预选哪一个。
 *
 * 面板设置里存的是一个**字符串**（服务端不做白名单校验，未来可能新增场景），所以
 * 这里要检查它是不是这个 kind 提供的选项之一 —— 一个属于另一个 kind 的默认值
 * （比如给 issue 存了 `review_fix`）会让弹层打开时什么都没选上。
 */
export function initialForgeScenario(
  kind: ForgeItemKind,
  settings: ForgePanelSettings | null
): ForgeScenarioId {
  const stored = kind === "pr" ? settings?.default_pr_scenario : settings?.default_issue_scenario
  const options = forgeScenariosFor(kind)
  if (stored && options.some((option) => option.id === stored)) return stored
  return defaultForgeScenario(kind)
}

/**
 * 这个场景会带上的常驻提示词（`all` + 该场景自己的，拼成一段）。
 *
 * 与服务端 `ForgePanelSettings::standing_prompt` 同一套顺序与拼法 —— 弹层的预览要与
 * 任务真正收到的东西一致，否则那个预览是在撒谎。
 */
export function forgeStandingPrompt(
  scenario: ForgeScenarioId,
  settings: ForgePanelSettings | null
): string {
  if (!settings) return ""
  const parts = ["all", scenario]
    .map((key) => String(settings.scenario_prompts?.[key] || "").trim())
    .filter(Boolean)
  return parts.join("\n\n")
}

/* ===== 任务芯片 ===== */

/** 行上的三态动作。 */
export type ForgeChipState = "none" | "active" | "terminal"

/**
 * 非终态的任务状态。
 *
 * 镜像后端的 `ACTIVE_STATUSES`。**不做白名单外的猜测**：一个我们不认识的状态按
 * 终态处理（给「再次处理」）比按活跃处理更安全 —— 后者会让一个其实已经结束的任务
 * 挡住用户重新触发。
 */
const ACTIVE_TASK_STATUSES = new Set([
  "todo",
  "queued",
  "preparing",
  "running",
  "awaiting_input",
  "review",
  "merging",
])

/**
 * 一行该显示哪种动作。
 *
 * - 没有任务 → 「处理」；
 * - 有活跃任务 → 状态芯片（点进看板）；
 * - 有终态任务 → 状态芯片 + 「再次处理」。
 */
export function forgeChipState(link: { status: string } | null | undefined): ForgeChipState {
  if (!link) return "none"
  return ACTIVE_TASK_STATUSES.has(link.status) ? "active" : "terminal"
}

/** 任务状态的显示文案。未知状态原样透传 —— 服务端可能新增状态。 */
export function forgeTaskStatusLabel(status: string): string {
  switch (status) {
    case "todo":
      return "待处理"
    case "queued":
      return "排队中"
    case "preparing":
      return "准备中"
    case "running":
      return "进行中"
    case "awaiting_input":
      return "等待输入"
    case "review":
      return "待验收"
    case "merging":
      return "合并中"
    case "done":
      return "已完成"
    case "canceled":
      return "已取消"
    case "failed":
      return "已失败"
    default:
      return status || "未知"
  }
}

/** 任务状态的色调（`themeVar` 为空 = 用字面兜底）。 */
export function forgeTaskStatusTone(status: string): { themeVar: string; fallback: string } {
  switch (status) {
    case "running":
    case "preparing":
    case "merging":
      return { themeVar: "--up-primary", fallback: "#2979ff" }
    case "awaiting_input":
    case "review":
      return { themeVar: "--up-warning", fallback: "#ff9900" }
    case "done":
      return { themeVar: "--up-success", fallback: "#19be6b" }
    case "failed":
      return { themeVar: "--up-error", fallback: "#fa3534" }
    default:
      return { themeVar: "--up-content-color", fallback: "#606266" }
  }
}
