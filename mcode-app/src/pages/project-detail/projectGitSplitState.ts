export const DEFAULT_PROJECT_GIT_SPLIT_RATIO = 0.5

const MIN_PROJECT_GIT_SPLIT_RATIO = 0.3
const MAX_PROJECT_GIT_SPLIT_RATIO = 0.75

export interface ProjectGitSplitStorage {
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: unknown): unknown
}

export function buildProjectGitSplitStorageKey(connectionId: string, folderId: number) {
  return `mcode_project_git_split:${connectionId}:${folderId}`
}

export function clampProjectGitSplitRatio(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_PROJECT_GIT_SPLIT_RATIO
  return Math.min(MAX_PROJECT_GIT_SPLIT_RATIO, Math.max(MIN_PROJECT_GIT_SPLIT_RATIO, value))
}

export function readProjectGitSplitRatio(
  storage: ProjectGitSplitStorage,
  connectionId: string,
  folderId: number
) {
  const raw = Number(storage.getStorageSync(buildProjectGitSplitStorageKey(connectionId, folderId)))
  return clampProjectGitSplitRatio(raw)
}

export function writeProjectGitSplitRatio(
  storage: ProjectGitSplitStorage,
  connectionId: string,
  folderId: number,
  ratio: number
) {
  storage.setStorageSync(
    buildProjectGitSplitStorageKey(connectionId, folderId),
    clampProjectGitSplitRatio(ratio)
  )
}
