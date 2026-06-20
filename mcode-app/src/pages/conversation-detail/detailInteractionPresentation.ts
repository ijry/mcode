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
