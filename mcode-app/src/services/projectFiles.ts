import type { CodegGateway } from "@/services/gateway"

export type ProjectFileKind = "file" | "directory"

export interface ProjectFileNode {
  id: string
  name: string
  path: string
  kind: ProjectFileKind
  depth: number
  children: ProjectFileNode[]
}

export interface ProjectFilePreview {
  content: string
  language: string | null
  truncated: boolean
}

export function normalizeProjectFileTree(
  input: unknown,
  depth = 0,
  pathPrefix = ""
): ProjectFileNode[] {
  const list = Array.isArray(input) ? input : []
  const prefix = normalizeRelativePath(pathPrefix)
  return list
    .map((item) => normalizeProjectFileNode(item, depth, prefix))
    .filter((item): item is ProjectFileNode => Boolean(item))
}

function normalizeProjectFileNode(
  input: unknown,
  depth: number,
  pathPrefix: string
): ProjectFileNode | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  const name = pickString(raw.name)
  const rawPath = pickString(raw.path, raw.relativePath, raw.relative_path, name)
  const path = prefixRelativePath(pathPrefix, rawPath)
  if (!name || !path) return null
  const rawKind = pickString(raw.kind, raw.type).toLowerCase()
  const isDirectory =
    rawKind === "directory" ||
    rawKind === "dir" ||
    raw.isDirectory === true ||
    raw.is_dir === true
  return {
    id: path,
    name,
    path,
    kind: isDirectory ? "directory" : "file",
    depth,
    children: normalizeProjectFileTree(raw.children, depth + 1, pathPrefix),
  }
}

export async function getRemoteProjectFileTree(
  gateway: CodegGateway,
  rootPath: string,
  maxDepth = 4
): Promise<ProjectFileNode[]> {
  const raw = await gateway.call<unknown>("get_file_tree", {
    path: rootPath,
    maxDepth,
  })
  return normalizeProjectFileTree(raw)
}

export async function getRemoteProjectFileChildren(
  gateway: CodegGateway,
  rootPath: string,
  path: string,
  depth = 0
): Promise<ProjectFileNode[]> {
  const relativePath = normalizeRelativePath(path)
  const raw = await gateway.call<unknown>("get_file_tree", {
    path: joinRemoteProjectPath(rootPath, relativePath),
    maxDepth: 1,
  })
  return normalizeProjectFileTree(raw, depth, relativePath)
}

export async function readRemoteProjectFilePreview(
  gateway: CodegGateway,
  rootPath: string,
  path: string
): Promise<ProjectFilePreview> {
  const raw = await gateway.call<unknown>("read_file_preview", { rootPath, path })
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    content: pickString(record.content, record.text),
    language: pickString(record.language, record.lang) || null,
    truncated: Boolean(record.truncated),
  }
}

export async function createRemoteProjectFileEntry(
  gateway: CodegGateway,
  rootPath: string,
  path: string,
  name: string,
  kind: ProjectFileKind
): Promise<string> {
  return gateway.call<string>("create_file_tree_entry", {
    rootPath,
    path,
    name,
    kind: kind === "directory" ? "dir" : "file",
  })
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

function normalizeRelativePath(path: string) {
  return String(path || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
}

function prefixRelativePath(prefix: string, path: string) {
  const normalizedPath = normalizeRelativePath(path)
  if (!prefix) return normalizedPath
  if (!normalizedPath) return prefix
  if (normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)) {
    return normalizedPath
  }
  return `${prefix}/${normalizedPath}`
}

function joinRemoteProjectPath(rootPath: string, relativePath: string) {
  const root = String(rootPath || "").trim().replace(/[\\/]+$/, "")
  const relative = normalizeRelativePath(relativePath)
  return relative ? `${root}/${relative}` : root
}
