import { GatewayCommandError } from "@/services/gateway/commandError"
import {
  classifyForgeError,
  FORGE_NO_ACCOUNT_KEY,
  FORGE_UNSUPPORTED_HOST_KEY,
  FORGE_WRONG_FORGE_KEY,
  forgeErrorAction,
  forgeErrorText,
  forgeErrorTitle,
  forgeErrorWantsAccount,
  forgeErrorWantsRetry,
} from "@/services/forge/forgeErrors"

function errorWith(key: string | null, params: Record<string, string> | null = null) {
  return new GatewayCommandError({
    command: "forge_list_issues",
    statusCode: 422,
    message: "forge_list_issues: something went wrong",
    body: {
      code: "configuration_missing",
      message: "something went wrong",
      i18n_key: key,
      i18n_params: params,
    },
  })
}

describe("i18n keys", () => {
  /**
   * 逐字照抄 Rust 常量（`forge/mod.rs` 的 `NO_ACCOUNT_I18N_KEY` 等）。差一个字符就
   * 会静默落到 `generic` 分支 —— 不报错，只是恢复动作消失了。
   */
  it("mirrors the backend constants exactly", () => {
    expect(FORGE_NO_ACCOUNT_KEY).toBe("Forge.errors.noAccount")
    expect(FORGE_UNSUPPORTED_HOST_KEY).toBe("Forge.errors.unsupportedHost")
    expect(FORGE_WRONG_FORGE_KEY).toBe("Forge.errors.wrongForge")
  })
})

describe("classifyForgeError", () => {
  it("recognizes all three recoverable failures", () => {
    expect(classifyForgeError(errorWith(FORGE_NO_ACCOUNT_KEY)).kind).toBe("noAccount")
    expect(classifyForgeError(errorWith(FORGE_UNSUPPORTED_HOST_KEY)).kind).toBe("unsupportedHost")
    expect(classifyForgeError(errorWith(FORGE_WRONG_FORGE_KEY)).kind).toBe("wrongForge")
  })

  it("pulls the host and provider out of the i18n params", () => {
    const info = classifyForgeError(
      errorWith(FORGE_NO_ACCOUNT_KEY, { host: "ghe.corp.com", provider: "GitHub" })
    )
    expect(info.host).toBe("ghe.corp.com")
    expect(info.provider).toBe("GitHub")
  })

  /**
   * 未知 key **不猜** —— 一个我们不认识的 key 意味着服务端比这个客户端新，此时按
   * 普通错误显示原文比猜一个恢复动作安全（猜错的方向是给用户一颗解决不了问题的按钮）。
   */
  it("treats an unrecognized key as a plain failure", () => {
    expect(classifyForgeError(errorWith("Forge.errors.somethingNew")).kind).toBe("generic")
    expect(classifyForgeError(errorWith(null)).kind).toBe("generic")
  })

  /** 完全不是网关错误时也要能分类（网络异常、代码里的 TypeError）。 */
  it("survives an error with no structure at all", () => {
    const info = classifyForgeError(new Error("forge_list_issues: 网络异常"))
    expect(info.kind).toBe("generic")
    // 没有结构时只能退回 `toErrorMessage`，它保留网关拼上的命令名前缀 ——
    // 与仓库里其它页面显示的形状一致。
    expect(info.message).toBe("forge_list_issues: 网络异常")
    expect(info.host).toBe("")
  })

  /**
   * 有结构时用服务端自己那句话，**不带命令名前缀** —— `forge_list_issues:` 对用户
   * 没有意义，而状态卡上就这一句。
   */
  it("prefers the server's own sentence over the prefixed string", () => {
    const info = classifyForgeError(errorWith(null))
    expect(info.message).toBe("something went wrong")
  })

  /** `detail` 比 `message` 具体（服务端把根因放在那里），有就优先。 */
  it("prefers detail when the server gave one", () => {
    const error = new GatewayCommandError({
      command: "forge_list_issues",
      statusCode: 422,
      message: "forge_list_issues: request failed",
      body: { code: "c", message: "request failed", detail: "token expired at 2026-09-01" },
    })
    expect(classifyForgeError(error).message).toBe("token expired at 2026-09-01")
  })
})

describe("recovery routing", () => {
  /**
   * `unsupportedHost` 看起来像绝路，但自建的 GitHub Enterprise / GitLab 实例正是
   * **靠添加一个账号来声明自己是哪种 forge** 的（后端的 host_profile 从已配置的账号
   * 推导 provider）。所以它也要给「添加账号」。
   */
  it("offers the accounts page for both account-shaped failures", () => {
    expect(forgeErrorWantsAccount("noAccount")).toBe(true)
    expect(forgeErrorWantsAccount("unsupportedHost")).toBe(true)
    expect(forgeErrorAction("noAccount")).toBe("添加账号")
    expect(forgeErrorAction("unsupportedHost")).toBe("添加账号")
  })

  /** `wrongForge` 不是用户的问题 —— 后端已经自行纠正，把它摊出来只会让人困惑。 */
  it("does not send the user anywhere for a self-correcting failure", () => {
    expect(forgeErrorWantsAccount("wrongForge")).toBe(false)
    expect(forgeErrorAction("wrongForge")).toBeNull()
    expect(forgeErrorWantsRetry("wrongForge")).toBe(true)
  })

  /** 只有 wrongForge 值得静默重试；别的重试只会得到同一个错误。 */
  it("only retries the one failure a retry can fix", () => {
    expect(forgeErrorWantsRetry("noAccount")).toBe(false)
    expect(forgeErrorWantsRetry("unsupportedHost")).toBe(false)
    expect(forgeErrorWantsRetry("generic")).toBe(false)
  })

  it("gives no account action for a plain failure", () => {
    expect(forgeErrorAction("generic")).toBeNull()
  })
})

describe("copy", () => {
  /**
   * 文案要**点名主机**：用户可能有好几个 forge 账号，不说清是哪个域名缺账号，
   * 他会去看错的那一个。
   */
  it("names the host it is talking about", () => {
    const info = classifyForgeError(
      errorWith(FORGE_NO_ACCOUNT_KEY, { host: "ghe.corp.com", provider: "GitLab" })
    )
    expect(forgeErrorText(info)).toContain("ghe.corp.com")
    expect(forgeErrorText(info)).toContain("GitLab")
  })

  /** host 缺失时退化成不点名的说法，而不是印一个空引号。 */
  it("degrades gracefully without a host", () => {
    const info = classifyForgeError(errorWith(FORGE_NO_ACCOUNT_KEY))
    const text = forgeErrorText(info)
    expect(text).toContain("这个域名")
    expect(text).not.toContain("undefined")
    expect(text).not.toContain("  ")
  })

  /** 自建实例的出路必须写在 unsupportedHost 的文案里 —— 否则用户会以为这条路走不通。 */
  it("tells a self-hosted user how to make the host recognized", () => {
    const info = classifyForgeError(
      errorWith(FORGE_UNSUPPORTED_HOST_KEY, { host: "git.corp.com" })
    )
    expect(forgeErrorText(info)).toContain("自建")
    expect(forgeErrorText(info)).toContain("添加一个账号")
  })

  /** generic 分支直接用服务端那句话 —— 那是唯一还剩的信息。 */
  it("falls back to the raw message for an unclassified failure", () => {
    const info = classifyForgeError(errorWith(null))
    expect(forgeErrorText(info)).toBe("something went wrong")
    expect(forgeErrorTitle(info)).toBe("加载失败")
  })

  it("gives each recoverable failure its own title", () => {
    const titles = [FORGE_NO_ACCOUNT_KEY, FORGE_UNSUPPORTED_HOST_KEY].map((key) =>
      forgeErrorTitle(classifyForgeError(errorWith(key)))
    )
    expect(new Set(titles).size).toBe(2)
  })
})
