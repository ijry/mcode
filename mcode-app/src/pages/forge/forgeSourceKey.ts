import type { ForgeItemKind, ForgeProviderId } from "@/types/forge"

/**
 * source key 的客户端镜像。**纯模块**。
 *
 * ## 为什么这个文件的规则不能自己发明
 *
 * `work_task_lookup_by_source` 是**精确字符串匹配**。key 由 Rust `forge::source_key()`
 * 在触发任务时写进 `work_task.source_key`，客户端只是构造候选 key 去匹配。差一个字符
 * 芯片就永远不亮 —— **而且不报错**，只是「这个 issue 看起来没人处理过」，于是被重复
 * 触发一次。
 *
 * 规范：`{provider}:{server_host}:{owner_repo}:{kind}:{number}`，全部小写。
 * 参考 `codeg-plus/src-tauri/src/forge/mod.rs` 的 `source_key` / `normalize_repo`。
 *
 * ## 两处必须逐字对齐
 *
 * 1. **`provider` 只能用 `folder_forge_remote` 返回的那个。** 它是后端从「已配置的
 *    账号 + 主机名」推导出来的，客户端**永远不选** —— 那个选择等于选一份凭据。从 host
 *    里看到 `github.com` 就填 `github`，在自建实例上必错。
 * 2. **`.git` 后缀是重复剥离的。** Rust 用 `trim_end_matches(".git")`，它会一直剥到没有
 *    为止；桌面端的 TS 镜像（`src/lib/forge-source-key.ts`）用 `.replace(/\.git$/i, "")`
 *    只剥一次。以**写 key 的那一方（Rust）**为准 —— 一个 `repo.git.git` 形式的远端
 *    （少见但存在，某些镜像工具会这么生成）在两边会算出不同的 key。
 */

/**
 * 小写 `owner/repo`（GitLab 是完整子组路径），`.git` 后缀与首尾斜杠剥掉。
 *
 * 顺序照抄 Rust：`trim` → 去首尾 `/` → **重复**去尾部 `.git` → 全小写。
 */
export function normalizeForgeRepo(input: string): string {
  return String(input || "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/(\.git)+$/i, "")
    .toLowerCase()
}

/**
 * 构造一条 source key。
 *
 * 坐标不合法时返回空串（而不是抛）—— 调用方是在为一屏可见行批量构造 key，一行的
 * 坐标坏掉不该让整批反查失败。空串由调用方过滤掉。
 */
export function buildForgeSourceKey(args: {
  provider: ForgeProviderId
  serverHost: string
  ownerRepo: string
  kind: ForgeItemKind
  number: number
}): string {
  const provider = String(args.provider || "").trim().toLowerCase()
  if (provider !== "github" && provider !== "gitlab") return ""
  const kind = String(args.kind || "").trim().toLowerCase()
  if (kind !== "issue" && kind !== "pr") return ""
  const host = String(args.serverHost || "").trim().toLowerCase()
  // 与 Rust 同一套拒绝条件：host 不能带 `/` 或 `:`（后者会把端口混进坐标系，
  // 而 git 远端解析出来的 host 从不带端口）。
  if (!host || host.includes("/") || host.includes(":")) return ""
  const repo = normalizeForgeRepo(args.ownerRepo)
  // repo 必须是 `owner/name` 形状，且每段只含字母数字与 `-_.`（客户端供的值会进
  // 请求路径，这一条同时是注入卫生）。
  if (!repo.includes("/")) return ""
  const segmentsOk = repo
    .split("/")
    .every((segment) => segment.length > 0 && /^[a-z0-9\-_.]+$/.test(segment))
  if (!segmentsOk) return ""
  const number = Math.trunc(Number(args.number) || 0)
  if (number <= 0) return ""
  return `${provider}:${host}:${repo}:${kind}:${number}`
}

/** 一行的 kind（与 `forgeRowKey` 的判据一致）。 */
export function forgeItemKindOf(row: { is_pr: boolean }): ForgeItemKind {
  return row.is_pr ? "pr" : "issue"
}
