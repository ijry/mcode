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

export interface MentionTabItem {
  /** `up-tabs` 的 `keyName="title"` 读这个字段。带计数。 */
  title: string
  kind: MentionReferenceKind
  count: number
  /** 空组置灰不可点（`up-action-sheet`/`up-tabs` 的 disabled 项不触发 change）。 */
  disabled: boolean
}

/**
 * 把四个引用分组变成 `up-tabs` 的 list。
 *
 * **四组恒显、位置固定**（用户选的形制）。这顺带消掉了一个坑：`buildMentionReferenceGroups`
 * 每次按 query 重新过滤，如果只显示非空组，tab 集合会**随每一次按键变短** —— 下标停在
 * 第 3 个 tab、新结果只剩 2 组时内容区就是空白。固定四组之后下标不会漂移。
 *
 * 标签带计数：分栏之后用户看不到其他组里有没有东西，计数是唯一线索。`truncated` 时加
 * `+`（如 `文件 20+`）—— 不标出来的话 20 看起来就是全部，而它其实是 `maxPerGroup` 截断后
 * 的数字。
 */
export function buildMentionTabItems(
  groups: MentionReferenceGroup[]
): MentionTabItem[] {
  return groups.map((group) => {
    const count = group.items.length
    const countText = count > 0 ? ` ${count}${group.truncated ? "+" : ""}` : ""
    return {
      title: `${group.label}${countText}`,
      kind: group.kind,
      count,
      disabled: count === 0,
    }
  })
}

/**
 * 当前该激活哪一组。
 *
 * **用 kind 而不是下标记录「当前是哪个 tab」**：下标是 `up-tabs` 的输入，但身份是 kind。
 * 混用会在组集合变化时错位（问题分栏那次踩过同样的坑，见
 * `detailInteractionPresentation.ts` 的 `askQuestionTabIndex` 注释）。
 *
 * `pinned` 区分两种**从状态本身无法区分**的处境 —— 两者的输入长得一模一样
 * （当前 kind 那组是空的），但正确答案相反：
 *
 * - `pinned: false`（面板刚打开、用户还没点过 tab）：当前 kind 只是个默认值，用户对
 *   「我正在看哪一组」没有预期。落回**第一个非空组**，让他直接看到有内容的那组。
 * - `pinned: true`（用户点过 tab，那是他的选择）：**留在原地，绝不自动跳组。** 他正在看
 *   「文件」组、继续敲字让它变空时，把他弹到「智能体」组会让他以为自己点错了。留在原地
 *   显示空态，他自己决定是改关键词还是切组。
 *
 * 只有当前 kind 压根不在这批分组里（组件状态被写坏 / 旧版本遗留值）时，`pinned` 也救不了
 * 它 —— 那时一律走非空回退。
 *
 * 全空时回到第一组，让 tab 条与内容区状态自洽（都是空）。
 */
export function resolveActiveMentionKind(
  groups: MentionReferenceGroup[],
  currentKind: MentionReferenceKind | null | undefined,
  options: { pinned?: boolean } = {}
): MentionReferenceKind {
  const fallback = groups[0]?.kind ?? "agent"
  const current = groups.find((group) => group.kind === currentKind)
  // 用户亲手选过这一组：留在原地，空了也留着。
  if (current && options.pinned) return current.kind
  // 未 pin：当前组有内容就用它，否则挑第一个有内容的组。
  if (current && current.items.length > 0) return current.kind
  const firstWithItems = groups.find((group) => group.items.length > 0)
  return firstWithItems?.kind ?? fallback
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
