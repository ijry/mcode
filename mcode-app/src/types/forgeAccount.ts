/**
 * codeg 版本控制设置（账号 / token / git 路径）的线上类型。
 *
 * 与 `types/forge.ts` 分开是因为它们是**另一套后端面**：这些命令住在
 * `commands/version_control.rs` / `web/handlers/version_control.rs`，而 forge 只是
 * 它们的消费者（`forge/auth.rs` 读的就是同一个 `github_accounts` blob）。
 *
 * 命名：这些响应与请求 DTO **都是 snake_case**（Rust 侧的 `models/system.rs` 没有
 * rename），只有 handler 外层的 param 是 camelCase（`serverUrl` / `accountId`）。
 *
 * **token 本身不在这些结构里** —— 它存在桌面端的 keyring（桌面）或加固的
 * `tokens.json`（服务器模式），只能通过 `save_account_token` / `get_account_token`
 * 单独存取。accounts blob 里只有身份与元信息。
 */

/** 一个已配置的 forge 账号。 */
export interface GitHubAccount {
  /**
   * 账号 id。**换 token 时必须保留** —— 每个 forge 触发的任务都把这个 id 钉在
   * `source_meta.account_id` 上，删了重加会让那些任务失去可交付的身份（推分支、
   * 建 PR、回写评论都会失败）。
   */
  id: string
  /** 完整的服务器地址（`https://github.com` / `https://ghe.corp.com`）。 */
  server_url: string
  username: string
  /**
   * token 录入时记录的 scope，**只作显示**。
   *
   * 不作为门禁：GitHub 的细粒度 token 完全不报 scope，按空列表拒绝会把好用的凭据
   * 挡在外面。一个做不了事的 token 会在 API 那里说出来。
   */
  scopes: string[]
  avatar_url: string | null
  /** 同一主机上有多个账号时的默认那个。 */
  is_default: boolean
  created_at: string
  /**
   * 这个账号登录的是哪种 forge。
   *
   * **可以缺失** —— 那是所有在 GitLab 支持出现之前存下来的账号的样子，含义仍然是
   * 「这台主机的一份凭据」（主机是哪种 forge 就是哪种）。有值时它还额外说明这个
   * token 是给哪个 API 的，这对一个主机名什么都看不出来的自建实例是唯一可靠的信号。
   */
  provider: "github" | "gitlab" | null
}

/** 整个账号 blob（`app_metadata` 的 `github_accounts` 键）。 */
export interface GitHubAccountsSettings {
  accounts: GitHubAccount[]
}

/** token 校验结果。 */
export interface GitHubTokenValidation {
  success: boolean
  username: string | null
  scopes: string[]
  avatar_url: string | null
  /** 失败原因（成功时通常为 null）。 */
  message: string | null
}

/** git 可执行文件设置。 */
export interface GitSettings {
  /** 自定义 git 路径，`null` = 用 PATH 里的那个。 */
  custom_path: string | null
}

/** `detect_git` / `test_git_path` 的结果。 */
export interface GitDetectResult {
  installed: boolean
  version: string | null
  path: string | null
}

/** 新增/编辑一个账号时表单持有的东西（token 只在提交那一刻存在，不进任何持久结构）。 */
export interface ForgeAccountDraft {
  /** 编辑既有账号时是它的 id，新增时是空串。 */
  id: string
  serverUrl: string
  provider: "github" | "gitlab"
  token: string
  isDefault: boolean
}
