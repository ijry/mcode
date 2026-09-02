import type { CodegGateway } from "@/services/gateway"
import type { ForgeCreateResult, ForgeRemote, ForgeTaskDraft, ForgeTaskLink } from "@/types/forge"
import { normalizeForgeRemote } from "./forgeApi"

/**
 * forge ↔ work task 的桥：把一个工作项处理成任务，以及反查行上的任务芯片。
 *
 * 与 `forgeApi.ts` 分开是因为这两条命令**跨两个域** —— 它们住在 `commands/forge.rs`
 * 但操作的是 `work_task` 表，且它们的载荷是整套 API 里唯一 **snake_case 的请求**。
 *
 * ## 载荷命名（最容易写错的一处）
 *
 * `work_task_create_from_forge` 的外层是 `{draft}`（camelCase 无所谓，只有一个词），
 * 但 **draft 内部全是 snake_case**（`folder_id` / `server_host` / `owner_repo` /
 * `account_id` / `agent_type`）—— `commands/forge.rs` 的 `ForgeTaskDraft` 没有 rename。
 * 写成 camelCase 会让 serde 用默认值填满整个结构，表现是「创建成功但任务指向 folder 0」。
 *
 * 而 `work_task_lookup_by_source` 的外层是 `{sourceKeys}`（camelCase，那是 handler 的
 * param struct）。同一个文件里两种规则，照抄。
 */

/** 一批反查的上限（服务端 `LOOKUP_KEYS_CAP`）。一屏大约 30 行，这个数管够。 */
export const FORGE_LOOKUP_KEYS_CAP = 100

/**
 * 把一个工作项处理成任务。
 *
 * 三种 outcome 都是**答案**而不是错误：
 * - `created` —— 成功；
 * - `duplicate` —— 这个工作项已经有一个活跃任务，弹层给「查看已有 / 仍要新建」；
 * - `folder_mismatch` —— 当前文件夹的 origin 与这个工作项的仓库不一致（服务端硬门禁），
 *   要求换文件夹。
 *
 * 客户端只送**坐标 + 展示快照 + 场景名**。URL、api_base、账号身份、source key、提示词
 * 全部由服务端派生，且它会先校验文件夹的 origin 是否真的是声称的那个仓库。
 */
export async function createWorkTaskFromForge(
  gateway: CodegGateway,
  draft: ForgeTaskDraft
): Promise<ForgeCreateResult | null> {
  const raw = await gateway.call<unknown>("work_task_create_from_forge", {
    // 逐字段列出并保持 snake_case —— 见文件头。
    draft: {
      folder_id: draft.folder_id,
      source: {
        kind: draft.source.kind,
        provider: draft.source.provider,
        server_host: draft.source.server_host,
        account_id: draft.source.account_id,
        owner_repo: draft.source.owner_repo,
        number: draft.source.number,
      },
      snapshot: {
        title: draft.snapshot.title,
        body: draft.snapshot.body,
        labels: draft.snapshot.labels,
        author: draft.snapshot.author,
      },
      scenario: draft.scenario,
      instruction: draft.instruction,
      // **总是显式送**：服务端把缺失读作「静默」而不是弹层的默认值，因为一个没带这个
      // 字段的请求来自从未展示过这个问题的客户端。
      writeback: draft.writeback,
      agent_type: draft.agent_type,
      force: draft.force,
    },
  })
  return normalizeForgeCreateResult(raw)
}

/**
 * 一批 source key 各自最新的那个任务（任何状态）。
 *
 * 走本地数据库，**不花 forge 配额** —— 这就是为什么 `task://changed` 的回调可以只做
 * 这一件事（重跑反查刷新芯片）而不必重拉列表。
 */
export async function lookupForgeTasks(
  gateway: CodegGateway,
  sourceKeys: string[]
): Promise<ForgeTaskLink[]> {
  const keys = Array.from(new Set(sourceKeys.filter(Boolean))).slice(0, FORGE_LOOKUP_KEYS_CAP)
  if (keys.length === 0) return []
  const raw = await gateway.call<unknown>("work_task_lookup_by_source", { sourceKeys: keys })
  return normalizeList(raw)
    .map(normalizeForgeTaskLink)
    .filter((item): item is ForgeTaskLink => Boolean(item))
}

/* ===== 归一化 ===== */

/**
 * 触发结果。
 *
 * `outcome` 是判别符（服务端 `#[serde(tag = "outcome")]`）。认不出来的 outcome 返回
 * `null` 让调用方按「未知失败」处理 —— 猜一个分支会让弹层做出错误的事（比如把
 * `folder_mismatch` 当成 `created` 然后关掉弹层，用户以为任务建好了）。
 */
export function normalizeForgeCreateResult(input: unknown): ForgeCreateResult | null {
  const raw = normalizeRecord(input)
  if (!raw) return null
  const outcome = pickString(raw.outcome)
  if (outcome === "created") {
    const task = normalizeRecord(raw.task)
    return task ? { outcome: "created", task } : null
  }
  if (outcome === "duplicate") {
    const existing = normalizeRecord(raw.existing)
    return existing ? { outcome: "duplicate", existing } : null
  }
  if (outcome === "folder_mismatch") {
    return {
      outcome: "folder_mismatch",
      // 服务端可能连这个都给不出（文件夹压根没有可识别的远端）。
      folder_remote: normalizeForgeRemote(raw.folder_remote ?? raw.folderRemote),
    }
  }
  return null
}

/**
 * 一条反查行。
 *
 * `source_key` 或 `task_id` 缺失即丢弃：前者是匹配的依据，后者是点芯片时要跳过去的
 * 目标，两个都没有替代品。
 *
 * `status` **不做白名单校验** —— 服务端可能新增状态，硬校验会让那一行的芯片整个消失
 * （表现是「这个 issue 看起来没人处理过」，于是被重复触发）。
 */
export function normalizeForgeTaskLink(input: unknown): ForgeTaskLink | null {
  const raw = normalizeRecord(input)
  if (!raw) return null
  const sourceKey = pickString(raw.source_key, raw.sourceKey)
  const taskId = toInt(raw.task_id ?? raw.taskId)
  if (!sourceKey || !taskId || taskId <= 0) return null
  return {
    source_key: sourceKey,
    task_id: taskId,
    status: pickString(raw.status) || "todo",
    verdict: pickString(raw.verdict) || null,
    updated_at: pickString(raw.updated_at, raw.updatedAt),
  }
}

/** `source_key` → 那条反查行。展示层按行的候选 key 查这张表。 */
export function forgeTaskLinkMap(links: ForgeTaskLink[]): Map<string, ForgeTaskLink> {
  const map = new Map<string, ForgeTaskLink>()
  links.forEach((link) => {
    map.set(link.source_key, link)
  })
  return map
}

/** 从远端坐标与一行构造反查用的 source key 需要的那几个字段。 */
export function forgeTaskSourceOf(
  remote: ForgeRemote,
  row: { number: number; is_pr: boolean }
): { provider: ForgeRemote["provider"]; serverHost: string; ownerRepo: string; number: number } {
  return {
    // **只用远端给的 provider** —— 客户端从不自己猜（那等于替用户选一份凭据）。
    provider: remote.provider,
    serverHost: remote.server_host,
    ownerRepo: remote.owner_repo,
    number: row.number,
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

function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return Math.trunc(parsed)
  }
  return null
}
