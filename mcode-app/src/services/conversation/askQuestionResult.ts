export interface AskQuestionOption {
  label: string
  description: string
}

export interface AskQuestion {
  question: string
  header: string
  multiSelect: boolean
  options: AskQuestionOption[]
}

export interface AskQuestionAnswer {
  header: string
  question: string
  selected: string[]
}

export interface AskQuestionOutcome {
  declined: boolean
  answers: AskQuestionAnswer[]
}

const NO_SELECTION = "(no selection)"
const HEADER_LINE_RE = /^\s*\d+\.\s*\[([^\]]*)\]\s*(.*)$/
const SELECTED_LINE_RE = /^\s*→\s*(.*)$/

export function isAskQuestionToolName(name?: string | null): boolean {
  const normalized = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")

  return (
    normalized === "question" ||
    normalized === "ask_user_question" ||
    normalized.endsWith("_ask_user_question") ||
    normalized.includes("codeg_mcp_ask_user_question")
  )
}

export function splitRecommended(label: string): {
  text: string
  recommended: boolean
} {
  const match = label.match(/^(.*?)\s*\(recommended\)\s*$/i)
  const text = match?.[1].trim()
  return text ? { text, recommended: true } : { text: label, recommended: false }
}

export function parseAskQuestionInput(input: unknown): AskQuestion[] {
  const parsed = parseMaybeJson(input)
  const root = asRecord(parsed)
  if (!root || !Array.isArray(root.questions)) return []

  const questions: AskQuestion[] = []
  for (const item of root.questions) {
    const record = asRecord(item)
    if (!record) continue

    const question = asString(record.question)
    const options = parseOptions(record.options)
    if (!question && options.length === 0) continue

    questions.push({
      question,
      header: asString(record.header),
      multiSelect: record.multiSelect === true || record.multi_select === true,
      options,
    })
  }

  return questions
}

export function parseAskQuestionOutcome(output: unknown): AskQuestionOutcome | null {
  const outputText = typeof output === "string" ? output : ""
  const parsed = parseMaybeJson(output)
  const fromJson = parseOutcomeJson(parsed)
  if (fromJson) return fromJson

  if (!outputText.trim()) return null

  if (/\bdismissed the question/i.test(outputText)) {
    return { declined: true, answers: [] }
  }

  const answers: AskQuestionAnswer[] = []
  let current: AskQuestionAnswer | null = null

  for (const line of outputText.split(/\r?\n/)) {
    const header = line.match(HEADER_LINE_RE)
    if (header) {
      current = {
        header: header[1].trim(),
        question: header[2].trim(),
        selected: [],
      }
      answers.push(current)
      continue
    }

    const selectedLine = line.match(SELECTED_LINE_RE)
    if (selectedLine && current) {
      const joined = selectedLine[1].trim()
      current.selected = joined && joined !== NO_SELECTION ? joined.split(", ") : []
      current = null
    }
  }

  return answers.length > 0 ? { declined: false, answers } : null
}

export function matchSelections(
  values: string[],
  optionLabels: string[]
): { selected: string[]; other: string[] } {
  const labels = new Set(optionLabels.filter(Boolean))
  const selected: string[] = []
  const other: string[] = []

  for (const raw of values) {
    const value = raw.trim()
    if (!value || value === NO_SELECTION) continue
    if (labels.has(value)) selected.push(value)
    else other.push(value)
  }

  return { selected, other }
}

export function isAskQuestionToolCall(input: {
  name?: string | null
  input?: unknown
  output?: unknown
}): boolean {
  return (
    isAskQuestionToolName(input.name) ||
    parseAskQuestionInput(input.input).length > 0 ||
    parseAskQuestionOutcome(input.output) != null
  )
}

function parseOptions(raw: unknown): AskQuestionOption[] {
  if (!Array.isArray(raw)) return []

  const options: AskQuestionOption[] = []
  for (const item of raw) {
    const record = asRecord(item)
    if (!record) continue

    const label = asString(record.label)
    if (!label) continue

    options.push({
      label,
      description: asString(record.description),
    })
  }

  return options
}

function parseOutcomeJson(parsed: unknown): AskQuestionOutcome | null {
  const top = asRecord(parsed)
  if (!top) return null

  const envelope =
    Array.isArray(top.answers) || typeof top.declined === "boolean"
      ? top
      : asRecord(top.structuredContent)

  if (!envelope) return null
  if (!Array.isArray(envelope.answers) && typeof envelope.declined !== "boolean") return null
  if (envelope.declined === true) return { declined: true, answers: [] }

  return {
    declined: false,
    answers: parseAnswers(envelope.answers),
  }
}

function parseAnswers(raw: unknown): AskQuestionAnswer[] {
  if (!Array.isArray(raw)) return []

  const answers: AskQuestionAnswer[] = []
  for (const item of raw) {
    const record = asRecord(item)
    if (!record) continue

    answers.push({
      header: asString(record.header),
      question: asString(record.question),
      selected: Array.isArray(record.selected)
        ? record.selected.filter((value): value is string => typeof value === "string")
        : [],
    })
  }

  return answers
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value

  const text = value.trim()
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return value
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}
