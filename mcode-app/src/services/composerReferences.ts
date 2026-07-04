export type MentionReferenceKind = "agent" | "file" | "session" | "commit"

export interface MentionReferenceItem {
  kind: MentionReferenceKind
  id: string
  label: string
  detail: string
  uri: string
  keywords: string
}

export interface MentionReferenceGroup {
  kind: MentionReferenceKind
  label: string
  items: MentionReferenceItem[]
  truncated: boolean
}

export interface MentionTriggerState {
  query: string
  from: number
  to: number
}

export interface MentionFileSource {
  name?: string | null
  path?: string | null
  relativePath?: string | null
  relative_path?: string | null
  kind?: string | null
  type?: string | null
  isDirectory?: boolean
  is_dir?: boolean
}

export interface MentionAgentSource {
  agent_type?: string | null
  agentType?: string | null
  name?: string | null
  description?: string | null
  enabled?: boolean | null
  available?: boolean | null
}

export interface MentionSessionSource {
  id?: number | string | null
  title?: string | null
  agent_type?: string | null
  agentType?: string | null
  status?: string | null
  git_branch?: string | null
  gitBranch?: string | null
}

export interface MentionCommitSource {
  hash?: string | null
  full_hash?: string | null
  fullHash?: string | null
  message?: string | null
  author?: string | null
}

export interface BuildMentionReferenceGroupsInput {
  query?: string | null
  projectPath?: string | null
  files?: MentionFileSource[] | null
  agents?: MentionAgentSource[] | null
  sessions?: MentionSessionSource[] | null
  commits?: MentionCommitSource[] | null
  maxPerGroup?: number
}

const GROUP_LABELS: Record<MentionReferenceKind, string> = {
  agent: "智能体",
  file: "文件",
  session: "会话",
  commit: "提交",
}

const GROUP_ORDER: MentionReferenceKind[] = ["agent", "file", "session", "commit"]
const DEFAULT_MAX_PER_GROUP = 20

export function buildFileUri(absolutePath: string): string {
  const normalized = String(absolutePath || "").replace(/\\/g, "/")
  if (normalized.startsWith("//")) {
    const encoded = normalized
      .slice(2)
      .split("/")
      .map(encodeURIComponent)
      .join("/")
    return `file://${encoded}`
  }

  const encoded = normalized.split("/").map(encodeURIComponent).join("/")
  return normalized.startsWith("/") ? `file://${encoded}` : `file:///${encoded}`
}

export function resolveMentionTrigger(
  text: string,
  cursor?: number | null
): MentionTriggerState | null {
  const value = String(text || "")
  const normalizedCursor = normalizeCursor(cursor, value.length)
  const prefix = value.slice(0, normalizedCursor)
  const match = prefix.match(/(^|\s)@([^\s@]*)$/)
  if (!match || match.index == null) return null
  const query = match[2] || ""
  const atOffset = match.index + match[1].length
  return {
    query,
    from: atOffset,
    to: normalizedCursor,
  }
}

export function applyMentionReference(
  text: string,
  trigger: MentionTriggerState,
  item: MentionReferenceItem
): { text: string; cursor: number } {
  const value = String(text || "")
  const replacement = `${referenceToMarkdown(item)} `
  const next = `${value.slice(0, trigger.from)}${replacement}${value.slice(trigger.to)}`
  return {
    text: next,
    cursor: trigger.from + replacement.length,
  }
}

export function referenceToMarkdown(item: MentionReferenceItem): string {
  const label = collapseNewlines(item.label || item.id)
  if (item.kind === "agent") {
    return `[@${escapeMarkdownText(label)}](${escapeLinkDestination(item.uri)})`
  }
  return `[${escapeMarkdownText(label)}](${escapeLinkDestination(item.uri)})`
}

export function buildMentionReferenceGroups(
  input: BuildMentionReferenceGroupsInput
): MentionReferenceGroup[] {
  const query = String(input.query || "").trim().toLowerCase()
  const max = normalizeMax(input.maxPerGroup)
  const allItems: Record<MentionReferenceKind, MentionReferenceItem[]> = {
    agent: normalizeAgents(input.agents),
    file: normalizeFiles(input.files, input.projectPath),
    session: normalizeSessions(input.sessions),
    commit: normalizeCommits(input.commits, input.projectPath),
  }

  return GROUP_ORDER.map((kind) => {
    const matches = allItems[kind].filter((item) => mentionMatches(item, query))
    return {
      kind,
      label: GROUP_LABELS[kind],
      items: matches.slice(0, max),
      truncated: matches.length > max,
    }
  })
}

function normalizeFiles(
  files?: MentionFileSource[] | null,
  projectPath?: string | null
): MentionReferenceItem[] {
  const root = String(projectPath || "").trim()
  if (!root) return []
  return normalizeArray(files)
    .map<MentionReferenceItem | null>((file) => {
      const path = firstString(file.path, file.relativePath, file.relative_path)
      const name = firstString(file.name) || basename(path)
      if (!path || !name) return null
      const absolute = joinProjectPath(root, path)
      const kind = isDirectoryFile(file) ? "directory" : "file"
      return {
        kind: "file" as const,
        id: path,
        label: name,
        detail: path,
        uri: buildFileUri(absolute),
        keywords: `${path} ${name} ${kind}`,
      }
    })
    .filter((item): item is MentionReferenceItem => Boolean(item))
}

function normalizeAgents(agents?: MentionAgentSource[] | null): MentionReferenceItem[] {
  return normalizeArray(agents)
    .filter((agent) => agent.enabled !== false)
    .map<MentionReferenceItem | null>((agent) => {
      const id = firstString(agent.agent_type, agent.agentType)
      if (!id) return null
      const label = firstString(agent.name) || id
      return {
        kind: "agent" as const,
        id,
        label,
        detail: firstString(agent.description) || id,
        uri: `codeg://agent/${encodeURIComponent(id)}`,
        keywords: `${id} ${label} ${firstString(agent.description) || ""}`,
      }
    })
    .filter((item): item is MentionReferenceItem => Boolean(item))
}

function normalizeSessions(sessions?: MentionSessionSource[] | null): MentionReferenceItem[] {
  return normalizeArray(sessions)
    .map<MentionReferenceItem | null>((session) => {
      const id = firstString(session.id)
      if (!id) return null
      const label = firstString(session.title) || `#${id}`
      const agentType = firstString(session.agent_type, session.agentType)
      const branch = firstString(session.git_branch, session.gitBranch)
      const status = firstString(session.status)
      return {
        kind: "session" as const,
        id,
        label,
        detail: firstString(branch, status, agentType) || "",
        uri: `codeg://session/${encodeURIComponent(id)}`,
        keywords: `${label} ${agentType} ${branch} ${status}`,
      }
    })
    .filter((item): item is MentionReferenceItem => Boolean(item))
}

function normalizeCommits(
  commits?: MentionCommitSource[] | null,
  projectPath?: string | null
): MentionReferenceItem[] {
  const repoKey = String(projectPath || "").trim()
  if (!repoKey) return []
  return normalizeArray(commits)
    .map<MentionReferenceItem | null>((commit) => {
      const fullHash = firstString(commit.full_hash, commit.fullHash, commit.hash)
      if (!fullHash) return null
      const shortHash = firstString(commit.hash) || fullHash.slice(0, 7)
      const message = firstString(commit.message)
      const author = firstString(commit.author)
      return {
        kind: "commit" as const,
        id: fullHash,
        label: shortHash,
        detail: message || author || fullHash,
        uri: `codeg://commit/${encodeURIComponent(repoKey)}@${fullHash}`,
        keywords: `${shortHash} ${fullHash} ${message} ${author}`,
      }
    })
    .filter((item): item is MentionReferenceItem => Boolean(item))
}

function mentionMatches(item: MentionReferenceItem, query: string): boolean {
  if (!query) return true
  const haystack = `${item.label} ${item.id} ${item.detail} ${item.keywords}`.toLowerCase()
  return haystack.includes(query)
}

function escapeMarkdownText(text: string): string {
  return text.replace(/[\\`*_~[\]()<>]/g, "\\$&")
}

function escapeLinkDestination(uri: string): string {
  const cleaned = String(uri || "").replace(/[\r\n]+/g, "")
  return /[\s()<>\\]/.test(cleaned)
    ? `<${cleaned.replace(/[\\<>]/g, "\\$&")}>`
    : cleaned
}

function collapseNewlines(text: string): string {
  return String(text || "").replace(/\s*[\r\n]+\s*/g, " ")
}

function normalizeCursor(cursor: number | null | undefined, length: number) {
  if (typeof cursor !== "number" || !Number.isFinite(cursor)) return length
  return Math.max(0, Math.min(length, Math.trunc(cursor)))
}

function normalizeMax(value: number | null | undefined) {
  const numeric = Number(value || DEFAULT_MAX_PER_GROUP)
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_MAX_PER_GROUP
  return Math.min(100, Math.trunc(numeric))
}

function normalizeArray<T>(value?: T[] | null): T[] {
  return Array.isArray(value) ? value : []
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
  }
  return ""
}

function basename(path: string) {
  return String(path || "").split(/[\\/]/).filter(Boolean).pop() || ""
}

function joinProjectPath(rootPath: string, relativePath: string) {
  const root = String(rootPath || "").trim().replace(/[\\/]+$/, "")
  const relative = String(relativePath || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
  return relative ? `${root}/${relative}` : root
}

function isDirectoryFile(file: MentionFileSource) {
  const kind = firstString(file.kind, file.type).toLowerCase()
  return kind === "dir" || kind === "directory" || file.isDirectory === true || file.is_dir === true
}
