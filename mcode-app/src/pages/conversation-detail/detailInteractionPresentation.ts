import type { PendingQuestionState, QuestionAnswer } from "@/types/acp"
import { firstString } from "./detailDataNormalization"

export interface QuestionSelectionState {
  selected: string[]
  otherActive: boolean
  otherText: string
}

export function createQuestionSelectionState(
  pending: PendingQuestionState | null | undefined
): Record<string, QuestionSelectionState> {
  const next: Record<string, QuestionSelectionState> = {}
  for (const question of pending?.questions || []) {
    next[question.id] = {
      selected: [],
      otherActive: false,
      otherText: "",
    }
  }
  return next
}

export function isQuestionSelectionAnswered(selection: QuestionSelectionState): boolean {
  return (
    selection.selected.length > 0 ||
    (selection.otherActive && Boolean(selection.otherText.trim()))
  )
}

export interface QuestionTabItem {
  /** `up-tabs` 按 `keyName="title"` 取这个字段当标签文案。 */
  title: string
  /** 问题 id —— tab 的真实身份。`up-tabs` 是下标驱动的，留一条 id 回查的路。 */
  questionId: string
  answered: boolean
}

/**
 * 多问题时的 tab 列表，对齐 codeg-plus 桌面端 `ask-question-card.tsx` 的分栏形制。
 *
 * **标签用 `header` 而不是 `question`**：服务端强制 `header` ≤12 字符
 * （`acp/question.rs` 的 `MAX_HEADER_CHARS`），它就是为「短分类标签」准备的；
 * `question` 是完整问句，塞进 tab 只会被截断成每个都长得一样。
 *
 * `header` 缺失时退回「问题 N」，**绝不退回 `question`** —— 同上。
 *
 * 已答的在标签前缀一个对勾。桌面端用图标 + 序号圆圈，而 `up-tabs` 的标签是纯文本，
 * 前缀字符是移动端能拿到的最接近表达。
 */
export function buildQuestionTabItems(
  pending: PendingQuestionState | null | undefined,
  selections: Record<string, QuestionSelectionState>
): QuestionTabItem[] {
  return (pending?.questions || []).map((question, index) => {
    const header = firstString(question.header)
    const selection = selections[question.id]
    const answered = selection ? isQuestionSelectionAnswered(selection) : false
    return {
      title: `${answered ? "✓ " : ""}${header || `问题 ${index + 1}`}`,
      questionId: question.id,
      answered,
    }
  })
}

/**
 * 单选作答后该自动跳到哪个 tab（返回下标；不该跳时返回 `null`）。
 *
 * 这条是让多个 tab 读起来像**向导**而不是作业的关键，照搬桌面端
 * `ask-question-card.tsx` 的 `select()`。三种不跳的情形：
 *
 * - **多选不跳** —— 用户可能还要继续勾选；
 * - **切「其他」不跳** —— 他还要打字，跳走就打不成了；
 * - **已经是最后一题不跳**。
 */
export function resolveNextQuestionTabIndex(input: {
  questionCount: number
  currentIndex: number
  multiSelect: boolean
  isOtherToggle: boolean
}): number | null {
  if (input.multiSelect || input.isOtherToggle) return null
  const nextIndex = input.currentIndex + 1
  if (nextIndex <= 0 || nextIndex >= input.questionCount) return null
  return nextIndex
}

export function buildQuestionAnswer(
  pending: PendingQuestionState | null | undefined,
  selections: Record<string, QuestionSelectionState>,
  declined: boolean
): QuestionAnswer {
  if (declined) {
    return { answers: [], declined: true }
  }
  return {
    declined: false,
    answers: (pending?.questions || []).map((question) => {
      const selection = selections[question.id] || {
        selected: [],
        otherActive: false,
        otherText: "",
      }
      const labels = [...selection.selected]
      const otherText = selection.otherText.trim()
      if (selection.otherActive && otherText) {
        labels.push(otherText)
      }
      return {
        questionId: question.id,
        labels,
      }
    }),
  }
}

export function questionLabelText(label: string) {
  return String(label || "").replace(/\s*\(recommended\)\s*$/i, "").trim() || label
}

export function isQuestionRecommended(label: string) {
  return /\s*\(recommended\)\s*$/i.test(String(label || "")) && Boolean(questionLabelText(label))
}

export function splitPermissionDescription(description: string): {
  textParts: string[]
  commandBlock: string
} {
  const text = String(description || "").trim()
  if (!text) {
    return {
      textParts: ["智能体请求继续当前操作"],
      commandBlock: "",
    }
  }

  const normalized = text.replace(/\r\n/g, "\n")
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  const commandLines: string[] = []
  const textParts: string[] = []
  let collectingCommand = false

  lines.forEach((line) => {
    if (looksLikePermissionCommandLine(line)) {
      collectingCommand = true
      commandLines.push(stripPermissionCommandPrefix(line))
      return
    }

    if (collectingCommand && looksLikeCommandContinuation(line)) {
      commandLines.push(line)
      return
    }

    collectingCommand = false
    textParts.push(line)
  })

  if (commandLines.length === 0) {
    return {
      textParts: [normalized],
      commandBlock: "",
    }
  }

  return {
    textParts,
    commandBlock: commandLines.join("\n"),
  }
}

function looksLikePermissionCommandLine(line: string): boolean {
  if (!line) return false
  if (/^(command|cmd|命令|执行命令)\s*[:：]/i.test(line)) return true
  if (line.length >= 72 && /[\\/]/.test(line)) return true
  if (line.length >= 96 && /--?[a-z0-9]/i.test(line)) return true
  return false
}

function looksLikeCommandContinuation(line: string): boolean {
  if (!line) return false
  if (/^(>|\$|#)/.test(line)) return true
  if (/^(--?[a-z0-9]|\/|\.\.?[\\/])/.test(line)) return true
  if (line.length >= 48 && /[=\\/]/.test(line)) return true
  return false
}

function stripPermissionCommandPrefix(line: string): string {
  return line.replace(/^(command|cmd|命令|执行命令)\s*[:：]\s*/i, "")
}

export function questionInputValue(event: unknown) {
  return typeof event === "string"
    ? event
    : firstString((event as any)?.detail?.value, (event as any)?.target?.value) || ""
}
