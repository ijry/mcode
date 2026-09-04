import type { GitStatusEntry } from "@/services/projectGit"

/**
 * 提交表单的纯逻辑（选择集、校验、结果文案）。
 *
 * 放在纯模块里而不是组件内：勾选集的去重与「提交的是整个索引」这条语义都值得单测锁死 ——
 * 前者错了会把同一个文件传两次给 `git add`，后者错了会让用户以为自己只提交了勾的那几个。
 */

export interface CommitFileOption {
  file: string
  /** git 短状态码（`M` / `??` / `MM`…）。同一个文件可能有多条状态记录，这里合并成一行。 */
  statuses: string[]
  selected: boolean
}

/**
 * 按文件去重成勾选项。
 *
 * `git status --porcelain` 对同一个文件可以给出多行（索引态与工作区态各一条），
 * 面板的列表 key 用的正是 `${status}:${file}`，所以重复是**预期**的。传给 `git add`
 * 的路径必须去重，否则同一个 pathspec 会出现两次。
 *
 * 默认全选：手机上最常见的动作是「智能体刚改完，我看过 diff 了，提交」。
 */
export function buildCommitFileOptions(entries: GitStatusEntry[] | null | undefined): CommitFileOption[] {
  const byFile = new Map<string, CommitFileOption>()
  for (const entry of Array.isArray(entries) ? entries : []) {
    const file = String(entry?.file || "").trim()
    if (!file) continue
    const status = String(entry?.status || "").trim()
    const existing = byFile.get(file)
    if (existing) {
      if (status && !existing.statuses.includes(status)) existing.statuses.push(status)
      continue
    }
    byFile.set(file, { file, statuses: status ? [status] : [], selected: true })
  }
  return [...byFile.values()]
}

export function toggleCommitFile(options: CommitFileOption[], file: string): CommitFileOption[] {
  return options.map((option) =>
    option.file === file ? { ...option, selected: !option.selected } : option
  )
}

export function setAllCommitFiles(options: CommitFileOption[], selected: boolean): CommitFileOption[] {
  return options.map((option) => ({ ...option, selected }))
}

export function selectedCommitFiles(options: CommitFileOption[]): string[] {
  return options.filter((option) => option.selected).map((option) => option.file)
}

export interface CommitFormValidation {
  valid: boolean
  error: string
}

/**
 * 校验。
 *
 * **空勾选不是错误**：`git_commit` 的第二步是不带 pathspec 的 `git commit`，所以
 * 「一个都不勾」等于「提交已经暂存的内容」—— 那是一个合法且有用的动作（智能体或 PC 端
 * 已经 `git add` 过）。真正会失败的是「索引里也没有东西」，而那只有服务端知道，
 * 所以那种情况让服务端报错、原样透出，不在这里猜。
 */
export function validateCommitForm(input: { message: string }): CommitFormValidation {
  const message = String(input.message || "").trim()
  if (!message) return { valid: false, error: "请填写提交说明" }
  return { valid: true, error: "" }
}

/**
 * 结果文案。服务端数的是**这个提交里的文件数**，可能比勾选数大（索引里本来就有别的东西），
 * 差异要说出来 —— 那正是「提交的是整个索引」这条语义的观测证据，闷着会被当成 bug。
 */
export function buildCommitResultText(input: {
  committedFiles: number
  selectedCount: number
}): string {
  const committed = Math.max(0, Math.trunc(Number(input.committedFiles || 0)))
  if (committed > input.selectedCount) {
    return `已提交 ${committed} 个文件（含此前已暂存的内容）`
  }
  return `已提交 ${committed} 个文件`
}

/** 勾选项的状态摘要，用于行尾的小字。 */
export function commitFileStatusText(option: CommitFileOption): string {
  return option.statuses.join(" ")
}
