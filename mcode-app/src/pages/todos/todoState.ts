export type TodoTab = "local" | "cloud"

export interface TodoItem {
  id: string
  text: string
  completed: boolean
  createdAt: number
  completedAt: number | null
  hidden: boolean
  hiddenAt: number | null
}

function toTimestamp(value: unknown, fallback: number | null = null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

export function createTodoItem(text: string, now = Date.now()): TodoItem {
  return {
    id: String(now),
    text: text.trim(),
    completed: false,
    createdAt: now,
    completedAt: null,
    hidden: false,
    hiddenAt: null,
  }
}

export function normalizeStoredTodos(raw: unknown, now = Date.now()): TodoItem[] {
  if (!Array.isArray(raw)) return []

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null
      const row = entry as Record<string, unknown>
      const text = String(row.text || "").trim()
      if (!text) return null

      return {
        id: String(row.id ?? now),
        text,
        completed: Boolean(row.completed),
        createdAt: toTimestamp(row.createdAt, now) ?? now,
        completedAt: toTimestamp(row.completedAt),
        hidden: Boolean(row.hidden),
        hiddenAt: toTimestamp(row.hiddenAt),
      } satisfies TodoItem
    })
    .filter((item): item is TodoItem => Boolean(item))
}

export function getVisibleTodoSections(items: TodoItem[], keyword: string) {
  const needle = keyword.trim().toLowerCase()
  const visible = items.filter((item) => {
    if (item.hidden) return false
    if (!needle) return true
    return item.text.toLowerCase().includes(needle)
  })

  return {
    inProgress: visible.filter((item) => !item.completed),
    completed: visible.filter((item) => item.completed),
  }
}

export function toggleTodoCompletion(items: TodoItem[], id: string, now = Date.now()): TodoItem[] {
  return items.map((item) => {
    if (item.id !== id) return item
    if (!item.completed) {
      return { ...item, completed: true, completedAt: now, hidden: false, hiddenAt: null }
    }
    return { ...item, completed: false, completedAt: null, hidden: false, hiddenAt: null }
  })
}

export function applyTodoEdit(items: TodoItem[], id: string, nextText: string): TodoItem[] {
  const text = nextText.trim()
  if (!text) return items.filter((item) => item.id !== id)
  return items.map((item) => (item.id === id ? { ...item, text } : item))
}

export function hideCompletedTodos(
  items: TodoItem[],
  idsToHide: string[],
  now = Date.now()
): TodoItem[] {
  const idSet = new Set(idsToHide)
  return items.map((item) => {
    if (!item.completed || item.hidden || !idSet.has(item.id)) return item
    return { ...item, hidden: true, hiddenAt: now }
  })
}
