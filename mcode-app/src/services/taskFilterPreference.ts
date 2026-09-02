/**
 * 任务列表页筛选偏好的持久化。
 *
 * 与 `services/conversation/hideCompletedConversationsPreference.ts` 同一套写法：
 * 一个存储键、读时归一化、写时只存必要字段。放在 services 层是因为列表页与
 * （将来的）项目详情任务面板都要读同一份偏好，不能各存一份。
 */

const STORAGE_KEY = "mcode_task_list_filter"

export interface StoredTaskFilter {
  /** 当前 tab id（`all` | `todo` | `inProgress` | `attention` | `done`）。 */
  tab: string
  showCanceled: boolean
  showArchived: boolean
  /** 上次选中的连接键。连接被删掉时读取方自行回退到全部。 */
  connectionKey: string
  /** 上次选中的项目 id；0 = 全部。 */
  folderId: number
}

export const DEFAULT_STORED_TASK_FILTER: StoredTaskFilter = {
  tab: "all",
  showCanceled: true,
  showArchived: false,
  connectionKey: "",
  folderId: 0,
}

const VALID_TABS = new Set(["all", "todo", "inProgress", "attention", "done"])

export function readStoredTaskFilter(): StoredTaskFilter {
  let raw: unknown = null
  try {
    raw = uni.getStorageSync(STORAGE_KEY)
  } catch {
    return { ...DEFAULT_STORED_TASK_FILTER }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_STORED_TASK_FILTER }
  }
  const record = raw as Record<string, unknown>
  const tab = String(record.tab || "")
  const folderId = Number(record.folderId || 0)
  return {
    // 未知 tab 回退到 `all`：状态分组以后可能改名，一个存着旧名字的偏好不能让
    // 列表永远空着。
    tab: VALID_TABS.has(tab) ? tab : "all",
    // 两个开关都按「显式 false 才算关」处理 —— 缺字段时用内置默认，
    // 而 showCanceled 的默认是 true。
    showCanceled: record.showCanceled === undefined ? true : Boolean(record.showCanceled),
    showArchived: Boolean(record.showArchived),
    connectionKey: typeof record.connectionKey === "string" ? record.connectionKey : "",
    folderId: Number.isFinite(folderId) && folderId > 0 ? Math.trunc(folderId) : 0,
  }
}

export function writeStoredTaskFilter(next: StoredTaskFilter) {
  try {
    uni.setStorageSync(STORAGE_KEY, {
      tab: VALID_TABS.has(next.tab) ? next.tab : "all",
      showCanceled: Boolean(next.showCanceled),
      showArchived: Boolean(next.showArchived),
      connectionKey: String(next.connectionKey || ""),
      folderId: Number(next.folderId || 0) || 0,
    })
  } catch (error) {
    console.warn("persist task filter failed:", error)
  }
}
