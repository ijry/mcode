import {
  applyDefaultForgeAccount,
  buildForgeAccountId,
  findConflictingAccount,
  forgeProviderLabel,
  forgeScopeSummary,
  forgeServerHost,
  guessForgeProvider,
  normalizeForgeServerUrl,
  removeForgeAccount,
} from "@/pages/forge-accounts/forgeAccountForm"

describe("normalizeForgeServerUrl", () => {
  /** 用户会直接打主机名。补 scheme 而不是拒绝 —— 这是最常见的输入。 */
  it("adds https to a bare hostname", () => {
    expect(normalizeForgeServerUrl("github.com")).toBe("https://github.com")
    expect(normalizeForgeServerUrl("  GitHub.com  ")).toBe("https://github.com")
  })

  /**
   * 路径不留：后端的 `host_profile` 按**主机**匹配，一个带路径的 server_url 会让它
   * 永远匹配不上 git 远端解析出来的 host —— 表现是「明明加了账号却还说没有账号」。
   */
  it("strips the path so the host can match a git remote", () => {
    expect(normalizeForgeServerUrl("https://ghe.corp.com/some/path")).toBe("https://ghe.corp.com")
  })

  /** 端口要留 —— 自建实例可能跑在非标端口上。 */
  it("keeps a non-standard port", () => {
    expect(normalizeForgeServerUrl("http://git.local:8080")).toBe("http://git.local:8080")
  })

  it("returns an empty string for junk", () => {
    expect(normalizeForgeServerUrl("")).toBe("")
    expect(normalizeForgeServerUrl("   ")).toBe("")
    expect(normalizeForgeServerUrl("https://")).toBe("")
  })
})

describe("forgeServerHost", () => {
  it("extracts the host forge coordinates use", () => {
    expect(forgeServerHost("https://GitHub.com/owner/repo")).toBe("github.com")
    expect(forgeServerHost("git.local:8080")).toBe("git.local")
  })

  it("is empty when there is nothing to extract", () => {
    expect(forgeServerHost("")).toBe("")
  })
})

describe("guessForgeProvider", () => {
  /**
   * 这与「客户端永不选 provider」不矛盾：那条规则说的是**发请求时**不能猜。这里是在
   * **创建**一份凭据 —— 用户必须说明 token 是给哪个 API 的，一个自建实例的主机名什么
   * 都看不出来，所以只能猜一个默认值让他改。
   */
  it("recognizes the obvious gitlab hosts", () => {
    expect(guessForgeProvider("gitlab.com")).toBe("gitlab")
    expect(guessForgeProvider("https://gitlab.corp.com")).toBe("gitlab")
    expect(guessForgeProvider("https://git.gitlab.internal")).toBe("gitlab")
  })

  it("defaults to github for everything else", () => {
    expect(guessForgeProvider("github.com")).toBe("github")
    expect(guessForgeProvider("ghe.corp.com")).toBe("github")
    expect(guessForgeProvider("git.corp.com")).toBe("github")
    expect(guessForgeProvider("")).toBe("github")
  })
})

describe("buildForgeAccountId", () => {
  it("embeds the provider and host so the stored blob is readable", () => {
    expect(buildForgeAccountId("gitlab", "https://gitlab.corp.com", 1_700_000_000_000)).toBe(
      "gitlab-gitlab.corp.com-1700000000000"
    )
  })

  it("stays unique across calls", () => {
    expect(buildForgeAccountId("github", "github.com", 1)).not.toBe(
      buildForgeAccountId("github", "github.com", 2)
    )
  })

  it("survives an unparseable url", () => {
    expect(buildForgeAccountId("github", "", 1)).toBe("github-unknown-1")
  })
})

describe("findConflictingAccount", () => {
  const accounts = [
    { id: "a", server_url: "https://github.com", provider: "github" },
    { id: "b", server_url: "https://gitlab.com", provider: "gitlab" },
    { id: "c", server_url: "https://legacy.corp.com", provider: null },
  ]

  /**
   * 判据是 `(host, provider)` 而不是 server_url —— 后端 `resolve_forge_auth` 就是按
   * 这两个维度挑账号的：同一台主机上可以同时有 GitHub 与 GitLab 的凭据（自建实例
   * 迁移期间真的会这样），但同一个组合有两份就只有一份被用到，另一份是死数据。
   */
  it("flags a duplicate on the same host and provider", () => {
    expect(findConflictingAccount(accounts, "github.com", "github")?.id).toBe("a")
    expect(findConflictingAccount(accounts, "https://github.com/x", "github")?.id).toBe("a")
  })

  it("allows two forges on one host", () => {
    expect(findConflictingAccount(accounts, "github.com", "gitlab")).toBeNull()
  })

  /** provider 为 null 的老账号服务任何 forge，所以它和任何 provider 都算撞车。 */
  it("treats a legacy account as conflicting with either provider", () => {
    expect(findConflictingAccount(accounts, "legacy.corp.com", "github")?.id).toBe("c")
    expect(findConflictingAccount(accounts, "legacy.corp.com", "gitlab")?.id).toBe("c")
  })

  /** 编辑自己时不算撞车。 */
  it("excludes the account being edited", () => {
    expect(findConflictingAccount(accounts, "github.com", "github", "a")).toBeNull()
  })

  it("finds nothing for an unparseable url", () => {
    expect(findConflictingAccount(accounts, "", "github")).toBeNull()
  })
})

describe("applyDefaultForgeAccount", () => {
  const accounts = [
    { id: "a", server_url: "https://github.com", is_default: true },
    { id: "b", server_url: "https://github.com", is_default: false },
    { id: "c", server_url: "https://gitlab.com", is_default: true },
  ]

  /**
   * 只在**同主机内**互斥：`is_default` 的语义是「这台主机的默认账号」，跨主机清掉
   * 会让另一个 forge 上的默认账号莫名失效。
   */
  it("moves the default within one host only", () => {
    const next = applyDefaultForgeAccount(accounts, "b")
    expect(next.find((account) => account.id === "b")?.is_default).toBe(true)
    expect(next.find((account) => account.id === "a")?.is_default).toBe(false)
    // gitlab.com 的默认不受影响。
    expect(next.find((account) => account.id === "c")?.is_default).toBe(true)
  })

  it("does nothing for an unknown id", () => {
    expect(applyDefaultForgeAccount(accounts, "zzz")).toBe(accounts)
  })
})

describe("removeForgeAccount", () => {
  it("removes the row", () => {
    const accounts = [
      { id: "a", server_url: "https://github.com", is_default: false },
      { id: "b", server_url: "https://github.com", is_default: false },
    ]
    expect(removeForgeAccount(accounts, "a").map((account) => account.id)).toEqual(["b"])
  })

  /**
   * 删掉默认账号后要把默认让给同主机的下一个 —— 否则那台主机没有默认账号，
   * `resolve_forge_auth` 会退到「第一个匹配」（行为上能用），但 UI 上没有任何一行
   * 显示为默认，用户看不出接下来会用哪个。
   */
  it("passes the default to the next account on that host", () => {
    const accounts = [
      { id: "a", server_url: "https://github.com", is_default: true },
      { id: "b", server_url: "https://github.com", is_default: false },
      { id: "c", server_url: "https://gitlab.com", is_default: true },
    ]
    const next = removeForgeAccount(accounts, "a")
    expect(next.find((account) => account.id === "b")?.is_default).toBe(true)
    expect(next.find((account) => account.id === "c")?.is_default).toBe(true)
  })

  it("leaves nothing behind when the host had only one account", () => {
    const accounts = [{ id: "a", server_url: "https://github.com", is_default: true }]
    expect(removeForgeAccount(accounts, "a")).toEqual([])
  })

  it("does nothing for an unknown id", () => {
    const accounts = [{ id: "a", server_url: "https://github.com", is_default: true }]
    expect(removeForgeAccount(accounts, "zzz")).toBe(accounts)
  })
})

describe("labels", () => {
  it("names both providers and says so when unset", () => {
    expect(forgeProviderLabel("github")).toBe("GitHub")
    expect(forgeProviderLabel("gitlab")).toBe("GitLab")
    // null = 迁移前存下来的账号。说出来而不是印一个空白。
    expect(forgeProviderLabel(null)).toBe("未指定")
  })

  /**
   * 空 scope 列表是「forge 没说」而不是「没有权限」（GitHub 的细粒度 token 完全不报
   * scope）。说错这一点会让用户去重新生成一个本来好用的 token。
   */
  it("does not claim an unreported scope list means no access", () => {
    expect(forgeScopeSummary([])).toContain("未报告")
    expect(forgeScopeSummary(["repo", "read:org"])).toBe("repo · read:org")
  })
})
