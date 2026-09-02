import { extractAppCommandError } from "@/services/gateway/commandError"
import { toErrorMessage } from "@/services/gateway/error"

/**
 * forge 失败的分类。**纯模块**（除了 `toErrorMessage`，那个也不碰 uni）。
 *
 * 三个 key 逐字照抄 Rust 常量（`codeg-plus/src-tauri/src/forge/mod.rs`
 * 的 `NO_ACCOUNT_I18N_KEY` / `UNSUPPORTED_HOST_I18N_KEY` / `WRONG_FORGE_I18N_KEY`）。
 * 服务端只给**用户能对此做点什么**的失败带 key，所以 key 的存在本身就是「这里有
 * 恢复动作」的信号。
 *
 * 未知 key 一律 `generic` —— 不做白名单外的猜测：一个我们不认识的 key 意味着服务端
 * 比这个客户端新，此时按普通错误显示原文比猜一个恢复动作安全。
 */

/** 后端为 forge 定义的三个 i18n key。 */
export const FORGE_NO_ACCOUNT_KEY = "Forge.errors.noAccount"
export const FORGE_UNSUPPORTED_HOST_KEY = "Forge.errors.unsupportedHost"
export const FORGE_WRONG_FORGE_KEY = "Forge.errors.wrongForge"

export type ForgeErrorKind = "noAccount" | "unsupportedHost" | "wrongForge" | "generic"

export interface ForgeErrorInfo {
  kind: ForgeErrorKind
  /** 来自 `i18n_params.host`。空串 = 服务端没给（此时文案要退化成不点名主机的说法）。 */
  host: string
  /** 来自 `i18n_params.provider`，服务端给的是显示名（`GitHub` / `GitLab`）。 */
  provider: string
  /** 面向用户的一句话。`generic` 分支直接用它，其余三种由 UI 换成自己的文案。 */
  message: string
}

export function classifyForgeError(error: unknown): ForgeErrorInfo {
  const app = extractAppCommandError(error)
  // 有结构时用 `app.message`：`toErrorMessage` 返回的是网关拼过的
  // `"forge_list_issues: …"`，那个命令名对用户没有意义，而状态卡上就这一句话。
  // 没有结构时只能退回它（那是唯一还剩的信息）。
  const message = app?.detail || app?.message || toErrorMessage(error)
  const host = app?.i18n_params?.host || ""
  const provider = app?.i18n_params?.provider || ""
  const kind = kindForKey(app?.i18n_key)
  return { kind, host, provider, message }
}

function kindForKey(key: string | null | undefined): ForgeErrorKind {
  switch (key) {
    case FORGE_NO_ACCOUNT_KEY:
      return "noAccount"
    case FORGE_UNSUPPORTED_HOST_KEY:
      return "unsupportedHost"
    case FORGE_WRONG_FORGE_KEY:
      return "wrongForge"
    default:
      return "generic"
  }
}

/**
 * 这个失败有没有「去添加账号」这条出路。
 *
 * `noAccount` 与 `unsupportedHost` 都有 —— 后者看起来像绝路，但自建的 GitHub
 * Enterprise / GitLab 实例正是**靠添加一个账号来声明自己是哪种 forge** 的
 * （后端的 `host_profile` 就是从已配置的账号推导 provider）。
 *
 * `wrongForge` 没有：那不是用户的问题，后端已经自行纠正了。
 */
export function forgeErrorWantsAccount(kind: ForgeErrorKind): boolean {
  return kind === "noAccount" || kind === "unsupportedHost"
}

/**
 * 这个失败该不该**静默重试一次**。
 *
 * 只有 `wrongForge`：后端返回它时已经把这个 host 的 forge 归类改正了，把它显示给
 * 用户等于把自家的记账问题当成用户的问题。重试**只做一次**（调用方用一个
 * `Set<folderId>` 记住），第二次同样的 key 就摊开 —— 后端不会对同一个 host 报两次，
 * 所以第二次一定是别的问题。
 */
export function forgeErrorWantsRetry(kind: ForgeErrorKind): boolean {
  return kind === "wrongForge"
}

/** 状态卡的标题。 */
export function forgeErrorTitle(info: ForgeErrorInfo): string {
  switch (info.kind) {
    case "noAccount":
      return "没有可用的账号"
    case "unsupportedHost":
      return "暂不支持这个代码托管平台"
    default:
      return "加载失败"
  }
}

/**
 * 状态卡的正文。
 *
 * 三个 key 的文案都要**点名主机**（用户可能有好几个 forge 账号，不说清是哪个域名
 * 缺账号，他会去看错的那一个）。host 缺失时退化成不点名的说法，而不是印一个空的
 * 引号。
 */
export function forgeErrorText(info: ForgeErrorInfo): string {
  const hostLabel = info.host || "这个域名"
  switch (info.kind) {
    case "noAccount":
      return info.provider
        ? `还没有为 ${hostLabel} 配置 ${info.provider} 账号。添加一个之后即可读取这个仓库。`
        : `还没有为 ${hostLabel} 配置账号。添加一个之后即可读取这个仓库。`
    case "unsupportedHost":
      return `仓库面板目前只支持 GitHub 与 GitLab，而 ${hostLabel} 看起来不是其中任何一种。如果它是自建的 GitHub Enterprise 或 GitLab 实例，为这个域名添加一个账号即可识别。`
    default:
      return info.message
  }
}

/** 状态卡上那颗按钮的文字。`null` = 这种失败没有明确的下一步（只给重试）。 */
export function forgeErrorAction(kind: ForgeErrorKind): string | null {
  return forgeErrorWantsAccount(kind) ? "添加账号" : null
}
