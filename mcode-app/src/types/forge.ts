/**
 * codeg-plus 仓库面板（forge）的线上类型。
 *
 * **命名规则有三层，全部逐字照抄，不要顺手统一：**
 * 1. HTTP 外层 param（`folderId` / `accountId` / `sourceKeys`）—— camelCase，
 *    服务端 `web/handlers/forge.rs` 每个 param struct 都带
 *    `#[serde(rename_all = "camelCase")]`。这一层不出现在本文件里，它是
 *    `services/forge/forgeApi.ts` 里的字面量。
 * 2. **请求 DTO**（`ForgeListFilters` / `ForgeCommentDraft` / …）—— 也是
 *    camelCase（`assignedMe` / `perPage` / `headSha`），因为 Rust 侧
 *    `forge/mod.rs` 的每个请求结构体各自带了 rename。
 * 3. **响应类型**（`Forge*`）—— **snake_case**，Rust 侧没有 rename。
 *
 * 唯一的例外是 `ForgeTaskDraft` / `ForgePanelSettings` / `ForgeSettingsStore`：
 * 它们是**请求**却是 snake_case（前者在 `commands/forge.rs` 里没有 rename，
 * 后者是直接进存储的同一个 blob）。这是整套 API 最容易写错的地方。
 *
 * 参考：`codeg-plus/src-tauri/src/forge/mod.rs`、`commands/forge.rs`、
 * `forge/settings.rs`、`web/handlers/forge.rs`。
 */

/** 后端从主机名 + 已配置账号推导出来的 forge 种类。**客户端永不自己选** —— 这个选择等于选一份凭据。 */
export type ForgeProviderId = "github" | "gitlab"

/** 列表的两个 tab。GitLab 显示「合并请求」，GitHub 显示「拉取请求」，线上值一样。 */
export type ForgeTab = "issues" | "prs"

/** 归一化后的条目状态。`merged` 只会出现在 PR 上 —— GitHub 把已合并的 PR 报成 `closed`，是后端从 `merged_at` 派生的。 */
export type ForgeItemState = "open" | "closed" | "merged"

/** 条目种类。GitLab 的 MR 在这里归一为 `pr`。 */
export type ForgeItemKind = "issue" | "pr"

/**
 * 四种**具名**排序，而不是 (字段, 方向) 二元组：两个 forge 的字段拼写不同
 * （`created` vs `created_at`）且接受的集合不同，这四个是交集。
 */
export type ForgeSort =
  | "newest"
  | "oldest"
  | "recently_updated"
  | "least_recently_updated"

/** 列表状态筛选。 */
export type ForgeStateFilter = "open" | "closed" | "all"

/** 状态按钮做的事。两个**动词**而不是目标状态 —— 这是 GitLab API 的形状（`state_event`），也是按钮的语义。 */
export type ForgeStateAction = "close" | "reopen"

/** 合并方式。GitHub 按次选，GitLab 只能选「是否先 squash」（项目自己决定其余）。 */
export type ForgeMergeMethod = "merge" | "squash" | "rebase"

/** `merge` 实际会对历史做什么 —— GitLab 的项目设置决定，API 无法覆盖。 */
export type ForgeMergeStrategy = "merge_commit" | "rebase_merge" | "fast_forward"

/**
 * 检查项状态，**一套词汇**。
 * GitHub 有 status×conclusion 两套加一套 legacy commit-status，GitLab 有 job status，
 * 三套十八个值在后端折成这五个。`neutral` 是「跑了但故意没有结论」（skipped /
 * cancelled / manual）—— 与 success 分开，因为把跳过的必需检查画成绿色，
 * 就是让一条红色流水线读起来是绿的。
 */
export type ForgeCheckState =
  | "queued"
  | "running"
  | "success"
  | "failure"
  | "neutral"

/** 文件被怎么动的。 */
export type ForgeFileStatus = "added" | "removed" | "modified" | "renamed"

/** 场景名（模板 NAME，不是模板文本 —— 提示词永远不过线）。issue 用前两个，PR 用后两个。 */
export type ForgeScenarioId = "fix" | "plan_first" | "review_fix" | "review_only"

/* ===== 响应：仓库与标签（snake_case） ===== */

/** 文件夹 origin 远端解析出来的 forge 坐标。 */
export interface ForgeRemote {
  /** 服务器主机名（`github.com` / `ghe.corp.com`）—— source key 与 git 远端共用的坐标系。 */
  server_host: string
  /** 小写 `owner/repo`（GitLab 是完整子组路径）。 */
  owner_repo: string
  /** 已脱敏（`user:token@` 被剥掉）的远端地址。 */
  remote_url: string
  provider: ForgeProviderId
  /**
   * provider 是**推导出来的**还是**猜的**。`false` = 远端解析正常但主机名
   * 不像 GitHub / GitLab（Bitbucket / Gitee / Gitea），此时**不要发任何 forge 请求**。
   */
  supported: boolean
}

/** 一个标签。`color` 已归一成 `#rrggbb`，`null` = forge 给的不是 hex（GitLab 写入时接受 CSS 颜色名）。 */
export interface ForgeLabel {
  name: string
  color: string | null
}

/** 仓库的标签词汇表。`truncated` 说明还有更多 —— 一个静默停在 100 的筛选列表读起来像「这就是全部」。 */
export interface ForgeLabelList {
  labels: ForgeLabel[]
  truncated: boolean
}

/* ===== 响应：列表（snake_case） ===== */

/** 列表的一行。两个 tab 共用一个形状，`is_pr` 是分界。 */
export interface ForgeIssueRow {
  number: number
  title: string
  /** 已截断（后端 16000 字符）—— 触发快照就是从列表行取的，所以 issue 不需要单独的详情接口。 */
  body: string | null
  /** 归一化的 open / closed / merged。行的图标与颜色取自这个值加上 `draft`。 */
  state: string
  /** 草稿 PR。issue 恒 false。 */
  draft: boolean
  labels: ForgeLabel[]
  author: string | null
  /** 只允许 http(s)（后端已过）。两个 forge 都随列表行送，所以头像不额外花请求。 */
  author_avatar: string | null
  updated_at: string | null
  html_url: string
  is_pr: boolean
  /** **人类**评论数（两个 forge 都排除了系统事件），所以它的含义是「这里有讨论」。 */
  comments: number
}

/** 一页列表。 */
export interface ForgeIssueList {
  rows: ForgeIssueRow[]
  /** 实际服务的页码（已 clamp）。 */
  page: number
  per_page: number
  /**
   * 匹配总数，`null` = forge 拒绝计数（GitLab 超过 1 万行就不给 `X-Total`，
   * 且它有一个本地过滤的查询其计数会说谎）。**不要压成 0**。
   */
  total_count: number | null
  /**
   * 这些匹配里 forge 真正肯翻页到的数量，仅当它少于 `total_count` 时才有值。
   * GitHub Search 只服务前 1000 条，越过就是 422 —— 所以页码的天花板取自这里。
   * `null` = 全部可达（GitLab 总是如此，GitHub 在查询没撞上限时也是）。
   */
  reachable_count: number | null
  has_next: boolean
  /** GitHub search 超时，这一页是残缺的。要说出来 —— 静默变短的列表读起来像「就这么多」。 */
  incomplete: boolean
}

/* ===== 响应：讨论与身份（snake_case） ===== */

/** 一条人类评论。 */
export interface ForgeComment {
  /** forge 自己的 id，**字符串化**（GitHub 是 i64，GitLab 是项目内唯一的 note id）。 */
  id: string
  author: string | null
  author_avatar: string | null
  body: string
  created_at: string | null
  /** 只在**被编辑过**时存在 —— 两个 forge 创建时也会盖这个戳，原样透传会让每条评论都标成「已编辑」。 */
  updated_at: string | null
  html_url: string | null
}

/** 一页讨论。没有总数 —— 总数取自条目自己的 `comments` 字段（列表已经付过钱了）。 */
export interface ForgeCommentList {
  comments: ForgeComment[]
  page: number
  per_page: number
  /** 来自 forge 的分页头，**不是**从「这页还剩几行」推的：GitLab 本地丢掉系统事件，一页可能一条人写的都不剩而讨论还在下一页。 */
  has_next: boolean
}

/** 对这个文件夹做写操作时会以谁的身份出去。本地解析，不花请求。 */
export interface ForgeIdentity {
  username: string
  avatar_url: string | null
}

/* ===== 响应：提议的变更（snake_case） ===== */

/** 仓库允许的合并方式。是**仓库**的事实而不是某个变更的，所以单独一个接口。 */
export interface ForgeMergeOptions {
  /** 按提供顺序。**空 = forge 不肯说**（token 读得到变更但读不到仓库设置），此时只提供 `merge` 一种。 */
  methods: ForgeMergeMethod[]
  default_method: ForgeMergeMethod
  merge_strategy: ForgeMergeStrategy
}

/** 一个 CI 检查项。 */
export interface ForgeCheck {
  id: string
  name: string
  state: ForgeCheckState
  summary: string | null
  url: string | null
  /** 失败是否允许不阻塞（GitLab 的 `allow_failure`；GitHub 没有对应概念，恒 false）。 */
  allow_failure: boolean
}

/**
 * 变更的检查项，以及**答案有多完整**。
 *
 * `available: false` **不是**「没有检查项」，是「forge 不肯告诉我们」（token 缺
 * `checks:read`、GitLab 关了 CI）。`available: true` 加空列表才是「forge 答了，
 * 什么都没配」。压平两者会在一个流水线是红的仓库上印出「没有检查」。
 *
 * `partial` 是同一区别下一层：GitHub 把检查项放在**两个**集合后面各带一份细粒度
 * 权限，只有其中一个可读时会拿到一半。
 */
export interface ForgeCheckList {
  checks: ForgeCheck[]
  available: boolean
  partial: boolean
}

/** 一个提议的变更：连接哪两个分支、多大、能不能落地。每个计数都可为 null（两个 forge 各答一半）。 */
export interface ForgeChangeDetail {
  number: number
  /** 会落到哪里。 */
  base_ref: string
  /** 会落进去的是什么。 */
  head_ref: string
  /** head 的 `owner/repo`，**仅当它不是本仓库**（fork）时才有值。 */
  head_repo: string | null
  head_sha: string | null
  draft: boolean
  state: string
  /**
   * `null` 是**真实的第三种答案**，与 `false` 不同：GitHub 异步计算可合并性，
   * 算完之前答 `null`；GitLab 同理报 `merge_status: "unchecked"`。
   * 「还不知道」是要说的话；「不能合并」是一个会让人去找一个可能不存在的冲突的断言。
   */
  mergeable: boolean | null
  /** forge 自己的措辞（`clean` / `dirty` / `blocked` / `behind` / …），只作 tooltip，**不翻译** —— 两套词汇对不上，错的翻译读起来像诊断。 */
  merge_state: string | null
  additions: number | null
  deletions: number | null
  changed_files: number | null
  commits: number | null
  checks: ForgeCheckList
}

/** 变更触到的一个文件。 */
export interface ForgeChangedFile {
  /** 变更**之后**的路径（删除时是旧路径）。 */
  path: string
  /** 重命名的来源；否则 null。 */
  previous_path: string | null
  status: ForgeFileStatus
  /** `null` = forge 不计数（GitLab 只给 diff 文本，二进制文件两边都没有行数）。 */
  additions: number | null
  deletions: number | null
  binary: boolean
  /**
   * 文件自己的统一 diff，随文件列表白送（两个 forge 本来就一起发）。
   * `null` 覆盖两种都意味着「没有 diff 可看」的情形：二进制内容，以及 forge
   * **扣留**了 diff（GitHub 在超过自己的大小限制时省掉 patch 但仍报行数）。
   * 两者都不是「diff 是空的」—— 这就是它不是 `string` 的原因。
   */
  patch: string | null
}

/** 一页文件列表。 */
export interface ForgeChangedFileList {
  files: ForgeChangedFile[]
  page: number
  per_page: number
  has_next: boolean
}

/* ===== 请求 DTO（camelCase！） ===== */

/**
 * 列表请求里**客户端能决定的全部**。仓库故意不在这里，也不可能在这里 ——
 * 后端从文件夹自己的 origin 远端派生。
 */
export interface ForgeListFilters {
  tab: ForgeTab
  state: ForgeStateFilter
  assignedMe: boolean
  /** 标签名，两个 forge 都是 AND 语义。 */
  labels: string[]
  search: string | null
  sort: ForgeSort
  page: number
  perPage: number
  /** 用哪个已存账号。**是鉴权不是筛选**，由命令层消费，永不到达 provider client。 */
  accountId: string | null
}

/**
 * 计数请求可以被什么收窄。
 *
 * 故意**不是** `ForgeListFilters`：计数没有 tab、没有页、没有排序，带三个服务端
 * 有义务忽略的字段正是客户端误以为自己设了它们的由来。
 */
export interface ForgeCountFilters {
  state: ForgeStateFilter
  assignedMe: boolean
  labels: string[]
  search: string | null
  accountId: string | null
}

/** 讨论请求。 */
export interface ForgeCommentFilters {
  kind: ForgeItemKind
  number: number
  page: number
  perPage: number
  accountId: string | null
}

/** 要发的评论。 */
export interface ForgeCommentDraft {
  kind: ForgeItemKind
  number: number
  body: string
  accountId: string | null
}

/** 状态变更请求。 */
export interface ForgeStateChangeRequest {
  kind: ForgeItemKind
  number: number
  action: ForgeStateAction
  accountId: string | null
}

/** 要开的 issue。 */
export interface ForgeNewIssueDraft {
  title: string
  body: string | null
  labels: string[]
  accountId: string | null
}

/** 问某个变更的详情。 */
export interface ForgeChangeQuery {
  number: number
  accountId: string | null
}

/** 问某个变更的一页文件。 */
export interface ForgeChangeFilesQuery {
  number: number
  page: number
  perPage: number
  accountId: string | null
}

/**
 * 合并请求。没有 `kind` —— 只有提议的变更能被合并。
 *
 * `headSha` 是调用方**当时正在看**的那个提交。两个 forge 都把它当前置条件，
 * 分支动过就以 409 拒绝 —— 这正是要它的原因：面板是拿着一份 diff、一份文件表
 * 和一组检查项（都在描述同一个提交）做的决定，一次静默落地了更新提交的合并
 * 会把那段对话里没人看过的代码合进去。
 */
export interface ForgeMergeChangeRequest {
  number: number
  method: ForgeMergeMethod
  headSha: string | null
  accountId: string | null
}

/* ===== 处理成 work task（请求，但是 snake_case！） ===== */

/** 被触发工作项的坐标。 */
export interface ForgeTaskSourceInput {
  kind: ForgeItemKind
  /** 客户端**认为**这个主机是什么。会与服务端自己的推导对账，不一致说明面板在看过期的账号设置。 */
  provider: ForgeProviderId
  server_host: string
  account_id: string | null
  owner_repo: string
  number: number
}

/** 触发时的工作项快照，进 untrusted-data 信封。 */
export interface ForgeSnapshotInput {
  title: string
  body: string | null
  labels: string[]
  author: string | null
}

/**
 * 触发载荷。**snake_case** —— `commands/forge.rs` 的 `ForgeTaskDraft` 没有 rename。
 * 这是整套 API 里最容易写错的一处。
 */
export interface ForgeTaskDraft {
  folder_id: number
  source: ForgeTaskSourceInput
  snapshot: ForgeSnapshotInput
  /** 场景**名**，`null` 回退到该 kind 的默认（issue → fix，PR → review_fix）。 */
  scenario: ForgeScenarioId | null
  instruction: string | null
  /**
   * 完成后回写评论。**缺失 ≠ 默认值** —— 服务端把缺失读作「静默」，
   * 因为一个没带这个字段的请求来自从未展示过这个问题的客户端。所以总要显式送。
   */
  writeback: boolean | null
  agent_type: string | null
  /** 故意为同一个工作项再开一个活动任务。 */
  force: boolean
}

/** 一条反查行：某个 source key 最新的那个任务（任何状态）。 */
export interface ForgeTaskLink {
  source_key: string
  task_id: number
  status: string
  verdict: string | null
  updated_at: string
}

/** 触发结果。dedup 命中与文件夹/仓库不匹配都是**答案**，不是错误。 */
export type ForgeCreateResult =
  | { outcome: "created"; task: Record<string, any> }
  | { outcome: "duplicate"; existing: Record<string, any> }
  | { outcome: "folder_mismatch"; folder_remote: ForgeRemote | null }

/* ===== 面板设置（双向 snake_case） ===== */

/** 一个作用域的面板设置。 */
export interface ForgePanelSettings {
  /** 触发弹层给 ISSUE 预选的场景，`null` = 内置默认。由**弹层**读，触发请求总是显式带场景。 */
  default_issue_scenario: ForgeScenarioId | null
  default_pr_scenario: ForgeScenarioId | null
  /** 「完成后回写评论」开关的**初始**状态。 */
  writeback_default: boolean
  /** 常驻提示词，按场景名 + 保留键 `all`（每个场景都拼）。未知键保留并忽略。 */
  scenario_prompts: Record<string, string>
}

/**
 * 所有作用域一次给全。
 *
 * 覆盖是**整份替换**不是逐字段合并 —— 一个文件夹保存了自己的设置就完全脱离全局行。
 * `folders` 里没有条目 = 跟随全局（缺席**就是**答案，所以没有第三个状态要同步）。
 * JSON 没有整数键，所以 folder id 到了 TS 是字符串。
 */
export interface ForgeSettingsStore {
  global: ForgePanelSettings
  folders: Record<string, ForgePanelSettings>
}

/** 保留的 `scenario_prompts` 键，对每个场景都生效。 */
export const FORGE_SCENARIO_PROMPT_ALL = "all"

/* ===== 校验上限（镜像 Rust 常量，前端提前拦以免白花一次请求） ===== */

/** `forge/mod.rs` BODY_CAP。 */
export const FORGE_BODY_CAP = 16_000
/** `forge/mod.rs` MIN/MAX/DEFAULT_PER_PAGE。 */
export const FORGE_MIN_PER_PAGE = 1
export const FORGE_MAX_PER_PAGE = 100
export const FORGE_DEFAULT_PER_PAGE = 20
/** GitHub 把整个 `q` 限制在 256 字符，限定符已经吃掉一些，更长的搜索会变成 422。 */
export const FORGE_MAX_SEARCH_CHARS = 128
/** 两个 forge 都 AND，超过一把结果集本就是空的，而且每个都在拉长 GitHub 的 `q`。 */
export const FORGE_MAX_LABEL_FILTERS = 10
/** 新建 issue 时最多打几个标签。 */
export const FORGE_MAX_ISSUE_LABELS = 50
/** 一次拉多少标签（两个 forge 的每页上限）。 */
export const FORGE_LABEL_PAGE_SIZE = 100
/** 评论每页。比列表页小：讨论是读的不是扫的，每条可能是一屏 Markdown。 */
export const FORGE_DEFAULT_COMMENT_PER_PAGE = 20
/** GitHub 直接拒绝超过这个长度的评论，GitLab 上限一百万 —— 取小的那个才是两边都成立的天花板。 */
export const FORGE_MAX_COMMENT_CHARS = 65_536
/** GitHub 记录的 issue 标题上限，也舒服地低于 GitLab 的 255。 */
export const FORGE_MAX_TITLE_CHARS = 255
/** 文件每页。比评论页大：一行一个，审阅者要的是整个变更的形状。 */
export const FORGE_DEFAULT_FILES_PER_PAGE = 50
/** 单条常驻提示词的上限。 */
export const FORGE_PROMPT_CAP = 4000
