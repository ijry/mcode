import {
  deleteForgeAccountToken,
  detectGit,
  getGitSettings,
  hasForgeAccountToken,
  listForgeAccounts,
  normalizeAccountsSettings,
  normalizeForgeAccount,
  normalizeTokenValidation,
  saveForgeAccounts,
  saveForgeAccountToken,
  setGitSettings,
  validateForgeToken,
} from "@/services/forge/forgeAccountApi"
import type { CodegGateway } from "@/services/gateway"
import type { GitHubAccount } from "@/types/forgeAccount"

function makeGateway(result: unknown = null) {
  const calls: Array<{ command: string; payload: any }> = []
  const gateway = {
    mode: "direct" as const,
    async pair() {
      return null
    },
    async call(command: string, payload?: Record<string, unknown>) {
      calls.push({ command, payload })
      return result as any
    },
    async connectEvents() {
      throw new Error("not used")
    },
    async refreshAuth() {},
    getRemoteInstanceDescriptor() {
      return { instanceKey: "test", mode: "direct" as const, baseUrl: "", principal: "" }
    },
  }
  return { gateway: gateway as unknown as CodegGateway, calls }
}

const ACCOUNT: GitHubAccount = {
  id: "github-github.com-1",
  server_url: "https://github.com",
  username: "octocat",
  scopes: ["repo"],
  avatar_url: "https://example.com/a.png",
  is_default: true,
  created_at: "2026-09-01T00:00:00Z",
  provider: "github",
}

describe("forge account commands", () => {
  it("reads the accounts blob with an empty payload", async () => {
    const { gateway, calls } = makeGateway({ accounts: [] })
    await listForgeAccounts(gateway)
    expect(calls).toEqual([{ command: "get_github_accounts", payload: {} }])
  })

  /** 两个 forge 各有一个校验命令但**请求形状相同** —— GitLab 用 PAT 且在另一个端点报 scope。 */
  it("routes token validation to the provider's own command", async () => {
    const github = makeGateway({ success: true })
    await validateForgeToken(github.gateway, "github", "https://github.com", "tok")
    expect(github.calls[0]).toEqual({
      command: "validate_github_token",
      payload: { serverUrl: "https://github.com", token: "tok" },
    })

    const gitlab = makeGateway({ success: true })
    await validateForgeToken(gitlab.gateway, "gitlab", "https://gitlab.com", "tok")
    expect(gitlab.calls[0].command).toBe("validate_gitlab_token")
  })

  /** 外层 param 是 camelCase（`settings`），里面的 DTO 是 snake_case。 */
  it("nests snake_case accounts under a camelCase settings key", async () => {
    const { gateway, calls } = makeGateway({ accounts: [] })
    await saveForgeAccounts(gateway, [ACCOUNT])
    expect(calls[0].command).toBe("update_github_accounts")
    expect(calls[0].payload.settings.accounts[0]).toEqual({
      id: "github-github.com-1",
      server_url: "https://github.com",
      username: "octocat",
      scopes: ["repo"],
      avatar_url: "https://example.com/a.png",
      is_default: true,
      created_at: "2026-09-01T00:00:00Z",
      provider: "github",
    })
  })

  /**
   * `provider: null` 是「迁移前存下来的账号，服务这台主机的任何 forge」。写回时把
   * 整个字段省掉，与 Rust 的 `skip_serializing_if = "Option::is_none"` 对齐 ——
   * 显式送 null 会被 serde 读成 `Some(null)` 之外的东西吗？不会，但把一个从未存在
   * 过的字段写进 blob 会让下一个读者以为它有含义。
   */
  it("omits a null provider rather than writing it out", async () => {
    const { gateway, calls } = makeGateway({ accounts: [] })
    await saveForgeAccounts(gateway, [{ ...ACCOUNT, provider: null }])
    expect(calls[0].payload.settings.accounts[0]).not.toHaveProperty("provider")
  })

  it("passes the token through the keyring commands by account id", async () => {
    const save = makeGateway(null)
    await saveForgeAccountToken(save.gateway, "acc-1", "tok")
    expect(save.calls[0]).toEqual({
      command: "save_account_token",
      payload: { accountId: "acc-1", token: "tok" },
    })

    const remove = makeGateway(null)
    await deleteForgeAccountToken(remove.gateway, "acc-1")
    expect(remove.calls[0]).toEqual({
      command: "delete_account_token",
      payload: { accountId: "acc-1" },
    })
  })

  /** 存不存 token 只看返回的字符串有没有内容 —— 空串与 null 都是「没有」。 */
  it("reports whether a token is stored without leaking it", async () => {
    await expect(hasForgeAccountToken(makeGateway("tok").gateway, "a")).resolves.toBe(true)
    await expect(hasForgeAccountToken(makeGateway("").gateway, "a")).resolves.toBe(false)
    await expect(hasForgeAccountToken(makeGateway(null).gateway, "a")).resolves.toBe(false)
  })

  it("reads and writes the git settings", async () => {
    const read = makeGateway({ custom_path: "/usr/bin/git" })
    await expect(getGitSettings(read.gateway)).resolves.toEqual({ custom_path: "/usr/bin/git" })

    const write = makeGateway({ custom_path: null })
    await setGitSettings(write.gateway, "  /opt/git  ")
    expect(write.calls[0]).toEqual({
      command: "update_git_settings",
      payload: { settings: { custom_path: "/opt/git" } },
    })
  })

  /** 空串是「清掉自定义路径，回去用 PATH 里的那个」，要送 null 而不是 `""`。 */
  it("clears a custom git path with null rather than an empty string", async () => {
    const { gateway, calls } = makeGateway({ custom_path: null })
    await setGitSettings(gateway, "   ")
    expect(calls[0].payload.settings.custom_path).toBeNull()
  })

  it("detects git with an empty payload", async () => {
    const { gateway, calls } = makeGateway({ installed: true, version: "2.44.0", path: "/git" })
    await expect(detectGit(gateway)).resolves.toEqual({
      installed: true,
      version: "2.44.0",
      path: "/git",
    })
    expect(calls[0]).toEqual({ command: "detect_git", payload: {} })
  })
})

describe("normalizeForgeAccount", () => {
  it("carries every field the row renders", () => {
    expect(normalizeForgeAccount(ACCOUNT)).toEqual(ACCOUNT)
  })

  /** id 是主键也是任务钉住的身份；server_url 是「这份凭据属于哪台主机」的唯一答案。 */
  it("drops a row missing either load-bearing field", () => {
    expect(normalizeForgeAccount({ server_url: "https://github.com" })).toBeNull()
    expect(normalizeForgeAccount({ id: "a" })).toBeNull()
    expect(normalizeForgeAccount(null)).toBeNull()
  })

  /**
   * `provider` 缺失**保留 null**，不要补 github：null 的含义是「这台主机的凭据，
   * 主机是哪种 forge 就是哪种」，写死成 github 会让一个 GitLab 自建实例上的老账号
   * 突然不再服务它自己的主机。
   */
  it("keeps a missing provider null instead of guessing github", () => {
    expect(normalizeForgeAccount({ id: "a", server_url: "https://x.com" })?.provider).toBeNull()
    expect(
      normalizeForgeAccount({ id: "a", server_url: "https://x.com", provider: "bitbucket" })
        ?.provider
    ).toBeNull()
  })

  it("drops blank scopes", () => {
    expect(
      normalizeForgeAccount({ id: "a", server_url: "https://x.com", scopes: ["repo", "", 3] })
        ?.scopes
    ).toEqual(["repo"])
  })
})

describe("normalizeAccountsSettings", () => {
  it("tolerates a bare array and drops unusable rows", () => {
    const settings = normalizeAccountsSettings([ACCOUNT, { id: "" }, null])
    expect(settings.accounts).toHaveLength(1)
  })

  it("returns an empty list rather than throwing on junk", () => {
    expect(normalizeAccountsSettings(null)).toEqual({ accounts: [] })
    expect(normalizeAccountsSettings("nope")).toEqual({ accounts: [] })
  })
})

describe("normalizeTokenValidation", () => {
  it("reads a successful validation", () => {
    expect(
      normalizeTokenValidation({
        success: true,
        username: "octocat",
        scopes: ["repo"],
        avatar_url: "https://example.com/a.png",
        message: null,
      })
    ).toEqual({
      success: true,
      username: "octocat",
      scopes: ["repo"],
      avatar_url: "https://example.com/a.png",
      message: null,
    })
  })

  /**
   * 空 scope 列表**不是**「没有权限」而是「forge 没说」（GitHub 的细粒度 token 完全
   * 不报 scope）。所以它必须能成功返回一个空列表而不被当成失败。
   */
  it("accepts a success with no reported scopes", () => {
    const result = normalizeTokenValidation({ success: true, username: "a", scopes: [] })
    expect(result.success).toBe(true)
    expect(result.scopes).toEqual([])
  })

  it("keeps the failure message", () => {
    expect(normalizeTokenValidation({ success: false, message: "Bad credentials" })).toMatchObject({
      success: false,
      message: "Bad credentials",
    })
  })

  it("treats a junk response as a failure rather than throwing", () => {
    expect(normalizeTokenValidation(null).success).toBe(false)
  })
})
