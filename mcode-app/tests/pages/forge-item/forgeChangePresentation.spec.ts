import {
  canExpandForgeFile,
  forgeChangeSizeText,
  forgeCheckGlyph,
  forgeChecksState,
  forgeChecksStateText,
  forgeCheckSummary,
  forgeCheckSummaryText,
  forgeFileDiffUnavailableText,
  forgeFileDirectory,
  forgeFileName,
  forgeFileStatsText,
  forgeFileStatusLabel,
  forgeMergeability,
  forgeMergeabilityText,
  forgeMergeBlocker,
  forgeMergeBlockerText,
  forgeMergeConfirmText,
  forgeMergeMethodHint,
  forgeMergeMethodLabel,
  forgeMergeMethods,
  hasForgeChangeSize,
} from "@/pages/forge-item/forgeChangePresentation"
import type { ForgeCheck, ForgeCheckList, ForgeMergeOptions } from "@/types/forge"

function detailWith(overrides: Record<string, any> = {}) {
  return {
    state: "open",
    draft: false,
    mergeable: true,
    additions: 10,
    deletions: 2,
    changed_files: 3,
    commits: 1,
    ...overrides,
  } as any
}

function checkWith(overrides: Partial<ForgeCheck> = {}): ForgeCheck {
  return {
    id: "1",
    name: "build",
    state: "success",
    summary: null,
    url: null,
    allow_failure: false,
    ...overrides,
  }
}

function checkListWith(overrides: Partial<ForgeCheckList> = {}): ForgeCheckList {
  return { checks: [], available: true, partial: false, ...overrides }
}

describe("mergeability", () => {
  it("maps the boolean answers", () => {
    expect(forgeMergeability({ mergeable: true })).toBe("yes")
    expect(forgeMergeability({ mergeable: false })).toBe("no")
  })

  /**
   * `null` 是**真实的第三种答案**（两个 forge 都异步算这个值），不是 false。说成
   * 「不能合并」会让人去找一个可能不存在的冲突。
   */
  it("treats null as a third answer, not as false", () => {
    expect(forgeMergeability({ mergeable: null })).toBe("unknown")
    expect(forgeMergeabilityText("unknown")).toContain("正在计算")
    expect(forgeMergeabilityText("unknown")).not.toContain("不能")
    expect(forgeMergeabilityText("no")).not.toBe(forgeMergeabilityText("unknown"))
  })
})

describe("forgeMergeBlocker", () => {
  it("finds nothing wrong with an open, non-draft, mergeable change", () => {
    expect(forgeMergeBlocker(detailWith())).toBeNull()
  })

  it("blocks a closed or merged change", () => {
    expect(forgeMergeBlocker(detailWith({ state: "closed" }))).toBe("state")
    expect(forgeMergeBlocker(detailWith({ state: "merged" }))).toBe("state")
  })

  it("blocks a draft and a conflicting change", () => {
    expect(forgeMergeBlocker(detailWith({ draft: true }))).toBe("draft")
    expect(forgeMergeBlocker(detailWith({ mergeable: false }))).toBe("conflict")
  })

  /**
   * **`mergeable === null` 不算阻挡** —— 按钮仍然可点。只有 forge 有资格说不，而它
   * 此刻还没算完；禁用意味着用户要反复下拉刷新直到它变绿。
   */
  it("does not block while the forge is still computing", () => {
    expect(forgeMergeBlocker(detailWith({ mergeable: null }))).toBeNull()
  })

  it("gives every blocker its own words", () => {
    const texts = (["state", "draft", "conflict"] as const).map(forgeMergeBlockerText)
    expect(new Set(texts).size).toBe(3)
    expect(forgeMergeBlockerText(null)).toBe("")
  })
})

describe("forgeMergeMethods", () => {
  /**
   * 空 `methods` 是「forge 不肯说」（token 读得到变更但读不到仓库设置），此时只给
   * `merge` —— 画三个菜单项而其中两个答 405 比只画一个更糟。
   */
  it("falls back to a single method when the forge would not say", () => {
    const options: ForgeMergeOptions = {
      methods: [],
      default_method: "merge",
      merge_strategy: "merge_commit",
    }
    expect(forgeMergeMethods(options)).toEqual(["merge"])
  })

  it("offers what the repository permits, in order", () => {
    const options: ForgeMergeOptions = {
      methods: ["squash", "merge"],
      default_method: "squash",
      merge_strategy: "merge_commit",
    }
    expect(forgeMergeMethods(options)).toEqual(["squash", "merge"])
  })
})

describe("forgeMergeMethodHint", () => {
  /**
   * `merge` 的说明**取决于 `merge_strategy`**：GitHub 上它总写一个合并提交，但 GitLab
   * 的项目设置决定它是合并提交、变基后合并还是快进。用同一句话描述三种结果，就是让
   * 菜单向一个只允许快进的项目承诺一个合并提交。
   */
  it("describes what merge actually does under each strategy", () => {
    const commit = forgeMergeMethodHint("merge", "merge_commit")
    const rebase = forgeMergeMethodHint("merge", "rebase_merge")
    const ff = forgeMergeMethodHint("merge", "fast_forward")
    expect(new Set([commit, rebase, ff]).size).toBe(3)
    expect(ff).toContain("快进")
    expect(ff).toContain("不产生合并提交")
  })

  /** squash / rebase 的语义不受项目策略影响，说明保持一致。 */
  it("keeps squash and rebase independent of the strategy", () => {
    expect(forgeMergeMethodHint("squash", "fast_forward")).toBe(
      forgeMergeMethodHint("squash", "merge_commit")
    )
    expect(forgeMergeMethodHint("rebase", "fast_forward")).toBe(
      forgeMergeMethodHint("rebase", "merge_commit")
    )
  })

  it("labels every method", () => {
    const labels = (["merge", "squash", "rebase"] as const).map(forgeMergeMethodLabel)
    expect(new Set(labels).size).toBe(3)
  })
})

describe("forgeMergeConfirmText", () => {
  /**
   * 必须点名 `base_ref` —— 一个变更可能是提给 `release/1.2` 而不是 `main` 的，
   * 而那是完全不同的后果。
   */
  it("names the branch it will land on", () => {
    const copy = forgeMergeConfirmText("Fix crash", "release/1.2", "squash")
    expect(copy.content).toContain("release/1.2")
    expect(copy.content).toContain("Fix crash")
    expect(copy.content).toContain("压缩后合并")
  })

  it("says the operation cannot be undone", () => {
    expect(forgeMergeConfirmText("t", "main", "merge").content).toContain("不可撤销")
  })

  it("degrades without a base ref", () => {
    expect(forgeMergeConfirmText("t", "", "merge").content).toContain("目标分支")
  })
})

describe("forgeChecksState", () => {
  /**
   * **「读不到」与「没有配置」必须分开。** `available: false` 是 forge 不肯说（token
   * 缺 checks:read、GitLab 关了 CI）；`available: true` 加空列表才是「答了，什么都没配」。
   * 压平会在一个流水线是红的仓库上印出「没有检查」。
   */
  it("distinguishes unreadable from genuinely empty", () => {
    expect(forgeChecksState(checkListWith({ available: false }))).toBe("unavailable")
    expect(forgeChecksState(checkListWith({ available: true, checks: [] }))).toBe("empty")
    expect(forgeChecksStateText("unavailable")).toContain("读不到")
    expect(forgeChecksStateText("empty")).toContain("没有配置")
  })

  it("reports a partial answer", () => {
    expect(forgeChecksState(checkListWith({ partial: true, checks: [checkWith()] }))).toBe(
      "partial"
    )
    expect(forgeChecksStateText("partial")).toContain("不完整")
  })

  it("is ready when there is something to show", () => {
    expect(forgeChecksState(checkListWith({ checks: [checkWith()] }))).toBe("ready")
    expect(forgeChecksStateText("ready")).toBe("")
  })
})

describe("forgeCheckSummary", () => {
  it("counts each state", () => {
    const summary = forgeCheckSummary([
      checkWith({ id: "1", state: "success" }),
      checkWith({ id: "2", state: "failure" }),
      checkWith({ id: "3", state: "running" }),
      checkWith({ id: "4", state: "queued" }),
      checkWith({ id: "5", state: "neutral" }),
    ])
    expect(summary).toEqual({
      passing: 1,
      failing: 1,
      pending: 2,
      neutral: 1,
      allowedFailures: 0,
    })
  })

  /**
   * `allow_failure` 的失败**单独计数**：GitLab 明确允许某些 job 失败而不阻塞变更，
   * 把它们算进 failing 会让一个健康的流水线显示成红色。
   */
  it("keeps an allowed failure out of the failing count", () => {
    const summary = forgeCheckSummary([
      checkWith({ id: "1", state: "failure", allow_failure: true }),
    ])
    expect(summary.failing).toBe(0)
    expect(summary.allowedFailures).toBe(1)
  })
})

describe("forgeCheckSummaryText", () => {
  it("says everything passed when it did", () => {
    const summary = forgeCheckSummary([checkWith({ id: "1" }), checkWith({ id: "2" })])
    expect(forgeCheckSummaryText(summary, "ready")).toContain("均已通过")
  })

  /**
   * `partial` 时**降级措辞**：即使已读到的全部通过，也不能说「全部通过」—— 读不到的
   * 那些可能是红的，而这句话会被当成可以合并的依据。
   */
  it("refuses to claim everything passed on a partial answer", () => {
    const summary = forgeCheckSummary([checkWith()])
    const text = forgeCheckSummaryText(summary, "partial")
    expect(text).toContain("已读到")
    expect(text).not.toContain("均已通过")
  })

  it("lists the mixed states", () => {
    const summary = forgeCheckSummary([
      checkWith({ id: "1", state: "success" }),
      checkWith({ id: "2", state: "failure" }),
    ])
    const text = forgeCheckSummaryText(summary, "ready")
    expect(text).toContain("1 项通过")
    expect(text).toContain("1 项失败")
    expect(text).not.toContain("均已通过")
  })

  it("says nothing when there are no checks", () => {
    expect(forgeCheckSummaryText(forgeCheckSummary([]), "empty")).toBe("")
  })
})

describe("forgeCheckGlyph", () => {
  /**
   * `neutral` 与 `success` 分开：一个被跳过的必需检查不是通过，画成绿色正是让红色
   * 流水线读起来是绿的那个错误。
   */
  it("never paints a neutral check like a passing one", () => {
    const neutral = forgeCheckGlyph("neutral")
    const success = forgeCheckGlyph("success")
    expect(neutral.icon).not.toBe(success.icon)
    expect(neutral.fallback).not.toBe(success.fallback)
    expect(neutral.label).not.toBe(success.label)
  })

  it("gives every state a shape, a colour and a word", () => {
    ;(["queued", "running", "success", "failure", "neutral"] as const).forEach((state) => {
      const glyph = forgeCheckGlyph(state)
      expect(glyph.icon).toBeTruthy()
      expect(glyph.label).toBeTruthy()
      expect(glyph.fallback).toMatch(/^#[0-9a-f]{6}$/i)
    })
  })
})

describe("change size", () => {
  /** 每个计数都可能为 null（GitLab 一个都不给）—— 印一个 0 是在断言变更什么都没碰。 */
  it("says nothing where the forge said nothing", () => {
    expect(forgeChangeSizeText(null, "行")).toBe("")
    expect(forgeChangeSizeText(0, "行")).toBe("0 行")
    expect(forgeChangeSizeText(12, "行")).toBe("12 行")
  })

  it("hides the whole block when every counter is absent", () => {
    expect(
      hasForgeChangeSize({ additions: null, deletions: null, changed_files: null, commits: null })
    ).toBe(false)
    expect(
      hasForgeChangeSize({ additions: null, deletions: null, changed_files: 3, commits: null })
    ).toBe(true)
  })

  /** 一个真的 0（没有新增行的纯删除变更）要显示出来。 */
  it("shows a genuine zero", () => {
    expect(
      hasForgeChangeSize({ additions: 0, deletions: 12, changed_files: null, commits: null })
    ).toBe(true)
  })
})

describe("files", () => {
  it("labels every status", () => {
    const labels = (["added", "removed", "renamed", "modified"] as const).map(
      forgeFileStatusLabel
    )
    expect(new Set(labels).size).toBe(4)
  })

  /**
   * `patch` 为 null 的两种情形（二进制 / forge 因过大扣留）都意味着没有 diff 可看 ——
   * 给一个展开后是空白的按钮比不给更糟，而两种要说不同的话。
   */
  it("refuses to offer an expander with no diff", () => {
    expect(canExpandForgeFile({ patch: null })).toBe(false)
    expect(canExpandForgeFile({ patch: "@@ -1 +1 @@" })).toBe(true)
  })

  it("explains why a diff is missing", () => {
    expect(forgeFileDiffUnavailableText({ binary: true, patch: null })).toContain("二进制")
    expect(forgeFileDiffUnavailableText({ binary: false, patch: null })).toContain("过大")
    // 有 patch 时没有理由要解释。
    expect(forgeFileDiffUnavailableText({ binary: false, patch: "x" })).toBe("")
  })

  /** 行数两个都可能为 null（GitLab 的二进制文件）—— 此时整段不显示。 */
  it("omits the line counts the forge did not give", () => {
    expect(forgeFileStatsText({ additions: 10, deletions: 2 })).toBe("+10 / -2")
    expect(forgeFileStatsText({ additions: 10, deletions: null })).toBe("+10")
    expect(forgeFileStatsText({ additions: null, deletions: null })).toBe("")
  })

  /** 手机上一行放不下完整路径，拆成文件名 + 目录两行。 */
  it("splits a path into name and directory", () => {
    expect(forgeFileName("src/services/forge/forgeApi.ts")).toBe("forgeApi.ts")
    expect(forgeFileDirectory("src/services/forge/forgeApi.ts")).toBe("src/services/forge")
    expect(forgeFileName("README.md")).toBe("README.md")
    expect(forgeFileDirectory("README.md")).toBe("")
  })
})
