import {
  FORGE_DEFAULT_PER_PAGE,
  FORGE_MAX_PER_PAGE,
  FORGE_MIN_PER_PAGE,
  type ForgeTab,
} from "@/types/forge"

/**
 * 仓库面板作用域（哪台连接 / 哪个项目）与两个列表偏好的持久化。
 *
 * 与 `services/taskFilterPreference.ts` 同一套写法：一个存储键、读时归一化、
 * 写时只存必要字段、try/catch 不让存储失败炸页面。
 *
 * **存什么**：`connectionId` / `folderId` / `tab` / `perPage`。
 *
 * **不存什么**（每条都有具体理由）：
 * - `page` —— 回到第 7 页而列表已经动过，比回到第 1 页更糟；
 * - `state` / `sort` / `assignedMe` —— triage 列表应该总是从「还没处理完的」
 *   开始（与桌面端一致，它也只记 tab 与页大小）；
 * - `labels` —— 标签是**每个仓库自己的词汇表**，换仓库后旧选择会筛出一个
 *   不存在的标签，得到一个空列表和一个说不出为什么的用户。
 */

const STORAGE_KEY = "mcode_forge_scope"

export interface StoredForgeScope {
  /** 上次用的连接 id。连接被删掉时读取方自行回退。 */
  connectionId: string
  /** 上次看的项目 folder id；0 = 让页面自己决定。 */
  folderId: number
  tab: ForgeTab
  /** 每次加载多少行。 */
  perPage: number
}

export const DEFAULT_STORED_FORGE_SCOPE: StoredForgeScope = {
  connectionId: "",
  folderId: 0,
  tab: "issues",
  perPage: FORGE_DEFAULT_PER_PAGE,
}

/** 页大小选项。固定几档而不是自由输入：两个 forge 都把 `per_page` 限制在 100，服务端还会 clamp，任意数字只会得到一个用户没要求的页。 */
export const FORGE_PAGE_SIZES = [10, 20, 30, 50] as const

const VALID_TABS = new Set<string>(["issues", "prs"])

export function readStoredForgeScope(): StoredForgeScope {
  let raw: unknown = null
  try {
    raw = uni.getStorageSync(STORAGE_KEY)
  } catch {
    return { ...DEFAULT_STORED_FORGE_SCOPE }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_STORED_FORGE_SCOPE }
  }
  const record = raw as Record<string, unknown>
  return {
    connectionId: typeof record.connectionId === "string" ? record.connectionId : "",
    folderId: normalizeFolderId(record.folderId),
    // 未知 tab 回退到 issues：tab 以后可能改名，一个存着旧名字的偏好不能让列表永远空着。
    tab: VALID_TABS.has(String(record.tab || "")) ? (record.tab as ForgeTab) : "issues",
    perPage: normalizePerPage(record.perPage),
  }
}

export function writeStoredForgeScope(next: StoredForgeScope) {
  try {
    uni.setStorageSync(STORAGE_KEY, {
      connectionId: String(next.connectionId || ""),
      folderId: normalizeFolderId(next.folderId),
      tab: VALID_TABS.has(next.tab) ? next.tab : "issues",
      perPage: normalizePerPage(next.perPage),
    })
  } catch (error) {
    console.warn("persist forge scope failed:", error)
  }
}

function normalizeFolderId(value: unknown): number {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0
}

/**
 * 页大小。**不在 `FORGE_PAGE_SIZES` 里的值也接受**，只要落在服务端的
 * `1..=100` 里 —— 一个未来版本提供过的档位（或手改的存储）读回来仍是一个
 * 服务端会照做的数字，没有理由把它改掉。
 */
function normalizePerPage(value: unknown): number {
  const parsed = Number(value || 0)
  if (!Number.isFinite(parsed)) return FORGE_DEFAULT_PER_PAGE
  const truncated = Math.trunc(parsed)
  if (truncated < FORGE_MIN_PER_PAGE || truncated > FORGE_MAX_PER_PAGE) {
    return FORGE_DEFAULT_PER_PAGE
  }
  return truncated
}
