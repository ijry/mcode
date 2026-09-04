/**
 * 拉取 / fetch 的结果文案。
 *
 * 单独成模块是因为**冲突这条分支的措辞是产品决定，不是顺手写的字符串**：手机端解决不了
 * 冲突（三栏合并编辑器是桌面端能力），所以文案必须同时做到
 * ① 明说有冲突、② 列出文件、③ 指向电脑端。少任何一条，用户都会以为同步成功了。
 */

export interface PullOutcome {
  updatedFiles: number
  conflictFiles: string[]
}

export interface PullOutcomeView {
  /** 有冲突时为 true —— UI 要用常驻提示而不是一闪而过的 toast。 */
  hasConflict: boolean
  /** 一行摘要（toast 用）。 */
  text: string
  /** 冲突详情（常驻提示用），无冲突时为空串。 */
  conflictText: string
}

/** 冲突文件列表在提示里最多展示几个，其余折成「等 N 个」。 */
const MAX_LISTED_CONFLICT_FILES = 3

export function buildPullOutcomeView(outcome: PullOutcome | null | undefined): PullOutcomeView {
  const updated = Math.max(0, Math.trunc(Number(outcome?.updatedFiles || 0)))
  const files = (outcome?.conflictFiles || []).filter(
    (file) => typeof file === "string" && file.trim().length > 0
  )

  if (files.length === 0) {
    return {
      hasConflict: false,
      text: updated > 0 ? `已拉取，更新 ${updated} 个文件` : "已拉取，没有新的改动",
      conflictText: "",
    }
  }

  const listed = files.slice(0, MAX_LISTED_CONFLICT_FILES).join("、")
  const rest = files.length - Math.min(files.length, MAX_LISTED_CONFLICT_FILES)
  const tail = rest > 0 ? ` 等 ${files.length} 个文件` : ""
  return {
    hasConflict: true,
    text: `拉取后有 ${files.length} 个文件冲突`,
    conflictText: `拉取后存在冲突：${listed}${tail}。手机端无法合并冲突，请到电脑端解决后再继续。`,
  }
}
