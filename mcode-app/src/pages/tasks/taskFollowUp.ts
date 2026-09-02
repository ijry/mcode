import type { WorkTaskFollowUpIntent } from "@/types/workTask"

/**
 * 对待验收任务「继续处理」的四种意图。
 *
 * 界面上只给**一个**中性的「继续处理」动作，意图决定服务端拿什么措辞包裹用户输入。
 * 这个区分是关键：同一句话在「改这里」「顺便也做这个」「解释一下」下含义完全不同，
 * 而一个被告知「工作被退回」的 agent 无论如何都会开始改文件 —— 包括用户其实只想
 * 要一个答复的时候。
 *
 * 镜像 `codeg-plus/src-tauri/src/models/work_task.rs` 的 `FollowUpIntent`；
 * 数组顺序就是 chip 顺序。
 */

export interface FollowUpScenario {
  intent: WorkTaskFollowUpIntent
  label: string
  /** up-icon 名。 */
  icon: string
  placeholder: string
  /**
   * 这个意图**不带文字也是一条完整指令**吗。只有自查是：
   * 「验收前你再看一遍」不需要任何补充，而把它做成一键正是它大部分的价值。
   */
  allowsEmpty: boolean
}

export const FOLLOW_UP_SCENARIOS: FollowUpScenario[] = [
  {
    // 第一个，也是默认值：这就是这个动作长出意图之前的行为，连服务端提示词都一样。
    intent: "revise",
    label: "修改返工",
    icon: "edit-pen",
    placeholder: "希望 agent 改哪里？会在同一会话里继续。",
    allowsEmpty: false,
  },
  {
    intent: "continue",
    label: "继续推进",
    icon: "list",
    placeholder: "接下来还要做什么？已有的工作会保留。",
    allowsEmpty: false,
  },
  {
    intent: "question",
    label: "提问答疑",
    icon: "question-circle",
    placeholder: "想了解什么？agent 只回答，不会改动任何文件。",
    allowsEmpty: false,
  },
  {
    intent: "verify",
    label: "自查验证",
    icon: "checkmark-circle",
    placeholder: "可选：有什么想让它重点检查的？",
    allowsEmpty: true,
  },
]

export const DEFAULT_FOLLOW_UP_INTENT: WorkTaskFollowUpIntent = "revise"

export function followUpScenario(intent: WorkTaskFollowUpIntent): FollowUpScenario {
  return (
    FOLLOW_UP_SCENARIOS.find((item) => item.intent === intent) || FOLLOW_UP_SCENARIOS[0]
  )
}

/**
 * 当前框里的内容能否发送。
 *
 * 附件单独就算内容：一张 bug 截图不配任何句子也是完整指令，它会作为自己的
 * prompt block 到达 agent —— 因为正文空就拒绝，会把它静默丢掉。
 */
export function canSubmitFollowUp(
  intent: WorkTaskFollowUpIntent,
  text: string,
  hasAttachments = false
): boolean {
  return (
    text.trim().length > 0 || hasAttachments || followUpScenario(intent).allowsEmpty
  )
}

/** 重试 / 重新排队备注框的占位文案。两者都停在某个用户知道、agent 不知道的理由上。 */
export function restartNotePlaceholder(kind: "retry" | "requeue"): string {
  return kind === "retry"
    ? "可选：这次要怎么做才不一样？例如：先跑 pnpm install"
    : "可选：当时为什么取消？这次要注意什么？"
}
