export interface MarkdownInsertInput {
  value: string
  snippet: string
  cursor?: number | null
  selectionStart?: number | null
  selectionEnd?: number | null
}

export interface MarkdownInsertResult {
  value: string
  cursor: number
}

export function insertMarkdownSnippet(input: MarkdownInsertInput): MarkdownInsertResult {
  const value = String(input.value || "")
  const snippet = String(input.snippet || "")
  const selectionStart = normalizeIndex(input.selectionStart, value.length)
  const selectionEnd = normalizeIndex(input.selectionEnd, value.length)

  if (selectionStart !== null && selectionEnd !== null && selectionEnd >= selectionStart) {
    return insertAtRange(value, snippet, selectionStart, selectionEnd)
  }

  const cursor = normalizeIndex(input.cursor, value.length)
  if (cursor !== null) {
    return insertAtRange(value, snippet, cursor, cursor)
  }

  return insertAtRange(value, snippet, value.length, value.length)
}

export function createMarkdownImageSnippet(url: string, alt = "图片"): string {
  const normalizedUrl = String(url || "").trim()
  const normalizedAlt = String(alt || "").trim() || "图片"
  return `![${normalizedAlt}](${normalizedUrl})`
}

function insertAtRange(value: string, snippet: string, start: number, end: number): MarkdownInsertResult {
  return {
    value: `${value.slice(0, start)}${snippet}${value.slice(end)}`,
    cursor: start + snippet.length,
  }
}

function normalizeIndex(value: unknown, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return Math.min(Math.max(0, Math.trunc(value)), max)
}
