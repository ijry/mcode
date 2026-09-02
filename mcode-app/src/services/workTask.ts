import type { CodegGateway } from "@/services/gateway"
import type {
  WorkTask,
  WorkTaskChangedFile,
  WorkTaskDraft,
  WorkTaskEvent,
  WorkTaskFolderSettings,
  WorkTaskFollowUpIntent,
  WorkTaskPromptBlock,
  WorkTaskStatus,
  WorkTaskTemplate,
} from "@/types/workTask"

/**
 * codeg 「任务」（work_task_*）命令的**唯一**封装层。
 *
 * 与 `services/remoteSettings.ts`、`services/projectSessions.ts` 同一套写法：
 * 每个导出都是一层薄封装 `gateway.call<T>("<snake_case_command>", payload)`，
 * 加上一个把非法行退化成 `null` 的 `normalize*`。**不走 `api/acp.ts`** ——
 * 那个单例默认打到全局 auth store 的网关，而任务页是按连接分组的，必须显式带
 * gateway 参数，不能依赖"当前连接"这个隐式全局。
 *
 * 线上字段名是 camelCase（服务端 `#[serde(rename_all = "camelCase")]`），
 * DTO 内部（draft / settings）是 snake_case —— 两者都逐字照抄，不要顺手统一。
 * 参见 `codeg-plus/src-tauri/src/web/handlers/work_task.rs`。
 *
 * 事件通道：`task://changed`。引擎是无头运行的，所以这条广播是打开的列表**唯一**
 * 能知道任务推进了的途径；载荷只有 id，客户端一律重新拉列表。
 */

/** 任务变更广播通道。载荷只有 id，收到就重新拉取。 */
export const WORK_TASK_CHANGED_CHANNEL = "task://changed"

/* ===== 读 ===== */

/** 列出任务。`folderId` 为空表示全部文件夹。 */
export async function listWorkTasks(
  gateway: CodegGateway,
  folderId?: number | null
): Promise<WorkTask[]> {
  const raw = await gateway.call<unknown>("work_task_list", {
    folderId: folderId ?? null,
  })
  return normalizeList(raw)
    .map(normalizeWorkTask)
    .filter((item): item is WorkTask => Boolean(item))
}

export async function getWorkTask(
  gateway: CodegGateway,
  id: number
): Promise<WorkTask | null> {
  const raw = await gateway.call<unknown>("work_task_get", { id })
  return normalizeWorkTask(raw)
}

/** 推进记录（只追加）。默认 500 条与 PC 端一致。 */
export async function listWorkTaskEvents(
  gateway: CodegGateway,
  taskId: number,
  limit = 500
): Promise<WorkTaskEvent[]> {
  const raw = await gateway.call<unknown>("work_task_events", { taskId, limit })
  return normalizeList(raw)
    .map(normalizeWorkTaskEvent)
    .filter((item): item is WorkTaskEvent => Boolean(item))
}

/** worktree 相对记录基线的统一 diff。`file` 为空 = 全量 diff。 */
export async function getWorkTaskDiff(
  gateway: CodegGateway,
  id: number,
  file?: string | null
): Promise<string> {
  const raw = await gateway.call<unknown>("work_task_diff", {
    id,
    file: file ?? null,
  })
  return typeof raw === "string" ? raw : ""
}

export async function listWorkTaskChangedFiles(
  gateway: CodegGateway,
  id: number
): Promise<WorkTaskChangedFile[]> {
  const raw = await gateway.call<unknown>("work_task_changed_files", { id })
  return normalizeList(raw)
    .map(normalizeChangedFile)
    .filter((item): item is WorkTaskChangedFile => Boolean(item))
}

/* ===== 写：增删改 ===== */

export async function createWorkTask(
  gateway: CodegGateway,
  draft: WorkTaskDraft
): Promise<WorkTask | null> {
  const raw = await gateway.call<unknown>("work_task_create", { draft })
  return normalizeWorkTask(raw)
}

export async function updateWorkTask(
  gateway: CodegGateway,
  id: number,
  draft: WorkTaskDraft
): Promise<WorkTask | null> {
  const raw = await gateway.call<unknown>("work_task_update", { id, draft })
  return normalizeWorkTask(raw)
}

/** 持久化待办列的拖拽顺序（下标 → sort_order）。 */
export async function reorderWorkTasks(
  gateway: CodegGateway,
  folderId: number,
  orderedIds: number[]
): Promise<void> {
  await gateway.call<void>("work_task_reorder", { folderId, orderedIds })
}

export async function deleteWorkTask(
  gateway: CodegGateway,
  id: number,
  deleteWorktree = false
): Promise<void> {
  await gateway.call<void>("work_task_delete", { id, deleteWorktree })
}

/* ===== 写：生命周期 ===== */

export async function startWorkTask(
  gateway: CodegGateway,
  id: number
): Promise<void> {
  await gateway.call<void>("work_task_start", { id })
}

/**
 * failed → queued。`note` 会进入重试提示词，`blocks` 承载备注框里的附件。
 * `allowDuplicateSource` 是 forge 复活守卫的豁免（用户确认要在同一个工作项上
 * 再开一个任务）。
 */
export async function retryWorkTask(
  gateway: CodegGateway,
  id: number,
  note?: string | null,
  blocks?: WorkTaskPromptBlock[] | null,
  allowDuplicateSource = false
): Promise<void> {
  await gateway.call<void>("work_task_retry", {
    id,
    note: note ?? null,
    blocks: blocks ?? [],
    allowDuplicateSource,
  })
}

/** canceled → todo（回到列表，之后再显式开始）。 */
export async function requeueWorkTask(
  gateway: CodegGateway,
  id: number,
  note?: string | null,
  blocks?: WorkTaskPromptBlock[] | null,
  allowDuplicateSource = false
): Promise<void> {
  await gateway.call<void>("work_task_requeue", {
    id,
    note: note ?? null,
    blocks: blocks ?? [],
    allowDuplicateSource,
  })
}

/**
 * 定时开始一个待办任务。`scheduledAt` 是 ISO 时刻，`null` 清除计划。
 * 到点后引擎按「点了开始」处理，文件夹并发上限依然生效。
 */
export async function scheduleWorkTask(
  gateway: CodegGateway,
  id: number,
  scheduledAt: string | null
): Promise<void> {
  await gateway.call<void>("work_task_schedule", { id, scheduledAt })
}

/** 对待验收任务继续处理。`intent` 决定 agent 收到的措辞；省略等于 `revise`。 */
export async function returnWorkTask(
  gateway: CodegGateway,
  id: number,
  feedback: string,
  intent?: WorkTaskFollowUpIntent | null,
  blocks?: WorkTaskPromptBlock[] | null
): Promise<void> {
  await gateway.call<void>("work_task_return", {
    id,
    feedback,
    intent: intent ?? null,
    blocks: blocks ?? [],
  })
}

/**
 * 停止任务。`reason` 会落在推进记录的 `canceled` 条目上，**不会**被回放进后续
 * 运行的提示词（重新排队自己带备注）。
 */
export async function cancelWorkTask(
  gateway: CodegGateway,
  id: number,
  reason?: string | null
): Promise<void> {
  await gateway.call<void>("work_task_cancel", { id, reason: reason ?? null })
}

/**
 * 发起 agent 驱动的合并（`message: null` = 由 agent 自己写提交信息）。
 *
 * **返回 `true` 表示被排队**了，而不是立刻开始 —— 同一项目的合并是串行的，
 * 第二次验收会排在队尾而不是失败。结果本身通过 `task://changed` 事件到达。
 */
export async function mergeWorkTask(
  gateway: CodegGateway,
  id: number,
  message: string | null,
  deleteWorktree: boolean
): Promise<boolean> {
  const raw = await gateway.call<unknown>("work_task_merge", {
    id,
    message,
    deleteWorktree,
  })
  return raw === true
}

/** 撤回排在项目合并队列里的合并；任务留在待验收。 */
export async function unqueueWorkTaskMerge(
  gateway: CodegGateway,
  id: number
): Promise<void> {
  await gateway.call<void>("work_task_merge_unqueue", { id })
}

/**
 * 把待验收的 forge 任务推回去验收：issue 来源会发布分支并创建（或认领）PR，
 * PR 来源则推到那个 PR 自己的头分支（此时 `prTitle` / `draft` 被忽略，不新建任何东西）。
 *
 * 与合并不同，这里**等待整个操作完成** —— 没有 agent 参与，只是一次 push 加两个
 * REST 调用，所以抛出的错误就是真实原因，且此时任务已经回到待验收。返回 PR 地址。
 */
export async function deliverWorkTaskPr(
  gateway: CodegGateway,
  id: number,
  prTitle: string | null,
  draft: boolean
): Promise<string> {
  const raw = await gateway.call<unknown>("work_task_deliver_pr", {
    id,
    prTitle,
    draft,
  })
  return typeof raw === "string" ? raw : ""
}

/**
 * 完成一个没有可合并内容的待验收任务（review → done），可顺带删掉 worktree。
 * 如果 worktree 其实变了，服务端会拒绝。同步返回。
 */
export async function completeWorkTask(
  gateway: CodegGateway,
  id: number,
  deleteWorktree: boolean
): Promise<void> {
  await gateway.call<void>("work_task_complete", { id, deleteWorktree })
}

export async function archiveWorkTask(
  gateway: CodegGateway,
  id: number,
  archived: boolean
): Promise<void> {
  await gateway.call<void>("work_task_archive", { id, archived })
}

/** 删除任务的 worktree + 分支（也用于重试一次失败的清理）。 */
export async function cleanupWorkTask(
  gateway: CodegGateway,
  id: number
): Promise<void> {
  await gateway.call<void>("work_task_cleanup", { id })
}

/* ===== 设置 ===== */

/** 文件夹 → 全局 → 内置回退之后的**生效**设置，也就是引擎实际会用的那份。 */
export async function getWorkTaskSettingsEffective(
  gateway: CodegGateway,
  folderId: number
): Promise<WorkTaskFolderSettings> {
  const raw = await gateway.call<unknown>("work_task_settings_effective", {
    folderId,
  })
  return normalizeFolderSettings(raw)
}

export async function getWorkTaskSettings(
  gateway: CodegGateway,
  folderId: number
): Promise<WorkTaskFolderSettings> {
  const raw = await gateway.call<unknown>("work_task_settings_get", { folderId })
  return normalizeFolderSettings(raw)
}

/** 文件夹自己那份设置，`null` = 跟随全局默认。设置弹层靠这个区分两者。 */
export async function getWorkTaskSettingsOwn(
  gateway: CodegGateway,
  folderId: number
): Promise<WorkTaskFolderSettings | null> {
  const raw = await gateway.call<unknown>("work_task_settings_get_own", {
    folderId,
  })
  if (!raw || typeof raw !== "object") return null
  return normalizeFolderSettings(raw)
}

export async function setWorkTaskSettings(
  gateway: CodegGateway,
  folderId: number,
  settings: WorkTaskFolderSettings
): Promise<void> {
  await gateway.call<void>("work_task_settings_set", { folderId, settings })
}

/** 丢掉文件夹自己的设置行 —— 它会回退到全局默认。 */
export async function deleteWorkTaskSettings(
  gateway: CodegGateway,
  folderId: number
): Promise<void> {
  await gateway.call<void>("work_task_settings_delete", { folderId })
}

/* ===== 模板 ===== */

export async function listWorkTaskTemplates(
  gateway: CodegGateway
): Promise<WorkTaskTemplate[]> {
  const raw = await gateway.call<unknown>("work_task_template_list", {})
  return normalizeList(raw)
    .map(normalizeTemplate)
    .filter((item): item is WorkTaskTemplate => Boolean(item))
}

/** 按名字 upsert：同名模板会被替换。 */
export async function saveWorkTaskTemplate(
  gateway: CodegGateway,
  draft: { name: string; title: string; config: WorkTaskConfigInput }
): Promise<WorkTaskTemplate | null> {
  const raw = await gateway.call<unknown>("work_task_template_save", { draft })
  return normalizeTemplate(raw)
}

export async function deleteWorkTaskTemplate(
  gateway: CodegGateway,
  id: number
): Promise<void> {
  await gateway.call<void>("work_task_template_delete", { id })
}

type WorkTaskConfigInput = WorkTaskDraft["config"]

/* ===== 归一化 ===== */

/**
 * 把「数组或包着数组的对象」摊平。只认 `data` 一种包装，与
 * `services/connection/connectionAccess.normalizeGatewayList` 保持一致。
 */
function normalizeList(input: unknown): any[] {
  if (Array.isArray(input)) return input
  if (input && typeof input === "object" && Array.isArray((input as any).data)) {
    return (input as any).data
  }
  return []
}

/**
 * 一行任务。`id` 非法即丢弃 —— 后面每个动作都要拿它当主键，没有 id 的行在 UI 上
 * 只会变成一颗点不动的卡片。
 *
 * `status` **不做白名单校验**：服务端可能新增状态，未知值原样透传，由展示层退化成
 * 通用样式（见 `taskStatus.ts` 的 `columnForStatus`）。硬校验会让新状态整行消失。
 */
export function normalizeWorkTask(input: unknown): WorkTask | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  const id = toInt(raw.id)
  if (!id || id <= 0) return null

  return {
    id,
    folder_id: toInt(raw.folder_id ?? raw.folderId) ?? 0,
    title: pickString(raw.title) || `任务 #${id}`,
    config: normalizeConfig(raw.config),
    status: (pickString(raw.status) || "todo") as WorkTaskStatus,
    failure_reason: pickString(raw.failure_reason ?? raw.failureReason) || null,
    last_error: pickString(raw.last_error ?? raw.lastError) || null,
    run_seq: toInt(raw.run_seq ?? raw.runSeq) ?? 0,
    sort_order: toInt(raw.sort_order ?? raw.sortOrder) ?? 0,
    worktree_folder_id: toInt(raw.worktree_folder_id ?? raw.worktreeFolderId),
    worktree_missing: Boolean(raw.worktree_missing ?? raw.worktreeMissing),
    agent_type: pickString(raw.agent_type ?? raw.agentType) || null,
    conversation_id: toInt(raw.conversation_id ?? raw.conversationId),
    connection_id: pickString(raw.connection_id ?? raw.connectionId) || null,
    base_branch: pickString(raw.base_branch ?? raw.baseBranch) || null,
    base_sha: pickString(raw.base_sha ?? raw.baseSha) || null,
    work_branch: pickString(raw.work_branch ?? raw.workBranch) || null,
    cleanup_state: pickString(raw.cleanup_state ?? raw.cleanupState) || null,
    verdict: pickString(raw.verdict) || null,
    result_summary: pickString(raw.result_summary ?? raw.resultSummary) || null,
    files_changed: toInt(raw.files_changed ?? raw.filesChanged),
    additions: toInt(raw.additions),
    deletions: toInt(raw.deletions),
    merge_commit: pickString(raw.merge_commit ?? raw.mergeCommit) || null,
    completion_kind: pickString(raw.completion_kind ?? raw.completionKind) || null,
    preflight: normalizePreflight(raw.preflight),
    merge_queued: normalizeQueuedMerge(raw.merge_queued ?? raw.mergeQueued),
    archived_at: pickString(raw.archived_at ?? raw.archivedAt) || null,
    scheduled_at: pickString(raw.scheduled_at ?? raw.scheduledAt) || null,
    source_kind: pickString(raw.source_kind ?? raw.sourceKind) || null,
    source_key: pickString(raw.source_key ?? raw.sourceKey) || null,
    source_meta: normalizeRecord(raw.source_meta ?? raw.sourceMeta),
    latest_progress: pickString(raw.latest_progress ?? raw.latestProgress) || null,
    created_at: pickString(raw.created_at ?? raw.createdAt),
    updated_at: pickString(raw.updated_at ?? raw.updatedAt),
    started_at: pickString(raw.started_at ?? raw.startedAt) || null,
    settled_at: pickString(raw.settled_at ?? raw.settledAt) || null,
    finished_at: pickString(raw.finished_at ?? raw.finishedAt) || null,
  }
}

/**
 * config 列是不透明 JSON。服务端已经反序列化好，但历史行可能是**字符串**（早期版本
 * 直接把 JSON 文本塞在这里），所以两种都要接。解析不出来返回 null，读取方（编辑器、
 * 详情页）一律带 `?.` 兜底。
 */
function normalizeConfig(input: unknown): WorkTask["config"] {
  const record =
    typeof input === "string" ? safeParseJson(input) : normalizeRecord(input)
  if (!record) return null
  const blocks = Array.isArray(record.prompt_blocks)
    ? (record.prompt_blocks as WorkTaskPromptBlock[])
    : []
  return {
    prompt_blocks: blocks,
    display_text: pickString(record.display_text),
    agent_type: pickString(record.agent_type) || null,
    mode_id: pickString(record.mode_id) || null,
    config_values: normalizeStringMap(record.config_values),
    label_snapshot: normalizeRecord(record.label_snapshot),
    deliverable: pickString(record.deliverable) || null,
  }
}

function normalizePreflight(input: unknown): WorkTask["preflight"] {
  const record =
    typeof input === "string" ? safeParseJson(input) : normalizeRecord(input)
  if (!record) return null
  const status = pickString(record.status)
  if (status !== "running" && status !== "passed" && status !== "failed") {
    return null
  }
  return {
    status,
    command: pickString(record.command),
    exit_code: toInt(record.exit_code),
    output_tail: pickString(record.output_tail) || null,
  }
}

function normalizeQueuedMerge(input: unknown): WorkTask["merge_queued"] {
  const record =
    typeof input === "string" ? safeParseJson(input) : normalizeRecord(input)
  if (!record) return null
  return {
    message: pickString(record.message) || null,
    delete_worktree: Boolean(record.delete_worktree),
    queued_at: pickString(record.queued_at),
  }
}

export function normalizeWorkTaskEvent(input: unknown): WorkTaskEvent | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  const id = toInt(raw.id)
  const kind = pickString(raw.kind)
  if (!id || !kind) return null
  return {
    id,
    task_id: toInt(raw.task_id ?? raw.taskId) ?? 0,
    kind,
    actor: pickString(raw.actor),
    payload: normalizeRecord(raw.payload),
    created_at: pickString(raw.created_at ?? raw.createdAt),
  }
}

function normalizeChangedFile(input: unknown): WorkTaskChangedFile | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  const file = pickString(raw.file)
  if (!file) return null
  return {
    file,
    additions: toInt(raw.additions) ?? 0,
    deletions: toInt(raw.deletions) ?? 0,
  }
}

/**
 * 文件夹设置。**任何缺失字段都补上内置默认**（与 Rust `Default` 实现一致），
 * 因为设置弹层是受控表单：`undefined` 会让 up-switch / 输入框变成非受控。
 */
export function normalizeFolderSettings(input: unknown): WorkTaskFolderSettings {
  const record = normalizeRecord(input) || {}
  const strategy = pickString(record.merge_strategy)
  return {
    default_agent_type: pickString(record.default_agent_type) || null,
    mode_id: pickString(record.mode_id) || null,
    config_values: normalizeStringMap(record.config_values),
    label_snapshot: normalizeRecord(record.label_snapshot),
    auto_process: Boolean(record.auto_process),
    max_concurrent: toInt(record.max_concurrent) ?? 2,
    merge_strategy: strategy === "merge" ? "merge" : "squash",
    auto_merge: Boolean(record.auto_merge),
    // 内置默认是 true，所以缺省不能读成 false —— 只有显式 false 才是关。
    delete_worktree_default:
      record.delete_worktree_default === undefined
        ? true
        : Boolean(record.delete_worktree_default),
    worktree_root: pickString(record.worktree_root) || null,
    preflight_command_id: toInt(record.preflight_command_id),
    preflight_command: pickString(record.preflight_command) || null,
    init_command: pickString(record.init_command) || null,
    stage_prompts: normalizeStringMap(record.stage_prompts),
  }
}

function normalizeTemplate(input: unknown): WorkTaskTemplate | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  const id = toInt(raw.id)
  if (!id || id <= 0) return null
  return {
    id,
    name: pickString(raw.name) || `模板 #${id}`,
    title: pickString(raw.title),
    config: normalizeConfig(raw.config),
    created_at: pickString(raw.created_at ?? raw.createdAt),
    updated_at: pickString(raw.updated_at ?? raw.updatedAt),
  }
}

function normalizeRecord(input: unknown): Record<string, any> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  return input as Record<string, any>
}

function normalizeStringMap(input: unknown): Record<string, string> {
  const record = normalizeRecord(input)
  if (!record) return {}
  const next: Record<string, string> = {}
  Object.entries(record).forEach(([key, value]) => {
    if (typeof value === "string") next[key] = value
  })
  return next
}

function safeParseJson(input: string): Record<string, any> | null {
  const text = input.trim()
  if (!text) return null
  try {
    return normalizeRecord(JSON.parse(text))
  } catch {
    return null
  }
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

/**
 * 整数或 null。**0 必须保留** —— `files_changed === 0`（无改动）与 `null`
 * （引擎读不到统计）在验收判定里是两种截然不同的语义，见 `taskAcceptance.ts`。
 */
function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return Math.trunc(parsed)
  }
  return null
}
