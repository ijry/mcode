export type TodoTab = "local" | "cloud"

export interface TodoProjectBinding {
  connectionId: string
  projectId: number
  projectName?: string | null
}

export interface TodoItem {
  id: string
  text: string
  completed: boolean
  createdAt: number
  completedAt: number | null
  hidden: boolean
  hiddenAt: number | null
  connectionId?: string | null
  projectId?: number | null
  projectName?: string | null
}

function toTimestamp(value: unknown, fallback: number | null = null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

export function createTodoItem(
  text: string,
  now = Date.now(),
  binding?: TodoProjectBinding | null
): TodoItem {
  const item: TodoItem = {
    id: String(now),
    text: text.trim(),
    completed: false,
    createdAt: now,
    completedAt: null,
    hidden: false,
    hiddenAt: null,
  }
  if (!binding) return item
  return {
    ...item,
    connectionId: binding.connectionId,
    projectId: binding.projectId,
    projectName: binding.projectName || null,
  }
}

export function createProjectTodoItem(
  text: string,
  binding: TodoProjectBinding,
  now = Date.now()
): TodoItem {
  return createTodoItem(text, now, binding)
}

export function normalizeStoredTodos(raw: unknown, now = Date.now()): TodoItem[] {
  if (!Array.isArray(raw)) return []

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null
      const row = entry as Record<string, unknown>
      const text = String(row.text || "").trim()
      if (!text) return null

      const projectId = toTimestamp(row.projectId)
      const connectionId = typeof row.connectionId === "string" ? row.connectionId.trim() : ""
      const projectName = typeof row.projectName === "string" ? row.projectName.trim() : ""
      const normalized: TodoItem = {
        id: String(row.id ?? now),
        text,
        completed: Boolean(row.completed),
        createdAt: toTimestamp(row.createdAt, now) ?? now,
        completedAt: toTimestamp(row.completedAt),
        hidden: Boolean(row.hidden),
        hiddenAt: toTimestamp(row.hiddenAt),
      }
      if (connectionId && projectId && projectId > 0) {
        normalized.connectionId = connectionId
        normalized.projectId = projectId
        normalized.projectName = projectName || null
      }
      return normalized
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

export function isTodoBoundToProject(item: TodoItem, binding: TodoProjectBinding) {
  return (
    String(item.connectionId || "") === binding.connectionId &&
    Number(item.projectId || 0) === binding.projectId
  )
}

export function getProjectTodoSections(
  items: TodoItem[],
  binding: TodoProjectBinding,
  keyword: string
) {
  return getVisibleTodoSections(
    items.filter((item) => isTodoBoundToProject(item, binding)),
    keyword
  )
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
