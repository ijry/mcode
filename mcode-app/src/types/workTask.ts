/**
 * codeg-plus「任务」（Work Task）功能的线上类型。
 *
 * 与 `types/acp.ts` 同一套约定：**字段名逐字沿用服务端**（snake_case），不在类型层做
 * 驼峰化 —— 归一化只发生在 services 层。镜像来源：
 * - `codeg-plus/src-tauri/src/models/work_task.rs`
 * - `codeg-plus/src/lib/types.ts` 的 `WorkTask*`
 *
 * 命名注意：PC 端把这套东西叫 **WorkTask** 而不是 Task，因为它那边 `Task` 已经被
 * 状态栏的临时任务队列占用了。mcode-app 没有这个冲突，但类型名保持一致以便对读。
 */

/**
 * 任务生命周期。管线是
 * `todo → queued → preparing → running ⇄ awaiting_input → review → merging → done`，
 * `failed` / `canceled` 是旁路。两条硬约束（服务端保证，客户端可以依赖）：
 * - `done` ⟺ 已验收的最终成功，且**不会回退**；三条入口（合并落地、推送到 PR、
 *   无改动直接完成）都先经过 `review`，没有任何任务能不被看见就到 `done`。
 * - 每次状态迁移都是带期望状态的条件更新（CAS），所以客户端拿着过期状态去操作只会被
 *   拒绝，不会写坏数据。
 */
export type WorkTaskStatus =
  | "todo"
  | "queued"
  /** 已出队，正在准备：建 worktree、跑初始化命令、拉起 agent。 */
  | "preparing"
  | "running"
  | "awaiting_input"
  | "review"
  | "merging"
  | "done"
  | "failed"
  | "canceled"

/** 全部状态，按看板列顺序展开 —— 供筛选器与测试穷举使用。 */
export const WORK_TASK_STATUSES: WorkTaskStatus[] = [
  "todo",
  "queued",
  "preparing",
  "running",
  "awaiting_input",
  "review",
  "merging",
  "failed",
  "done",
  "canceled",
]

/**
 * 存进 `work_task.config` 的 composer 快照。可选的 agent / mode / config 字段是
 * **本任务的覆盖值**，留空表示启动时继承文件夹的任务设置。
 */
export interface WorkTaskConfig {
  prompt_blocks: WorkTaskPromptBlock[]
  display_text: string
  agent_type?: string | null
  mode_id?: string | null
  config_values: Record<string, string>
  label_snapshot?: Record<string, unknown> | null
  /**
   * 这一单原始工作产出什么。`"report"` 表示首轮交付的是结论而非代码改动
   * （forge 的「调查 / 先出方案 / 只评审」场景）。未知值按普通改动型任务处理 ——
   * 新版本服务端写入的值必须仍能被旧客户端读懂。
   */
  deliverable?: string | null
}

/**
 * 任务提示词的载荷块。与 `types/acp.ts` 的 `PromptInputBlock` 同构 —— 这里单独声明是
 * 因为任务的 config 是**不透明 JSON**，服务端只做透传，形状可能比 ACP 那份更宽。
 */
export type WorkTaskPromptBlock =
  | { type: "text"; text: string }
  | { type: "image"; data?: string; mime_type?: string; uri?: string | null }
  | { type: "resource"; uri: string; mime_type?: string | null; text?: string | null; blob?: string | null }
  | { type: "resource_link"; uri: string; name: string; mime_type?: string | null; description?: string | null }
  | { type: string; [key: string]: unknown }

/** 一条任务记录（`work_task_list` / `work_task_get` 的元素）。 */
export interface WorkTask {
  id: number
  folder_id: number
  title: string
  /** 由不透明 JSON 列反序列化而来；解析失败时服务端给 null，读取方必须兜底。 */
  config: WorkTaskConfig | null
  status: WorkTaskStatus
  /** agent_error | setup_error | verdict_blocked | interrupted */
  failure_reason: string | null
  last_error: string | null
  /** 执行代数。start / retry / return 各自 +1，用来丢弃过期事件。 */
  run_seq: number
  sort_order: number
  worktree_folder_id: number | null
  /**
   * 记录里有 worktree 但已不可用（文件夹行被删，或目录从磁盘上消失）。
   * 由 list/get 命令现场标注 —— 行自己无从得知。为 true 时合并跑不起来，
   * 待验收状态应改为提供「完成」。缺省视为 false。
   */
  worktree_missing?: boolean
  /**
   * 实际执行（或曾执行）本任务的 agent，由 list/get 按引擎启动时的同一套层级解析：
   * 真正跑过的会话 → 任务自己的覆盖值 → 文件夹任务设置 → 文件夹默认。
   * 缺省 / null 表示三层都没配 —— 那也是引擎唯一会拒绝启动的情形。
   */
  agent_type?: string | null
  conversation_id: number | null
  /** 当代的 ACP 连接 id；任务落定后即失效 —— 附着前必须先看状态。 */
  connection_id: string | null
  base_branch: string | null
  base_sha: string | null
  work_branch: string | null
  /** null = 无待处理；"failed" = worktree 清理失败（可重试）。 */
  cleanup_state: string | null
  verdict: string | null
  result_summary: string | null
  files_changed: number | null
  additions: number | null
  deletions: number | null
  merge_commit: string | null
  /**
   * 已完成任务的收尾方式：'merged' | 'delivered_pr' | 'accepted_without_merge'。
   * 未完成的任务、以及该列存在之前完成的旧行上都没有这个字段。
   */
  completion_kind?: string | null
  /** 本轮验收的预检红绿灯（配置了预检命令才有）。 */
  preflight: WorkTaskPreflight | null
  /**
   * 这条待验收任务排队等待的合并 —— 用户点合并时该项目正在落地另一个任务。
   * 缺省 / null = 未排队；名次由同文件夹已排队任务按 `queued_at` 排序得出。
   */
  merge_queued?: WorkTaskQueuedMerge | null
  archived_at: string | null
  /** 待办任务的计划开始时间（ISO）；null = 无计划。被领取的瞬间即清空。 */
  scheduled_at: string | null
  /** forge 来源（'forge_issue' | 'forge_pr'）；缺省 = 非 forge 触发。 */
  source_kind?: string | null
  /** 规范化来源键（{provider}:{host}:{owner_repo}:{kind}:{number}）。 */
  source_key?: string | null
  /** 来源快照（url、标题、编号……）。 */
  source_meta?: WorkTaskSourceMeta | null
  /** 最近一条 agent_progress 里程碑 —— 只在活动中（running/awaiting/merging）的行上出现。 */
  latest_progress?: string | null
  created_at: string
  updated_at: string
  started_at: string | null
  settled_at: string | null
  finished_at: string | null
}

/** forge 触发任务的来源快照（镜像 Rust `ForgeSourceMeta`）。 */
export interface WorkTaskSourceMeta {
  provider?: string
  server_host?: string
  api_base?: string
  account_id?: string
  owner_repo?: string
  number?: number
  /** 规范化后的 html 地址，由服务端推导。 */
  url?: string
  /** 触发时的 issue / PR 标题。 */
  title?: string
  /** 仅 PR：基线分支、头分支、头提交、头仓库。 */
  base_ref?: string | null
  head_ref?: string | null
  head_sha?: string | null
  head_repo?: string | null
  /** 交付路径创建出来的 PR 地址。 */
  result_pr?: string | null
  writeback?: boolean | null
}

/** 因项目合并槽被占用而挂起的一次合并。 */
export interface WorkTaskQueuedMerge {
  /** 用户填的提交信息；null = 由 agent 自己写。 */
  message: string | null
  delete_worktree: boolean
  /** 入队时刻（ISO）—— 引擎泵的排序键。 */
  queued_at: string
}

/** 一次验收的预检命令结果。 */
export interface WorkTaskPreflight {
  status: "running" | "passed" | "failed"
  /** 运行的文件夹命令显示名。 */
  command: string
  exit_code?: number | null
  /** 尾部合并输出 —— 红灯时才有。 */
  output_tail?: string | null
}

/** 一条只追加的推进记录（"任务是怎么走到这一步的"）。 */
export interface WorkTaskEvent {
  id: number
  task_id: number
  kind: string
  actor: string
  payload: Record<string, unknown> | null
  created_at: string
}

/** 创建 / 更新任务的载荷。 */
export interface WorkTaskDraft {
  folder_id: number
  title: string
  config: WorkTaskConfig
}

/** 已保存的任务模板（全局；文件夹在创建时才选）。同名保存 = 覆盖。 */
export interface WorkTaskTemplate {
  id: number
  name: string
  title: string
  config: WorkTaskConfig | null
  created_at: string
  updated_at: string
}

/** 每个文件夹的任务默认配置（`work_task_settings.config`）。 */
export interface WorkTaskFolderSettings {
  default_agent_type?: string | null
  mode_id?: string | null
  config_values: Record<string, string>
  label_snapshot?: Record<string, unknown> | null
  auto_process: boolean
  /** 0 = 不限。 */
  max_concurrent: number
  merge_strategy: "squash" | "merge"
  /**
   * 自动合并：任务进入待验收且确实可合并时，引擎发起与点按钮完全相同的合并
   * （提交信息由 agent 写，是否删 worktree 按 `delete_worktree_default`）。
   */
  auto_merge: boolean
  delete_worktree_default: boolean
  /**
   * 新任务 worktree 的**父目录** —— 每个任务仍在其下拿到自己的 `<repo>-task-<id>`。
   * 空 = 建在项目文件夹同级；`~` 展开为主目录，相对路径相对项目文件夹解析。
   */
  worktree_root?: string | null
  /** 预检用的 folder_command id；null = 无预检。 */
  preflight_command_id?: number | null
  /** 自由填写的预检 shell 行，优先于 `preflight_command_id`。 */
  preflight_command?: string | null
  /** 新建 worktree 后、agent 启动前执行的 shell 行（装依赖、灌环境）。 */
  init_command?: string | null
  /**
   * 追加在某个启动阶段内置提示词**之后**的补充说明。键是引擎的阶段 id
   * （`work` | `retry` | `return` | `merge`）加保留键 `all`（对每个阶段都追加）。
   */
  stage_prompts?: Record<string, string> | null
}

/** 任务 worktree 相对其记录基线的一个变更文件。 */
export interface WorkTaskChangedFile {
  file: string
  additions: number
  deletions: number
}

/**
 * 对待验收任务继续处理时的意图。服务端据此选择包裹用户文本的措辞 ——
 * 同一句话在「改这里」「继续做」「解释一下」下要的行为完全不同。
 * 镜像 Rust `FollowUpIntent`；不传等于 `revise`（历史行为）。
 */
export type WorkTaskFollowUpIntent = "revise" | "continue" | "question" | "verify"
