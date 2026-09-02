import { buildForgeSourceKey, forgeItemKindOf, normalizeForgeRepo } from "@/pages/forge/forgeSourceKey"

/**
 * source key 的客户端镜像。
 *
 * `work_task_lookup_by_source` 是精确字符串匹配，key 由 Rust `forge::source_key()` 写入。
 * 差一个字符芯片就永远不亮 —— **而且不报错**，只是「这个 issue 看起来没人处理过」，
 * 于是被重复触发一次。下面的用例照抄 Rust 侧 `source_key_normalizes_and_validates`。
 */
describe("normalizeForgeRepo", () => {
  it("lowercases and strips the decorations", () => {
    expect(normalizeForgeRepo("  /Microsoft/TypeScript.git/  ")).toBe("microsoft/typescript")
  })

  /**
   * **`.git` 是重复剥离的。** Rust 用 `trim_end_matches(".git")`（一直剥到没有为止），
   * 而桌面端的 TS 镜像用 `.replace(/\.git$/i, "")` 只剥一次。以**写 key 的 Rust** 为准
   * —— 一个 `repo.git.git` 形式的远端（某些镜像工具会这么生成）在两边会算出不同的 key。
   */
  it("strips a repeated .git suffix the way the backend does", () => {
    expect(normalizeForgeRepo("owner/repo.git.git")).toBe("owner/repo")
    expect(normalizeForgeRepo("owner/repo.GIT")).toBe("owner/repo")
  })

  /** GitLab 的完整子组路径要原样保留（只是小写）。 */
  it("keeps a gitlab subgroup path", () => {
    expect(normalizeForgeRepo("Group/Sub/App")).toBe("group/sub/app")
  })

  it("tolerates junk", () => {
    expect(normalizeForgeRepo("")).toBe("")
    expect(normalizeForgeRepo("   ")).toBe("")
  })
})

describe("buildForgeSourceKey", () => {
  it("builds the canonical five-part key", () => {
    expect(
      buildForgeSourceKey({
        provider: "github",
        serverHost: "GitHub.com",
        ownerRepo: "Microsoft/TypeScript.git",
        kind: "issue",
        number: 42,
      })
    ).toBe("github:github.com:microsoft/typescript:issue:42")
  })

  it("keeps issue and pr in separate namespaces", () => {
    const base = {
      provider: "gitlab" as const,
      serverHost: "gitlab.com",
      ownerRepo: "group/app",
      number: 7,
    }
    expect(buildForgeSourceKey({ ...base, kind: "issue" })).not.toBe(
      buildForgeSourceKey({ ...base, kind: "pr" })
    )
  })

  /**
   * 坐标坏掉返回空串**而不是抛** —— 调用方是在为一屏可见行批量构造 key，一行坏掉不该
   * 让整批反查失败。
   */
  it("returns an empty string rather than throwing on bad coordinates", () => {
    const base = {
      provider: "github" as const,
      serverHost: "github.com",
      ownerRepo: "owner/repo",
      kind: "issue" as const,
      number: 1,
    }
    expect(buildForgeSourceKey({ ...base, number: 0 })).toBe("")
    expect(buildForgeSourceKey({ ...base, number: -3 })).toBe("")
    expect(buildForgeSourceKey({ ...base, serverHost: "" })).toBe("")
    expect(buildForgeSourceKey({ ...base, ownerRepo: "" })).toBe("")
    expect(buildForgeSourceKey({ ...base, provider: "bitbucket" as any })).toBe("")
    expect(buildForgeSourceKey({ ...base, kind: "merge_request" as any })).toBe("")
  })

  /** host 不能带 `/` 或 `:`（后者会把端口混进坐标系，而 git 远端解析出的 host 从不带端口）。 */
  it("rejects a host that is not a bare hostname", () => {
    const base = {
      provider: "github" as const,
      ownerRepo: "owner/repo",
      kind: "issue" as const,
      number: 1,
    }
    expect(buildForgeSourceKey({ ...base, serverHost: "github.com/x" })).toBe("")
    expect(buildForgeSourceKey({ ...base, serverHost: "github.com:443" })).toBe("")
  })

  /** repo 必须是 `owner/name` 形状，且每段只含字母数字与 `-_.`（同时是注入卫生）。 */
  it("rejects a repository path that is not owner/name", () => {
    const base = {
      provider: "github" as const,
      serverHost: "github.com",
      kind: "issue" as const,
      number: 1,
    }
    expect(buildForgeSourceKey({ ...base, ownerRepo: "justaname" })).toBe("")
    expect(buildForgeSourceKey({ ...base, ownerRepo: "owner//repo" })).toBe("")
    expect(buildForgeSourceKey({ ...base, ownerRepo: "owner/re po" })).toBe("")
    expect(buildForgeSourceKey({ ...base, ownerRepo: "owner/re?po" })).toBe("")
  })

  it("accepts the punctuation real repositories use", () => {
    expect(
      buildForgeSourceKey({
        provider: "github",
        serverHost: "ghe.corp.com",
        ownerRepo: "my-org/my_repo.js",
        kind: "pr",
        number: 9,
      })
    ).toBe("github:ghe.corp.com:my-org/my_repo.js:pr:9")
  })
})

describe("forgeItemKindOf", () => {
  it("reads the kind off the row", () => {
    expect(forgeItemKindOf({ is_pr: true })).toBe("pr")
    expect(forgeItemKindOf({ is_pr: false })).toBe("issue")
  })
})
