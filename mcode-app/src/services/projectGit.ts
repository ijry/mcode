import type { CodegGateway } from "@/services/gateway"
import parseDiffModule from "parse-diff"
import type { Change as ParseDiffChange } from "parse-diff"

const parseDiff = parseDiffModule as unknown as typeof import("parse-diff")

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

export type GitFileTone = "success" | "error" | "warning" | "info"

export interface GitFileStatusPresentation {
  icon: string
  label: string
  tone: GitFileTone
}

export interface GitDiffViewCell {
  oldLineNumber: number | null
  newLineNumber: number | null
  content: string
  type: "context" | "add" | "del"
}

export interface GitDiffViewRow {
  id: string
  line: GitDiffViewCell
}

export interface GitDiffViewHunk {
  id: string
  header: string
  rows: GitDiffViewRow[]
}

export interface GitDiffViewFile {
  id: string
  from: string
  to: string
  additions: number
  deletions: number
  hunks: GitDiffViewHunk[]
}

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
  connectionId: string
  folderId: number
  projectName: string
  projectPath?: string | null
}) {
  const projectName = encodeURIComponent(params.projectName)
  const projectPath = encodeURIComponent(params.projectPath || "")
  return `/pages/project-git/index?connectionId=${encodeURIComponent(params.connectionId)}&folderId=${params.folderId}&projectName=${projectName}&projectPath=${projectPath}`
}

export function buildProjectGitCommitRoute(params: {
  connectionId: string
  folderId: number
  projectName: string
  projectPath?: string | null
  commit: GitLogEntry
}) {
  const projectName = encodeURIComponent(params.projectName)
  const projectPath = encodeURIComponent(params.projectPath || "")
  const commit = encodeURIComponent(JSON.stringify(params.commit))
  return `/pages/project-git-commit/index?connectionId=${encodeURIComponent(params.connectionId)}&folderId=${params.folderId}&projectName=${projectName}&projectPath=${projectPath}&commit=${commit}`
}

export function buildProjectGitDiffRoute(params: {
  connectionId: string
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
  return `/pages/project-git-diff/index?connectionId=${encodeURIComponent(params.connectionId)}&folderId=${params.folderId}&projectName=${projectName}&projectPath=${projectPath}&mode=${params.mode}&filePath=${filePath}&fileStatus=${fileStatus}&branch=${branch}&commitHash=${commitHash}&commitMessage=${commitMessage}`
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

export function getGitFileStatusPresentation(status: string): GitFileStatusPresentation {
  const normalized = status.trim().toUpperCase()
  if (normalized === "??") {
    return { icon: "plus-circle", label: "未跟踪", tone: "info" }
  }
  if (normalized.includes("D")) {
    return { icon: "minus-circle", label: "删除", tone: "error" }
  }
  if (normalized.includes("A")) {
    return { icon: "plus-circle", label: "新增", tone: "success" }
  }
  if (normalized.includes("M")) {
    return { icon: "edit-pen", label: "修改", tone: "warning" }
  }
  return { icon: "file-text", label: "变更", tone: "info" }
}

export function getGitFileToneColor(tone: GitFileTone) {
  if (tone === "success") return "var(--up-success, #19be6b)"
  if (tone === "error") return "var(--up-error, #fa3534)"
  if (tone === "warning") return "var(--up-warning, #f9ae3d)"
  return "var(--up-primary, #2979ff)"
}

export function buildGitDiffView(diffText: string): GitDiffViewFile[] {
  const files = parseDiff(diffText || "")
  return files.map((file, fileIndex) => {
    const from = file.from || "a/unknown"
    const to = file.to || "b/unknown"
    return {
      id: `file-${fileIndex}-${from}-${to}`,
      from,
      to,
      additions: file.additions || 0,
      deletions: file.deletions || 0,
      hunks: file.chunks.map((chunk, chunkIndex) => ({
        id: `hunk-${fileIndex}-${chunkIndex}`,
        header: chunk.content,
        rows: buildGitDiffRows(chunk.changes, fileIndex, chunkIndex),
      })),
    }
  })
}

function buildGitDiffRows(
  changes: ParseDiffChange[],
  fileIndex: number,
  chunkIndex: number
): GitDiffViewRow[] {
  const rows: GitDiffViewRow[] = []

  for (let index = 0; index < changes.length; index += 1) {
    const change = changes[index]
    if (change.type === "normal") {
      rows.push({
        id: `row-${fileIndex}-${chunkIndex}-${index}`,
        line: {
          oldLineNumber: change.ln1,
          newLineNumber: change.ln2,
          content: change.content.slice(1),
          type: "context",
        },
      })
      continue
    }

    if (change.type === "del") {
      rows.push({
        id: `row-${fileIndex}-${chunkIndex}-${index}`,
        line: {
          oldLineNumber: change.ln,
          newLineNumber: null,
          content: change.content.slice(1),
          type: "del",
        },
      })
      continue
    }

    rows.push({
      id: `row-${fileIndex}-${chunkIndex}-${index}`,
      line: {
        oldLineNumber: null,
        newLineNumber: change.ln,
        content: change.content.slice(1),
        type: "add",
      },
    })
  }

  return rows
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

/**
 * 提交工作区变更。
 *
 * 服务端 `git_commit`（`codeg-plus/src-tauri/src/commands/folders.rs:2694`）做两步：
 * 先 `git add -- <files>`（**跳过已暂存的删除**，那些文件在工作区和索引里都不存在了，
 * `git add` 会失败），再 `git commit -m <message>`。
 *
 * 两个必须知道的语义：
 *
 * 1. **提交的是整个索引，不是只有 `files`。** 第二步没有 pathspec，所以在别处（PC 上、
 *    或智能体自己）暂存过的文件会一并进这个提交。UI 必须让用户明白他勾的是「额外要暂存的」，
 *    而不是「只提交这些」。
 * 2. **作者可能被覆盖**：服务端会按 git 账号配置解析 `user.name`/`user.email`
 *    （`resolve_commit_author`），手机端无从干预，也不该干预。
 *
 * 返回 `committedFiles`（服务端字段 `committed_files`）—— 它数的是**这个提交里的文件数**，
 * 因此可能大于勾选数，正是上面第 1 条的观测证据。
 */
export async function commitRemoteChanges(
  gateway: CodegGateway,
  path: string,
  message: string,
  files: string[],
  folderId?: number | null
): Promise<number> {
  const result = await gateway.call<{ committed_files?: number; committedFiles?: number }>(
    "git_commit",
    {
      path,
      folderId: folderId ?? null,
      message,
      files,
    }
  )
  const committed = result?.committed_files ?? result?.committedFiles
  return typeof committed === "number" && Number.isFinite(committed) ? committed : files.length
}

/**
 * 拉取远端更新（`git_pull`）。
 *
 * 返回 `{updated_files, conflict?}`。**冲突是一个正常返回值而不是错误**：服务端把
 * `GitConflictInfo{has_conflicts, conflicted_files, operation, upstream_commit}` 放在
 * 成功响应里（`codeg-plus/src-tauri/src/commands/folders.rs:181-192`），因为 pull 确实
 * 执行了、工作区确实变了，只是留下了待解决的冲突。
 *
 * 手机端**解决不了冲突**（三栏合并编辑器是桌面端的能力），所以调用方必须把冲突文件名
 * 明确列出来并让用户去电脑上处理 —— 静默当成成功是最糟的结果：用户以为同步好了，
 * 实际工作区里躺着一堆冲突标记。
 */
export async function pullRemoteChanges(
  gateway: CodegGateway,
  path: string
): Promise<{ updatedFiles: number; conflictFiles: string[] }> {
  const result = await gateway.call<{
    updated_files?: number
    updatedFiles?: number
    conflict?: {
      has_conflicts?: boolean
      hasConflicts?: boolean
      conflicted_files?: string[]
      conflictedFiles?: string[]
    } | null
  }>("git_pull", { path, credentials: null })
  const updated = result?.updated_files ?? result?.updatedFiles
  const conflict = result?.conflict
  const conflictFiles =
    conflict && (conflict.has_conflicts === true || conflict.hasConflicts === true)
      ? (conflict.conflicted_files ?? conflict.conflictedFiles ?? []).filter(
          (file): file is string => typeof file === "string" && file.trim().length > 0
        )
      : []
  return {
    updatedFiles: typeof updated === "number" && Number.isFinite(updated) ? updated : 0,
    conflictFiles,
  }
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
