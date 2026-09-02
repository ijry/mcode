import type {
  ForgeChangeDetail,
  ForgeChangedFile,
  ForgeCheck,
  ForgeCheckList,
  ForgeMergeMethod,
  ForgeMergeOptions,
} from "@/types/forge"

/**
 * 提议的变更（PR）的呈现规则。**纯模块** —— 不 import uni / pinia / 组件。
 *
 * 这个文件几乎全部在处理**不能压平的 null**。每条规则对应一个具体的错误显示，
 * 注释说明它防的是什么。
 */

/* ===== 可合并性 ===== */

/** `mergeable` 的三态。`unknown` 是真实答案而不是「加载中」。 */
export type ForgeMergeability = "yes" | "no" | "unknown"

export function forgeMergeability(detail: Pick<ForgeChangeDetail, "mergeable">): ForgeMergeability {
  if (detail.mergeable === true) return "yes"
  if (detail.mergeable === false) return "no"
  return "unknown"
}

/**
 * 可合并性的文案。
 *
 * `unknown` 说「正在计算」而不是「不能合并」：两个 forge 都异步算这个值（GitHub 答
 * `null`，GitLab 报 `merge_status: "unchecked"`），说成不能合并会让人去找一个可能
 * 不存在的冲突。
 */
export function forgeMergeabilityText(state: ForgeMergeability): string {
  switch (state) {
    case "yes":
      return "可以合并"
    case "no":
      return "存在冲突"
    default:
      return "正在计算能否合并"
  }
}

/** 可合并性对应的主题变量（`themeVar` 为空 = 用字面兜底）。 */
export function forgeMergeabilityTone(state: ForgeMergeability): {
  themeVar: string
  fallback: string
} {
  switch (state) {
    case "yes":
      return { themeVar: "--up-success", fallback: "#19be6b" }
    case "no":
      return { themeVar: "--up-error", fallback: "#fa3534" }
    default:
      return { themeVar: "--up-tips-color", fallback: "#909193" }
  }
}

/* ===== 合并按钮 ===== */

/** 为什么现在不能合并。`null` = 没有已知的阻挡。 */
export type ForgeMergeBlocker = "state" | "draft" | "conflict" | null

/**
 * 合并被什么挡着。
 *
 * **注意 `mergeable === null` 不算阻挡** —— 按钮仍然可点。理由：只有 forge 有资格
 * 说不，而它此刻还没算完。禁用按钮意味着用户要反复下拉刷新直到它变绿，而直接点下去
 * 最坏结果是一个 forge 给出的、准确的拒绝。
 */
export function forgeMergeBlocker(
  detail: Pick<ForgeChangeDetail, "state" | "draft" | "mergeable">
): ForgeMergeBlocker {
  if (detail.state !== "open") return "state"
  if (detail.draft) return "draft"
  if (detail.mergeable === false) return "conflict"
  return null
}

export function forgeMergeBlockerText(blocker: ForgeMergeBlocker): string {
  switch (blocker) {
    case "state":
      return "这个变更已经关闭或合并，不能再合并。"
    case "draft":
      return "这是草稿，先在远端标为可评审才能合并。"
    case "conflict":
      return "与目标分支存在冲突，需要先在远端仓库或工作区解决。"
    default:
      return ""
  }
}

/**
 * 菜单里提供哪些合并方式。
 *
 * `methods` 为空是「forge 不肯说」（token 读得到变更但读不到仓库设置），此时只给
 * `merge` —— 画三个菜单项而其中两个答 405 比只画一个更糟。与后端
 * `ForgeMergeOptions::unknown()` 一致。
 */
export function forgeMergeMethods(options: ForgeMergeOptions): ForgeMergeMethod[] {
  return options.methods.length > 0 ? options.methods : ["merge"]
}

/**
 * 合并方式的文案。
 *
 * `merge` 的说明**取决于 `merge_strategy`**：GitHub 上它总是写一个合并提交，但 GitLab
 * 的项目设置决定它是合并提交、变基后合并还是快进 —— API 没有覆盖手段。用同一句话描述
 * 三种结果，就是让菜单向一个只允许快进的项目承诺一个合并提交。
 */
export function forgeMergeMethodLabel(method: ForgeMergeMethod): string {
  switch (method) {
    case "squash":
      return "压缩后合并"
    case "rebase":
      return "变基后合并"
    default:
      return "创建合并提交"
  }
}

export function forgeMergeMethodHint(
  method: ForgeMergeMethod,
  strategy: ForgeMergeOptions["merge_strategy"]
): string {
  if (method === "squash") return "把这个分支的提交压成一个，再并入目标分支。"
  if (method === "rebase") return "把这个分支的提交逐个重放到目标分支之上。"
  switch (strategy) {
    case "fast_forward":
      return "目标分支直接快进到这个分支，不产生合并提交。"
    case "rebase_merge":
      return "先把这个分支变基到目标分支之上，再通过一个合并提交并入。"
    default:
      return "保留这个分支的提交，并通过一个合并提交并入目标分支。"
  }
}

/**
 * 合并确认的文案。
 *
 * 与关闭/重开同理：必须说清这会发生在**远端仓库**上。额外要说 `base_ref` ——
 * 一个变更可能是提给 `release/1.2` 而不是 `main` 的，而那是完全不同的后果。
 */
export function forgeMergeConfirmText(
  title: string,
  baseRef: string,
  method: ForgeMergeMethod
): { title: string; content: string } {
  return {
    title: "确认合并？",
    content: `「${title}」会以「${forgeMergeMethodLabel(method)}」的方式合并到 ${baseRef || "目标分支"}，所有关注的人都会看到。这个操作不可撤销。`,
  }
}

/* ===== 检查项 ===== */

export interface ForgeCheckSummary {
  passing: number
  failing: number
  pending: number
  /** 跑了但没结论（skipped / cancelled / manual）。 */
  neutral: number
  /** 失败但被 `allow_failure` 允许的数量 —— 它们不该让整体读成红色。 */
  allowedFailures: number
}

/**
 * 检查项汇总。
 *
 * `allow_failure` 的失败**单独计数**：GitLab 明确允许某些 job 失败而不阻塞变更，
 * 把它们算进 `failing` 会让一个健康的流水线显示成红色。
 */
export function forgeCheckSummary(checks: ForgeCheck[]): ForgeCheckSummary {
  const summary: ForgeCheckSummary = {
    passing: 0,
    failing: 0,
    pending: 0,
    neutral: 0,
    allowedFailures: 0,
  }
  checks.forEach((check) => {
    switch (check.state) {
      case "success":
        summary.passing += 1
        break
      case "failure":
        if (check.allow_failure) summary.allowedFailures += 1
        else summary.failing += 1
        break
      case "queued":
      case "running":
        summary.pending += 1
        break
      default:
        summary.neutral += 1
    }
  })
  return summary
}

/**
 * 检查项区域该显示成哪种状态。
 *
 * 四种，且前两种**必须分开**：
 * - `unavailable` —— forge 不肯说（token 缺 `checks:read`、GitLab 关了 CI）；
 * - `empty` —— forge 答了，什么都没配。
 *
 * 压平这两者会在一个流水线是红的仓库上印出「没有检查」。
 */
export type ForgeChecksState = "unavailable" | "empty" | "partial" | "ready"

export function forgeChecksState(list: ForgeCheckList): ForgeChecksState {
  if (!list.available) return "unavailable"
  if (list.partial) return "partial"
  return list.checks.length === 0 ? "empty" : "ready"
}

export function forgeChecksStateText(state: ForgeChecksState): string {
  switch (state) {
    case "unavailable":
      return "当前账号读不到这个仓库的检查项。"
    case "empty":
      return "这个变更没有配置任何检查项。"
    case "partial":
      return "部分检查项读不到，下面的列表可能不完整。"
    default:
      return ""
  }
}

/**
 * 检查项汇总的一句话。
 *
 * `partial` 时**降级措辞**：即使已读到的全部通过，也不能说「全部通过」—— 读不到的
 * 那些可能是红的，而这句话会被当成可以合并的依据。
 */
export function forgeCheckSummaryText(
  summary: ForgeCheckSummary,
  state: ForgeChecksState
): string {
  const parts: string[] = []
  if (summary.passing > 0) parts.push(`${summary.passing} 项通过`)
  if (summary.failing > 0) parts.push(`${summary.failing} 项失败`)
  if (summary.pending > 0) parts.push(`${summary.pending} 项进行中`)
  if (summary.allowedFailures > 0) parts.push(`${summary.allowedFailures} 项失败（允许）`)
  if (summary.neutral > 0) parts.push(`${summary.neutral} 项无结论`)
  if (parts.length === 0) return ""
  if (state === "partial") return `已读到：${parts.join(" · ")}`
  if (summary.failing === 0 && summary.pending === 0 && summary.passing > 0) {
    return `所有检查项均已通过（${summary.passing} 项）`
  }
  return parts.join(" · ")
}

/** 单个检查项的字形。 */
export function forgeCheckGlyph(state: ForgeCheck["state"]): {
  icon: string
  label: string
  themeVar: string
  fallback: string
} {
  switch (state) {
    case "success":
      return {
        icon: "checkmark-circle",
        label: "通过",
        themeVar: "--up-success",
        fallback: "#19be6b",
      }
    case "failure":
      return { icon: "close-circle", label: "失败", themeVar: "--up-error", fallback: "#fa3534" }
    case "running":
      return { icon: "reload", label: "运行中", themeVar: "--up-warning", fallback: "#ff9900" }
    case "queued":
      return { icon: "clock", label: "排队中", themeVar: "--up-tips-color", fallback: "#909193" }
    default:
      // `neutral` 与 success 分开：一个被跳过的必需检查不是通过，画成绿色正是让红色
      // 流水线读起来是绿的那个错误。
      return {
        icon: "minus-circle",
        label: "无结论",
        themeVar: "--up-content-color",
        fallback: "#606266",
      }
  }
}

/* ===== 变更规模 ===== */

/**
 * 规模的展示值。
 *
 * 每个都可能是 `null`（GitLab 一个都不给），此时返回空串而不是 `0` —— 印一个 0 是在
 * 断言「这个变更什么都没碰」。
 */
export function forgeChangeSizeText(value: number | null, unit: string): string {
  if (value == null) return ""
  return `${value} ${unit}`
}

/** 有没有任何规模数字可显示 —— 全是 null 时整块不画。 */
export function hasForgeChangeSize(
  detail: Pick<ForgeChangeDetail, "additions" | "deletions" | "changed_files" | "commits">
): boolean {
  return (
    detail.additions != null ||
    detail.deletions != null ||
    detail.changed_files != null ||
    detail.commits != null
  )
}

/* ===== 文件 ===== */

export function forgeFileStatusLabel(status: ForgeChangedFile["status"]): string {
  switch (status) {
    case "added":
      return "新增"
    case "removed":
      return "删除"
    case "renamed":
      return "重命名"
    default:
      return "修改"
  }
}

export function forgeFileStatusTone(status: ForgeChangedFile["status"]): {
  themeVar: string
  fallback: string
} {
  switch (status) {
    case "added":
      return { themeVar: "--up-success", fallback: "#19be6b" }
    case "removed":
      return { themeVar: "--up-error", fallback: "#fa3534" }
    case "renamed":
      return { themeVar: "--up-primary", fallback: "#2979ff" }
    default:
      return { themeVar: "--up-warning", fallback: "#ff9900" }
  }
}

/**
 * 这个文件能不能展开看 diff。
 *
 * `patch` 为 null 的两种情形（二进制 / forge 因过大扣留）都意味着没有 diff 可看 ——
 * 给一个展开后是空白的按钮比不给更糟。
 */
export function canExpandForgeFile(file: Pick<ForgeChangedFile, "patch">): boolean {
  return Boolean(file.patch)
}

/** 不能展开时说明原因 —— 「二进制」与「太大」是用户能理解的两种不同答案。 */
export function forgeFileDiffUnavailableText(
  file: Pick<ForgeChangedFile, "binary" | "patch">
): string {
  if (file.patch) return ""
  return file.binary ? "二进制文件，没有可显示的差异" : "差异过大，远端没有提供"
}

/** 文件的行数变化。两个都为 null 时返回空串（GitLab 的二进制文件就是这样）。 */
export function forgeFileStatsText(
  file: Pick<ForgeChangedFile, "additions" | "deletions">
): string {
  const parts: string[] = []
  if (file.additions != null) parts.push(`+${file.additions}`)
  if (file.deletions != null) parts.push(`-${file.deletions}`)
  return parts.join(" / ")
}

/** 只显示文件名（完整路径在下面一行）—— 手机上一行放不下 `src/services/forge/forgeApi.ts`。 */
export function forgeFileName(path: string): string {
  const segments = String(path || "").split("/")
  return segments[segments.length - 1] || path
}

/** 路径里除文件名之外的部分。空串 = 文件在仓库根目录。 */
export function forgeFileDirectory(path: string): string {
  const segments = String(path || "").split("/")
  segments.pop()
  return segments.join("/")
}
