import type { CodegGateway } from "@/services/gateway"

export interface GitStatusEntry {
  status: string
  file: string
}

export interface GitBranchList {
  local: string[]
  remote: string[]
  worktree_branches: string[]
}

export interface GitPushRemote {
  name: string
  url: string
}

export interface GitPushInfo {
  branch: string
  remotes: GitPushRemote[]
  tracking_remote: string | null
}

export type GitResetMode = "soft" | "mixed" | "hard" | "keep"

export interface GitLogFileChange {
  path: string
  status: string
  additions: number
  deletions: number
}

export interface GitLogEntry {
  hash: string
  full_hash: string
  author: string
  date: string
  message: string
  files: GitLogFileChange[]
  pushed: boolean | null
}

export interface GitLogResult {
  entries: GitLogEntry[]
  has_upstream: boolean
}

export type ProjectGitDiffMode = "workspace" | "commit"

export interface WorkspaceStatusSummary {
  modified: number
  added: number
  deleted: number
  untracked: number
}

export function isNotGitRepositoryError(error: unknown) {
  const message = extractErrorMessage(error)
  if (!message) return false
  const normalized = message.toLowerCase()
  return (
    normalized.includes("not_a_git_repository") ||
    normalized.includes("not a git repository") ||
    normalized.includes("不是 git 仓库")
  )
}

export function normalizeGitStatusEntries(input: unknown): GitStatusEntry[] {
  if (!Array.isArray(input)) return []

  return input
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null
      const raw = entry as Record<string, unknown>
      const status = typeof raw.status === "string" ? raw.status : ""
      const file = typeof raw.file === "string" ? raw.file : ""
      if (!status.trim() || !file.trim()) return null
      return { status, file }
    })
    .filter((entry): entry is GitStatusEntry => Boolean(entry))
}

export function buildWorkspaceStatusSummary(
  entries: GitStatusEntry[]
): WorkspaceStatusSummary {
  return entries.reduce<WorkspaceStatusSummary>(
    (summary, entry) => {
      const normalizedStatus = entry.status.trim().toUpperCase()
      if (normalizedStatus === "??") {
        summary.untracked += 1
        return summary
      }
      if (normalizedStatus.includes("D")) {
        summary.deleted += 1
      }
      if (normalizedStatus.includes("A")) {
        summary.added += 1
      }
      if (normalizedStatus.includes("M")) {
        summary.modified += 1
      }
      return summary
    },
    { modified: 0, added: 0, deleted: 0, untracked: 0 }
  )
}

export function isCurrentBranchHistoryView(
  currentBranch: string | null,
  selectedBranch: string | null
) {
  if (!currentBranch || !selectedBranch) return false
  return currentBranch === selectedBranch
}

export function buildProjectGitRoute(params: {
  encodedConnection: string
  folderId: number
  projectName: string
  projectPath?: string | null
}) {
  const projectName = encodeURIComponent(params.projectName)
  const projectPath = encodeURIComponent(params.projectPath || "")
  return `/pages/project-git/index?connection=${params.encodedConnection}&folderId=${params.folderId}&projectName=${projectName}&projectPath=${projectPath}`
}

export function buildProjectGitCommitRoute(params: {
  encodedConnection: string
  folderId: number
  projectName: string
  projectPath?: string | null
  commit: GitLogEntry
}) {
  const projectName = encodeURIComponent(params.projectName)
  const projectPath = encodeURIComponent(params.projectPath || "")
  const commit = encodeURIComponent(JSON.stringify(params.commit))
  return `/pages/project-git-commit/index?connection=${params.encodedConnection}&folderId=${params.folderId}&projectName=${projectName}&projectPath=${projectPath}&commit=${commit}`
}

export function buildProjectGitDiffRoute(params: {
  encodedConnection: string
  folderId: number
  projectName: string
  projectPath?: string | null
  filePath: string
  fileStatus?: string | null
  mode: ProjectGitDiffMode
  branch?: string | null
  commitHash?: string | null
  commitMessage?: string | null
}) {
  const projectName = encodeURIComponent(params.projectName)
  const projectPath = encodeURIComponent(params.projectPath || "")
  const filePath = encodeURIComponent(params.filePath)
  const fileStatus = encodeURIComponent(params.fileStatus || "")
  const branch = encodeURIComponent(params.branch || "")
  const commitHash = encodeURIComponent(params.commitHash || "")
  const commitMessage = encodeURIComponent(params.commitMessage || "")
  return `/pages/project-git-diff/index?connection=${params.encodedConnection}&folderId=${params.folderId}&projectName=${projectName}&projectPath=${projectPath}&mode=${params.mode}&filePath=${filePath}&fileStatus=${fileStatus}&branch=${branch}&commitHash=${commitHash}&commitMessage=${commitMessage}`
}

export function parseProjectGitCommitRoute(raw: unknown): GitLogEntry | null {
  if (typeof raw !== "string" || !raw.trim()) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<GitLogEntry>
    if (
      !parsed ||
      typeof parsed.full_hash !== "string" ||
      typeof parsed.hash !== "string" ||
      typeof parsed.author !== "string" ||
      typeof parsed.date !== "string" ||
      typeof parsed.message !== "string" ||
      !Array.isArray(parsed.files)
    ) {
      return null
    }
    return {
      hash: parsed.hash,
      full_hash: parsed.full_hash,
      author: parsed.author,
      date: parsed.date,
      message: parsed.message,
      pushed: typeof parsed.pushed === "boolean" ? parsed.pushed : null,
      files: parsed.files
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null
          const path = typeof entry.path === "string" ? entry.path : ""
          const status = typeof entry.status === "string" ? entry.status : ""
          const additions = typeof entry.additions === "number" ? entry.additions : 0
          const deletions = typeof entry.deletions === "number" ? entry.deletions : 0
          if (!path.trim() || !status.trim()) return null
          return { path, status, additions, deletions }
        })
        .filter((entry): entry is GitLogFileChange => Boolean(entry)),
    }
  } catch {
    return null
  }
}

export function formatGitDateTime(value: string) {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return "刚刚"
  const date = new Date(timestamp)
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  const hours = `${date.getHours()}`.padStart(2, "0")
  const minutes = `${date.getMinutes()}`.padStart(2, "0")
  return `${month}-${day} ${hours}:${minutes}`
}

export async function getRemoteGitBranch(
  gateway: CodegGateway,
  path: string
): Promise<string | null> {
  return gateway.call<string | null>("get_git_branch", { path })
}

export async function getRemoteGitStatus(
  gateway: CodegGateway,
  path: string
): Promise<GitStatusEntry[]> {
  const raw = await gateway.call<unknown>("git_status", {
    path,
    showAllUntracked: true,
  })
  return normalizeGitStatusEntries(raw)
}

export async function getRemoteWorkspaceDiff(
  gateway: CodegGateway,
  path: string,
  file?: string | null
): Promise<string> {
  return gateway.call<string>("git_diff", {
    path,
    file: file ?? null,
  })
}

export async function getRemoteCommitDiff(
  gateway: CodegGateway,
  path: string,
  commit: string,
  file?: string | null
): Promise<string> {
  return gateway.call<string>("git_show_diff", {
    path,
    commit,
    file: file ?? null,
  })
}

export async function getRemoteGitBranches(
  gateway: CodegGateway,
  path: string
): Promise<GitBranchList> {
  return gateway.call<GitBranchList>("git_list_all_branches", { path })
}

export async function getRemoteGitLog(
  gateway: CodegGateway,
  path: string,
  branch?: string | null
): Promise<GitLogResult> {
  return gateway.call<GitLogResult>("git_log", {
    path,
    limit: 50,
    branch: branch ?? null,
    remote: null,
  })
}

export async function getRemoteCommitBranches(
  gateway: CodegGateway,
  path: string,
  commit: string
): Promise<string[]> {
  return gateway.call<string[]>("git_commit_branches", { path, commit })
}

export async function checkoutRemoteBranch(
  gateway: CodegGateway,
  path: string,
  branchName: string
) {
  return gateway.call<void>("git_checkout", { path, branchName })
}

export async function createRemoteBranch(
  gateway: CodegGateway,
  path: string,
  branchName: string,
  startPoint: string
) {
  return gateway.call<void>("git_new_branch", { path, branchName, startPoint })
}

export async function resetRemoteBranch(
  gateway: CodegGateway,
  path: string,
  commit: string,
  mode: GitResetMode
) {
  return gateway.call<void>("git_reset", { path, commit, mode })
}

export async function getRemotePushInfo(
  gateway: CodegGateway,
  path: string
): Promise<GitPushInfo> {
  return gateway.call<GitPushInfo>("git_push_info", { path })
}

export async function pushRemoteBranch(
  gateway: CodegGateway,
  path: string,
  remoteName?: string | null,
  folderId?: number | null
) {
  return gateway.call("git_push", {
    path,
    folderId: folderId ?? null,
    remote: remoteName ?? null,
    credentials: null,
  })
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim()
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>
    const candidates = [record.detail, record.message, record.errMsg, record.error]
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim()
      }
    }
  }
  return ""
}
