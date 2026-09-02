import type { ConnectionContext } from "@/services/connectionContext"
import type { ForgeItemKind, ForgeProviderId } from "@/types/forge"

/**
 * 仓库面板三个页面的路由构造 / 解析。
 *
 * 按仓库约定，**路由构造器住在 services 层**（同 `services/taskDetail.ts`、
 * `services/projectGit.ts`），页面只负责调用 —— 这样「某个页面要哪几个参数」
 * 只有一处定义，改参数不会漏掉某个入口。
 *
 * 为什么每条路由都带连接：forge 命令是**按连接**打的（每台 codeg 各自连着自己的
 * 那些仓库），单独一个 folderId 无法定位。两种口径都传，与既有 git 页一致：
 * `connectionId` 是首选（短），`connection`（整个 context JSON urlencode）是兜底
 * —— 后者用于连接记录还没落到存储里的场合。
 */

export interface ForgeRouteParams {
  connectionId: string
  /** 整个连接上下文的 JSON（urlencode 前的原文），可选兜底。 */
  connection?: string | null
  /** 0 = 让页面自己决定（存储 → 第一个项目）。 */
  folderId?: number
}

export interface ForgeRouteContext {
  connectionId: string
  connection: string
  folderId: number
}

export function buildForgeRoute(params: ForgeRouteParams): string {
  const query = [
    `connectionId=${encodeURIComponent(params.connectionId || "")}`,
    `folderId=${Number(params.folderId || 0) || 0}`,
  ]
  if (params.connection) {
    query.push(`connection=${encodeURIComponent(params.connection)}`)
  }
  return `/pages/forge/index?${query.join("&")}`
}

export function parseForgeRouteOptions(
  options: Record<string, unknown> | undefined
): ForgeRouteContext {
  return {
    connectionId: decodeURIComponent(String(options?.connectionId || "").trim()),
    connection: String(options?.connection || ""),
    folderId: Number(options?.folderId || 0) || 0,
  }
}

export interface ForgeItemRouteParams {
  connectionId: string
  connection?: string | null
  folderId: number
  kind: ForgeItemKind
  number: number
}

export interface ForgeItemRouteContext extends ForgeRouteContext {
  kind: ForgeItemKind
  number: number
}

/**
 * 条目详情页。
 *
 * 路由里**只带坐标**（kind + number），不带标题正文 —— issue body 上限 16000
 * 字符，塞进 URL 会超长且在各端行为不一致。首屏内容走 `forgeRowInbox` 的 seed，
 * seed 缺失（冷启动直达）时详情页自己重新拉一次列表窄查询。
 */
export function buildForgeItemRoute(params: ForgeItemRouteParams): string {
  const query = [
    `connectionId=${encodeURIComponent(params.connectionId || "")}`,
    `folderId=${Number(params.folderId || 0) || 0}`,
    `kind=${params.kind}`,
    `number=${Number(params.number || 0) || 0}`,
  ]
  if (params.connection) {
    query.push(`connection=${encodeURIComponent(params.connection)}`)
  }
  return `/pages/forge-item/index?${query.join("&")}`
}

export function parseForgeItemRouteOptions(
  options: Record<string, unknown> | undefined
): ForgeItemRouteContext {
  const base = parseForgeRouteOptions(options)
  return {
    ...base,
    kind: String(options?.kind || "") === "pr" ? "pr" : "issue",
    number: Number(options?.number || 0) || 0,
  }
}

export interface ForgeAccountsRouteParams {
  connectionId: string
  connection?: string | null
  /**
   * 预填的主机名。**从错误里来**（`i18n_params.host`）或从 `ForgeRemote.server_host`
   * 来 —— 用户是因为「这个 host 没有账号」被送过来的，让他再手打一遍主机名
   * 是把一个已知答案伪装成一道题。
   */
  serverHost?: string | null
  /** 预选的 forge 种类，同样来自错误或远端探测，客户端从不自己猜。 */
  provider?: ForgeProviderId | null
}

export interface ForgeAccountsRouteContext {
  connectionId: string
  connection: string
  serverHost: string
  provider: ForgeProviderId | ""
}

export function buildForgeAccountsRoute(params: ForgeAccountsRouteParams): string {
  const query = [`connectionId=${encodeURIComponent(params.connectionId || "")}`]
  if (params.connection) {
    query.push(`connection=${encodeURIComponent(params.connection)}`)
  }
  if (params.serverHost) {
    query.push(`serverHost=${encodeURIComponent(params.serverHost)}`)
  }
  if (params.provider) {
    query.push(`provider=${params.provider}`)
  }
  return `/pages/forge-accounts/index?${query.join("&")}`
}

export function parseForgeAccountsRouteOptions(
  options: Record<string, unknown> | undefined
): ForgeAccountsRouteContext {
  const provider = String(options?.provider || "").trim()
  return {
    connectionId: decodeURIComponent(String(options?.connectionId || "").trim()),
    connection: String(options?.connection || ""),
    serverHost: decodeURIComponent(String(options?.serverHost || "").trim()),
    provider: provider === "github" || provider === "gitlab" ? provider : "",
  }
}

/**
 * 仓库面板是否可用于这条连接。
 *
 * `forge_*` 与 `work_task_*` 一样是 **codeg-plus 独有**的命令族：opencode 与
 * mcode-desktop 的服务端都没有这些路由，对它们发请求会拿到 404。判据与
 * `services/taskDetail.isTaskCapableConnection` 逐字相同（而不是
 * `projectDetail.isWorkspaceCapableConnection` 那个把 opencode 也放行的宽判据
 * —— 本地 Git 是另一套，forge 走的是 forge REST API）。
 */
export function isForgeCapableConnection(
  connection: Partial<ConnectionContext> | null | undefined
): boolean {
  if (!connection) return false
  const targetAgent = String(
    (connection as any)?.targetProfile?.targetAgent ||
      (connection as any)?.targetAgent ||
      (connection as any)?.gatewaySession?.targetAgent ||
      ""
  ).trim()
  // 空值放行：老连接记录可能没有 targetAgent，此时按历史默认（codeg）处理，
  // 让请求自己去报错，而不是凭一个缺失字段把功能藏起来。
  if (!targetAgent) return true
  return targetAgent === "codeg"
}

export function forgeUnsupportedText(
  connection: Partial<ConnectionContext> | null | undefined
): string {
  if (isForgeCapableConnection(connection)) return ""
  return "当前连接暂不支持仓库面板，请使用 codeg 连接。"
}
