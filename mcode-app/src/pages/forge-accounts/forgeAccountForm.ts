/**
 * 账号表单的纯逻辑：主机名归一化、provider 推断、账号 id 生成、按主机分组。
 *
 * **纯模块** —— 不 import uni / pinia / 组件，可以裸测。
 */

/** token 弹层校验 / 提交时交出来的东西。token 只在这一刻存在，不进任何持久结构。 */
export interface ForgeTokenSubmitPayload {
  serverUrl: string
  provider: "github" | "gitlab"
  token: string
  isDefault: boolean
}

/** 校验请求（比提交少一个 `isDefault` —— 校验不关心默认账号）。 */
export type ForgeTokenValidatePayload = Omit<ForgeTokenSubmitPayload, "isDefault">

/** 从一个用户输入的服务器地址推出规范的 `https://host` 形式。 */
export function normalizeForgeServerUrl(input: string): string {
  const raw = String(input || "").trim()
  if (!raw) return ""
  // 用户会直接打主机名（`github.com`）。补上 scheme 而不是拒绝 —— 这是最常见的输入。
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const url = new URL(withScheme)
    if (!url.hostname) return ""
    // 端口要留（自建实例可能跑在非标端口上），路径不留 —— 后端的 host_profile 按
    // 主机匹配，一个带路径的 server_url 会让它永远匹配不上 git 远端解析出来的 host。
    const port = url.port ? `:${url.port}` : ""
    return `${url.protocol}//${url.hostname.toLowerCase()}${port}`
  } catch {
    return ""
  }
}

/** `server_url` → 主机名，与 forge 的 source key / git 远端共用同一个坐标。 */
export function forgeServerHost(serverUrl: string): string {
  const normalized = normalizeForgeServerUrl(serverUrl)
  if (!normalized) return ""
  try {
    return new URL(normalized).hostname.toLowerCase()
  } catch {
    return ""
  }
}

/**
 * 从主机名**猜**一个 provider，只用于新增账号时的表单预选。
 *
 * 这与「客户端永不选 provider」并不矛盾：那条规则说的是**发请求时**不能自己猜
 * （那等于选一份凭据）。而这里是在**创建**一份凭据 —— 用户必须说明这个 token 是给
 * 哪个 API 的，一个自建实例的主机名什么都看不出来，所以只能猜一个默认值让他改。
 */
export function guessForgeProvider(serverUrl: string): "github" | "gitlab" {
  const host = forgeServerHost(serverUrl)
  if (!host) return "github"
  if (host === "gitlab.com" || host.startsWith("gitlab.") || host.includes(".gitlab.")) {
    return "gitlab"
  }
  return "github"
}

/**
 * 新账号的 id。
 *
 * 形如 `github-github.com-1764...`：带主机是为了让存储里的行肉眼可读（调试一个
 * 「哪个账号缺 token」的问题时这很值），带时间戳是为了唯一。
 *
 * **一旦生成就不能变** —— 每个 forge 触发的任务都把它钉在 `source_meta.account_id`
 * 上，换 token 时重新生成会让那些任务失去可交付的身份。
 */
export function buildForgeAccountId(
  provider: "github" | "gitlab",
  serverUrl: string,
  now = Date.now()
): string {
  const host = forgeServerHost(serverUrl) || "unknown"
  return `${provider}-${host}-${now}`
}

/**
 * 这份新账号会不会和已有的撞车。
 *
 * 判据是 `(host, provider)` 而不是 `server_url` —— 后端 `resolve_forge_auth` 就是按
 * 这两个维度挑账号的：同一台主机上可以同时有 GitHub 与 GitLab 的凭据（自建实例
 * 迁移期间真的会这样），但同一个组合有两份就只有一份会被用到，另一份是死数据。
 */
export function findConflictingAccount<
  T extends { id: string; server_url: string; provider: string | null },
>(accounts: T[], serverUrl: string, provider: "github" | "gitlab", excludeId = ""): T | null {
  const host = forgeServerHost(serverUrl)
  if (!host) return null
  return (
    accounts.find(
      (account) =>
        account.id !== excludeId &&
        forgeServerHost(account.server_url) === host &&
        // provider 为 null 的老账号服务任何 forge，所以它和任何 provider 都算撞车。
        (account.provider === null || account.provider === provider)
    ) || null
  )
}

/**
 * 把一个账号设成默认，同时把**同一主机上**其他账号的默认标记摘掉。
 *
 * 只在同主机内互斥 —— `is_default` 的语义是「这台主机的默认账号」，跨主机清掉
 * 会让另一个 forge 上的默认账号莫名失效。
 */
export function applyDefaultForgeAccount<
  T extends { id: string; server_url: string; is_default: boolean },
>(accounts: T[], accountId: string): T[] {
  const target = accounts.find((account) => account.id === accountId)
  if (!target) return accounts
  const host = forgeServerHost(target.server_url)
  return accounts.map((account) => {
    if (account.id === accountId) return { ...account, is_default: true }
    if (forgeServerHost(account.server_url) !== host) return account
    return account.is_default ? { ...account, is_default: false } : account
  })
}

/**
 * 删掉一个账号后，如果它是那台主机的默认且主机上还有别的账号，把默认让给第一个。
 *
 * 不做这件事的后果：那台主机没有默认账号，`resolve_forge_auth` 会退到「第一个匹配」
 * —— 行为上能用，但 UI 上没有任何一行显示为默认，用户看不出接下来会用哪个。
 */
export function removeForgeAccount<
  T extends { id: string; server_url: string; is_default: boolean },
>(accounts: T[], accountId: string): T[] {
  const target = accounts.find((account) => account.id === accountId)
  if (!target) return accounts
  const remaining = accounts.filter((account) => account.id !== accountId)
  if (!target.is_default) return remaining
  const host = forgeServerHost(target.server_url)
  const heir = remaining.find((account) => forgeServerHost(account.server_url) === host)
  if (!heir) return remaining
  return remaining.map((account) =>
    account.id === heir.id ? { ...account, is_default: true } : account
  )
}

/** provider 的显示名。 */
export function forgeProviderLabel(provider: string | null): string {
  if (provider === "gitlab") return "GitLab"
  if (provider === "github") return "GitHub"
  // null = 迁移前存下来的账号，含义是「这台主机的凭据」。说出来而不是印一个空白。
  return "未指定"
}

/**
 * scope 摘要。
 *
 * 空列表**不是**「没有权限」而是「forge 没说」（GitHub 的细粒度 token 完全不报
 * scope）。说错这一点会让用户去重新生成一个本来好用的 token。
 */
export function forgeScopeSummary(scopes: string[]): string {
  if (scopes.length === 0) return "未报告权限范围"
  return scopes.join(" · ")
}
