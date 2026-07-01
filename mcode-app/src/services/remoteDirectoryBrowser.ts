import type { CodegGateway } from "@/services/gateway"

export interface RemoteDirectoryEntry {
  name: string
  path: string
  isDirectory: boolean
  hasChildren: boolean
}

export interface RemoteProjectFolder {
  id: number
  name: string
  path: string
}

export function normalizeDirectoryEntries(input: unknown): RemoteDirectoryEntry[] {
  const list = normalizeList(input)
  const entries: RemoteDirectoryEntry[] = []
  list.forEach((item) => {
    const raw = item && typeof item === "object" ? (item as Record<string, unknown>) : null
    if (!raw) return
    const name = pickString(raw.name)
    const path = pickString(raw.path)
    const isDirectory = Boolean(raw.isDirectory ?? raw.is_dir)
    if (!name || !path || !isDirectory) return
    entries.push({
      name,
      path,
      isDirectory,
      hasChildren: Boolean(raw.hasChildren ?? raw.has_children),
    })
  })
  return entries
}

export function normalizeRemoteProjectFolder(input: unknown): RemoteProjectFolder | null {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : null
  if (!raw) return null
  const id = Number(raw.id || 0)
  const path = pickString(raw.path)
  if (!Number.isFinite(id) || id <= 0 || !path) return null
  return {
    id,
    name: pickString(raw.name) || path,
    path,
  }
}

export function parentDirectoryPath(input: string): string {
  const path = String(input || "").trim().replace(/[\\/]+$/, "")
  if (!path) return ""

  const windowsRoot = path.match(/^[A-Za-z]:$/)
  if (windowsRoot) return ""
  const windowsDrive = path.match(/^([A-Za-z]:)([\\/].*)?$/)
  if (windowsDrive) {
    const drive = windowsDrive[1]
    const rest = path.slice(drive.length).replace(/^[/\\]+/, "")
    if (!rest) return ""
    const parts = rest.split(/[\\/]+/).filter(Boolean)
    if (parts.length <= 1) return `${drive}\\`
    return `${drive}\\${parts.slice(0, -1).join("\\")}`
  }

  if (path === "/") return ""
  const parts = path.split("/").filter(Boolean)
  if (parts.length <= 1) return path.startsWith("/") ? "/" : ""
  return `${path.startsWith("/") ? "/" : ""}${parts.slice(0, -1).join("/")}`
}

export async function getHomeDirectory(gateway: CodegGateway): Promise<string> {
  const raw = await gateway.call<unknown>("get_home_directory")
  return pickString(raw)
}

export async function listDirectoryEntries(
  gateway: CodegGateway,
  path: string
): Promise<RemoteDirectoryEntry[]> {
  const raw = await gateway.call<unknown>("list_directory_entries", { path })
  return normalizeDirectoryEntries(raw)
}

export async function openRemoteFolder(
  gateway: CodegGateway,
  path: string
): Promise<RemoteProjectFolder> {
  const raw = await gateway.call<unknown>("open_folder", { path })
  const folder = normalizeRemoteProjectFolder(raw)
  if (!folder) {
    throw new Error("添加项目失败：返回数据异常")
  }
  return folder
}

function normalizeList(input: unknown): unknown[] {
  if (Array.isArray(input)) return input
  if (input && typeof input === "object" && Array.isArray((input as any).data)) {
    return (input as any).data
  }
  return []
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}
