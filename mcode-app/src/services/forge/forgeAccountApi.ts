import type { CodegGateway } from "@/services/gateway"
import type {
  GitDetectResult,
  GitHubAccount,
  GitHubAccountsSettings,
  GitHubTokenValidation,
  GitSettings,
} from "@/types/forgeAccount"

/**
 * codeg 版本控制设置（forge 账号 / token / git 路径）命令的**唯一**封装层。
 *
 * 与 `forgeApi.ts` 分开是因为这是另一套后端面（`commands/version_control.rs`），
 * forge 只是它的消费者：`forge/auth.rs` 读的就是这里写的同一个 `github_accounts`
 * blob，并按 `(server_host, provider)` 挑账号。
 *
 * **命名**：handler 外层 param 是 camelCase（`serverUrl` / `accountId` / `settings`），
 * 而 `settings` 内部的 DTO 是 **snake_case**（`server_url` / `is_default`）。
 *
 * ## token 的存法（两步，顺序不能颠倒）
 *
 * `update_github_accounts` 写的是账号**元信息**，token 走独立的
 * `save_account_token`（进桌面端 keyring 或加固的 tokens.json）。所以新增一个账号是
 * 两次调用，且必须**先存 token 再写 accounts**：反过来的话，中间失败会留下一个
 * 有身份、没凭据的账号行 —— 而 forge 会挑中它然后以 401 失败，用户看到的是「token
 * 无效」而不是「保存没成功」。
 */

/* ===== 读 ===== */

/** 全部已配置的 forge 账号。 */
export async function listForgeAccounts(
  gateway: CodegGateway
): Promise<GitHubAccountsSettings> {
  const raw = await gateway.call<unknown>("get_github_accounts", {})
  return normalizeAccountsSettings(raw)
}

/** git 可执行文件设置。 */
export async function getGitSettings(gateway: CodegGateway): Promise<GitSettings> {
  const raw = await gateway.call<unknown>("get_git_settings", {})
  const record = normalizeRecord(raw)
  return { custom_path: pickString(record?.custom_path, record?.customPath) || null }
}

/** 桌面端能不能找到 git。 */
export async function detectGit(gateway: CodegGateway): Promise<GitDetectResult> {
  const raw = await gateway.call<unknown>("detect_git", {})
  return normalizeDetectResult(raw)
}

/** 某个账号是否已经有 token 存着（换 token 界面靠这个区分「录入」与「替换」）。 */
export async function hasForgeAccountToken(
  gateway: CodegGateway,
  accountId: string
): Promise<boolean> {
  const raw = await gateway.call<unknown>("get_account_token", { accountId })
  return typeof raw === "string" && raw.trim().length > 0
}

/* ===== 写 ===== */

/**
 * 校验一个 token 并拿回它的身份。
 *
 * 两个 forge 各有一个命令但**请求形状相同**：GitLab 用 personal access token
 * （没有 `gh auth token` 可以借），且它在另一个端点报 scope。
 *
 * 这一步是**必须的**而不是体贴：账号行里的 username / avatar / scopes 全部来自这里，
 * 没有它就只能让用户自己填一个可能拼错的用户名，而那个名字会被当成 git 推送时的
 * 凭据用户名。
 */
export async function validateForgeToken(
  gateway: CodegGateway,
  provider: "github" | "gitlab",
  serverUrl: string,
  token: string
): Promise<GitHubTokenValidation> {
  const command = provider === "gitlab" ? "validate_gitlab_token" : "validate_github_token"
  const raw = await gateway.call<unknown>(command, { serverUrl, token })
  return normalizeTokenValidation(raw)
}

/** 把 token 写进桌面端的凭据存储。**必须在 `saveForgeAccounts` 之前调用**（见文件头）。 */
export async function saveForgeAccountToken(
  gateway: CodegGateway,
  accountId: string,
  token: string
): Promise<void> {
  await gateway.call<void>("save_account_token", { accountId, token })
}

/** 删掉一个账号的 token。 */
export async function deleteForgeAccountToken(
  gateway: CodegGateway,
  accountId: string
): Promise<void> {
  await gateway.call<void>("delete_account_token", { accountId })
}

/**
 * 整份覆盖账号列表。
 *
 * 后端没有「改一个账号」的命令 —— 它存的是一整个 JSON blob，所以调用方必须先读、
 * 改、再整份写回。这也意味着**两个客户端同时改会互相覆盖**，但账号是低频操作，
 * 加一层版本号的代价大于收益。
 */
export async function saveForgeAccounts(
  gateway: CodegGateway,
  accounts: GitHubAccount[]
): Promise<GitHubAccountsSettings> {
  const raw = await gateway.call<unknown>("update_github_accounts", {
    // 外层 param 是 camelCase（`settings`），里面的 DTO 是 snake_case。
    settings: { accounts: accounts.map(serializeAccount) },
  })
  return normalizeAccountsSettings(raw)
}

/** 设置 git 可执行文件路径。空串 = 清掉自定义路径，回去用 PATH 里的那个。 */
export async function setGitSettings(
  gateway: CodegGateway,
  customPath: string | null
): Promise<GitSettings> {
  const raw = await gateway.call<unknown>("update_git_settings", {
    settings: { custom_path: customPath && customPath.trim() ? customPath.trim() : null },
  })
  const record = normalizeRecord(raw)
  return { custom_path: pickString(record?.custom_path, record?.customPath) || null }
}

/* ===== 归一化 ===== */

export function normalizeAccountsSettings(input: unknown): GitHubAccountsSettings {
  const record = normalizeRecord(input)
  const accounts = normalizeList(record?.accounts ?? input)
    .map(normalizeForgeAccount)
    .filter((item): item is GitHubAccount => Boolean(item))
  return { accounts }
}

/**
 * 一个账号。`id` 或 `server_url` 缺失即丢弃 —— 前者是每个动作的主键（也是任务钉住
 * 的那个身份），后者是「这份凭据属于哪台主机」的唯一答案，两个都没有替代品。
 */
export function normalizeForgeAccount(input: unknown): GitHubAccount | null {
  const raw = normalizeRecord(input)
  if (!raw) return null
  const id = pickString(raw.id)
  const serverUrl = pickString(raw.server_url, raw.serverUrl)
  if (!id || !serverUrl) return null
  const provider = pickString(raw.provider)
  return {
    id,
    server_url: serverUrl,
    username: pickString(raw.username),
    scopes: normalizeList(raw.scopes)
      .map((scope) => (typeof scope === "string" ? scope.trim() : ""))
      .filter(Boolean),
    avatar_url: pickString(raw.avatar_url, raw.avatarUrl) || null,
    is_default: Boolean(raw.is_default ?? raw.isDefault),
    created_at: pickString(raw.created_at, raw.createdAt),
    // **缺失保留 null**，不要补一个默认值：null 的含义是「这台主机的凭据，
    // 主机是哪种 forge 就是哪种」，写死成 github 会让一个 GitLab 自建实例上的
    // 老账号突然不再服务它自己的主机。
    provider: provider === "github" || provider === "gitlab" ? provider : null,
  }
}

/** 写回时把 null provider 整个字段省掉，与 Rust 的 `skip_serializing_if` 对齐。 */
function serializeAccount(account: GitHubAccount): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: account.id,
    server_url: account.server_url,
    username: account.username,
    scopes: account.scopes,
    avatar_url: account.avatar_url,
    is_default: account.is_default,
    created_at: account.created_at,
  }
  if (account.provider) payload.provider = account.provider
  return payload
}

export function normalizeTokenValidation(input: unknown): GitHubTokenValidation {
  const raw = normalizeRecord(input)
  return {
    success: Boolean(raw?.success),
    username: pickString(raw?.username) || null,
    scopes: normalizeList(raw?.scopes)
      .map((scope) => (typeof scope === "string" ? scope.trim() : ""))
      .filter(Boolean),
    avatar_url: pickString(raw?.avatar_url, raw?.avatarUrl) || null,
    message: pickString(raw?.message) || null,
  }
}

function normalizeDetectResult(input: unknown): GitDetectResult {
  const raw = normalizeRecord(input)
  return {
    installed: Boolean(raw?.installed),
    version: pickString(raw?.version) || null,
    path: pickString(raw?.path) || null,
  }
}

function normalizeList(input: unknown): any[] {
  if (Array.isArray(input)) return input
  if (input && typeof input === "object" && Array.isArray((input as any).data)) {
    return (input as any).data
  }
  return []
}

function normalizeRecord(input: unknown): Record<string, any> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  return input as Record<string, any>
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}
