import type { CodegGateway } from "@/services/gateway"
import type {
  ForgeChangeDetail,
  ForgeChangedFile,
  ForgeChangedFileList,
  ForgeChangeFilesQuery,
  ForgeChangeQuery,
  ForgeCheck,
  ForgeCheckList,
  ForgeComment,
  ForgeCommentDraft,
  ForgeCommentFilters,
  ForgeCommentList,
  ForgeCountFilters,
  ForgeIdentity,
  ForgeIssueList,
  ForgeIssueRow,
  ForgeLabel,
  ForgeLabelList,
  ForgeListFilters,
  ForgeMergeChangeRequest,
  ForgeMergeMethod,
  ForgeMergeOptions,
  ForgeNewIssueDraft,
  ForgeRemote,
  ForgeStateChangeRequest,
  ForgeTab,
} from "@/types/forge"

/**
 * codeg 仓库面板（`forge_*`）命令的**唯一**封装层。
 *
 * 与 `services/workTask.ts` 同一套写法：每个导出都是一层薄封装
 * `gateway.call<T>("<snake_case_command>", payload)`，加上一个把非法行退化成
 * `null` 的 `normalize*`。**不走 `api/acp.ts`** —— 那个单例默认打到全局 auth
 * store 的网关，而仓库面板是按连接 + 按项目的，必须显式带 gateway 参数。
 *
 * **三层命名规则，逐字照抄不要统一**（见 `types/forge.ts` 文件头）：
 * 外层 param camelCase（`folderId` / `accountId`），请求 DTO 也是 camelCase
 * （`assignedMe` / `perPage`），**响应全是 snake_case**（`author_avatar` /
 * `total_count`）。
 *
 * **信任边界**：客户端只给坐标（folderId、number），仓库/URL/api_base/账号身份/
 * source key/提示词全部由服务端从文件夹自己的 origin 远端派生。这就是为什么
 * `ForgeListFilters` 里没有仓库字段 —— 不是忘了，是不能有。
 *
 * 参考：`codeg-plus/src-tauri/src/web/handlers/forge.rs`、`commands/forge.rs`。
 */

/* ===== 仓库解析 ===== */

/**
 * 文件夹的 `origin` 远端解析成 forge 坐标。
 *
 * `null` = 没有 origin，或它的地址不是可识别的 forge 仓库路径。这**不是错误**，
 * 是三种前置状态之一（另两种是 `supported === false` 与「没有账号」）。
 *
 * 服务端要 fork 一个 `git remote get-url origin` 子进程，所以**一个项目只探一次**，
 * 切项目才重探。不要在下拉刷新或事件里重探。
 */
export async function fetchForgeRemote(
  gateway: CodegGateway,
  folderId: number
): Promise<ForgeRemote | null> {
  const raw = await gateway.call<unknown>("folder_forge_remote", { folderId })
  return normalizeForgeRemote(raw)
}

/* ===== 列表 ===== */

/**
 * 一页 issue 或 PR。
 *
 * 配额纪律：GitHub 走的是 `/search/issues`，**30 次/分钟**。所以搜索必须防抖，
 * 切 tab 不能重拉（隐藏 tab 的计数单独缓存），标签只在切仓库时拉一次。
 */
export async function listForgeIssues(
  gateway: CodegGateway,
  folderId: number,
  query: ForgeListFilters
): Promise<ForgeIssueList> {
  const raw = await gateway.call<unknown>("forge_list_issues", {
    folderId,
    // 逐字段列出而不是把 query 整个丢过去：这里是线上契约的落点，
    // 多送一个服务端不认的字段会被 serde 静默忽略，少送一个才会出事。
    query: {
      tab: query.tab,
      state: query.state,
      assignedMe: query.assignedMe,
      labels: query.labels,
      search: query.search,
      sort: query.sort,
      page: query.page,
      perPage: query.perPage,
      accountId: query.accountId,
    },
  })
  return normalizeForgeIssueList(raw, query)
}

/**
 * 另一个 tab 的数量。
 *
 * **只为不可见的那个 tab 调** —— 可见 tab 的数字搭在它自己的列表响应里
 * （`total_count`）。后端没有 count-only 端点，这个命令内部就是发一次 `perPage=1`
 * 的列表请求去读 `total_count` / `X-Total`，所以它和一次真实列表请求一样贵。
 *
 * 返回 `null` = forge 拒绝计数。**不要压成 0** —— 徽章的选择是「画一个对的数字」
 * 或者「不画」，画 0 是第三种，而它是错的。
 */
export async function fetchForgeTabCount(
  gateway: CodegGateway,
  folderId: number,
  tab: ForgeTab,
  filters: ForgeCountFilters
): Promise<number | null> {
  const raw = await gateway.call<unknown>("forge_tab_count", {
    folderId,
    tab,
    // 逐字段列出：`CountFilters` 故意没有 tab / page / sort，多送的字段会被服务端
    // 忽略，而那正是客户端误以为自己设了它们的由来。
    filters: {
      state: filters.state,
      assignedMe: filters.assignedMe,
      labels: filters.labels,
      search: filters.search,
      accountId: filters.accountId,
    },
  })
  return toInt(raw)
}

/**
 * 仓库的标签词汇表。
 *
 * 一页 100 个（两个 forge 的每页上限），`truncated` 说明还有更多。**只在切仓库时
 * 拉一次**并缓存 —— 标签是仓库级别的事实，不随筛选变化。
 *
 * 注意这个 param 是**扁平**的（`{folderId, accountId}`），不像列表那样嵌在
 * `query` 里 —— 它没有可供客户端决定的筛选，只有一个鉴权字段。
 */
export async function listForgeLabels(
  gateway: CodegGateway,
  folderId: number,
  accountId: string | null = null
): Promise<ForgeLabelList> {
  const raw = await gateway.call<unknown>("forge_list_labels", { folderId, accountId })
  return normalizeForgeLabelList(raw)
}

/* ===== 讨论 ===== */

/**
 * 一页讨论。
 *
 * 「人类评论」是全部的选择规则，且在两个 forge 上都不便宜：GitHub 把 review comment
 * （锚在 diff 行上的）放在完全另一个端点，GitLab 把系统事件（「改了里程碑」）混在同一个
 * `notes` 集合里。后端两边都落到条目自己 `comments` 计数描述的那个集合上，所以详情页
 * 头部的数字与下面的线程不会互相矛盾。
 *
 * 分页靠 `has_next`（来自 forge 的分页头）而**不是**「这一页满了没」—— GitLab 本地丢掉
 * 系统事件，一页可能一条人写的都不剩而讨论还在下一页。
 */
export async function listForgeComments(
  gateway: CodegGateway,
  folderId: number,
  filters: ForgeCommentFilters
): Promise<ForgeCommentList> {
  const raw = await gateway.call<unknown>("forge_list_comments", {
    folderId,
    // 键名是 `filters` 而不是 `query` —— 与 `forge_list_issues` 不同，这是服务端
    // param struct 的字面名字（`ListCommentsParams.filters`），照抄。
    filters: {
      kind: filters.kind,
      number: filters.number,
      page: filters.page,
      perPage: filters.perPage,
      accountId: filters.accountId,
    },
  })
  return normalizeForgeCommentList(raw, filters)
}

/**
 * 发一条评论，拿回 forge 存下来的那一条。
 *
 * **永不重试。** 重试一次 POST 就是发两遍评论，而别人在读的线程不是「大约发一次」
 * 可以接受的地方 —— 网关层没有自动重试，UI 也不能给「失败了？再点一次」的诱导。
 */
export async function createForgeComment(
  gateway: CodegGateway,
  folderId: number,
  draft: ForgeCommentDraft
): Promise<ForgeComment | null> {
  const raw = await gateway.call<unknown>("forge_create_comment", {
    folderId,
    draft: {
      kind: draft.kind,
      number: draft.number,
      body: draft.body,
      accountId: draft.accountId,
    },
  })
  return normalizeForgeComment(raw)
}

/* ===== 写：状态与新建 ===== */

/**
 * 关闭 / 重新打开一个条目，拿回 forge 现在提供的那一行。
 *
 * **返回的行是权威的**，不要本地翻转 `state`：一个刚在浏览器里被合并的 PR 会以
 * `merged` 回来，而本地翻转只会得到 `closed`（GitHub 没有 merged 状态，它是后端从
 * `merged_at` 派生的）。
 */
export async function setForgeItemState(
  gateway: CodegGateway,
  folderId: number,
  request: ForgeStateChangeRequest
): Promise<ForgeIssueRow | null> {
  const raw = await gateway.call<unknown>("forge_set_item_state", {
    folderId,
    request: {
      kind: request.kind,
      number: request.number,
      action: request.action,
      accountId: request.accountId,
    },
  })
  return normalizeForgeIssueRow(raw)
}

/** 在这个仓库开一个新 issue。仓库同样由服务端从文件夹的 origin 派生。 */
export async function createForgeIssue(
  gateway: CodegGateway,
  folderId: number,
  draft: ForgeNewIssueDraft
): Promise<ForgeIssueRow | null> {
  const raw = await gateway.call<unknown>("forge_create_issue", {
    folderId,
    draft: {
      title: draft.title,
      body: draft.body,
      labels: draft.labels,
      accountId: draft.accountId,
    },
  })
  return normalizeForgeIssueRow(raw)
}

/**
 * 对这个文件夹做写操作时会以谁的身份出去。
 *
 * 面板自己算不出来 —— 「哪个账号服务这个文件夹」是后端从 origin 远端的 host 加一个
 * 可选的钉住 `account_id` 决定的，所以一个显示「默认账号」的 UI 会对每个不在默认
 * 账号上的文件夹说错人名。
 *
 * 本地解析，不花 forge 请求；`accountId` 是**扁平** param（与标签一样）。
 */
export async function fetchForgeIdentity(
  gateway: CodegGateway,
  folderId: number,
  accountId: string | null = null
): Promise<ForgeIdentity | null> {
  const raw = await gateway.call<unknown>("forge_identity", { folderId, accountId })
  const record = normalizeRecord(raw)
  const username = pickString(record?.username)
  if (!username) return null
  return {
    username,
    avatar_url: pickString(record?.avatar_url, record?.avatarUrl) || null,
  }
}

/* ===== 提议的变更（只有 PR 有） ===== */

/**
 * 一个变更的分支对、规模、可合并性与 CI。
 *
 * 只在**打开一个 PR 的详情**时问 —— 一页列表有三十行，每行都问一次是三十次请求换
 * 用户不会读的信息。
 */
export async function fetchForgeChangeDetail(
  gateway: CodegGateway,
  folderId: number,
  query: ForgeChangeQuery
): Promise<ForgeChangeDetail | null> {
  const raw = await gateway.call<unknown>("forge_change_detail", {
    folderId,
    query: { number: query.number, accountId: query.accountId },
  })
  return normalizeForgeChangeDetail(raw)
}

/**
 * 一页改动文件。
 *
 * `patch` 随列表白送（两个 forge 本来就一起发），所以内联展开 diff 不额外花请求。
 */
export async function listForgeChangeFiles(
  gateway: CodegGateway,
  folderId: number,
  query: ForgeChangeFilesQuery
): Promise<ForgeChangedFileList> {
  const raw = await gateway.call<unknown>("forge_change_files", {
    folderId,
    query: {
      number: query.number,
      page: query.page,
      perPage: query.perPage,
      accountId: query.accountId,
    },
  })
  return normalizeForgeChangedFileList(raw, query)
}

/**
 * 这个仓库允许哪些合并方式。
 *
 * 是**仓库**的事实而不是某个变更的，所以是独立的一次请求 —— 折进 detail 会让每个
 * 只为读而打开的变更都白花一次。只在要画合并按钮时问。
 */
export async function fetchForgeMergeOptions(
  gateway: CodegGateway,
  folderId: number,
  accountId: string | null = null
): Promise<ForgeMergeOptions> {
  const raw = await gateway.call<unknown>("forge_merge_options", { folderId, accountId })
  return normalizeForgeMergeOptions(raw)
}

/**
 * 合并一个变更，拿回 forge 现在提供的那一行。
 *
 * ## 两个不能压平的语义
 *
 * **返回 `null` 意味着「合并成功了但回读那一行失败」**，不是失败：GitHub 的合并响应
 * 不包含 PR 本身，所以那一行要花第二次请求，而它可以独立失败。把它报成失败会让人
 * 去把一个不可逆的操作再做一遍。
 *
 * **`headSha` 必须是打开确认弹层那一刻捕获的值**，不能在确认时重读：面板是拿着一份
 * diff、一份文件表和一组检查项（都在描述同一个提交）做的决定，两个 forge 都把这个值
 * 当前置条件并在分支动过时以 409 拒绝 —— 那正是要它的原因。
 */
export async function mergeForgeChange(
  gateway: CodegGateway,
  folderId: number,
  request: ForgeMergeChangeRequest
): Promise<ForgeIssueRow | null> {
  const raw = await gateway.call<unknown>("forge_merge_change", {
    folderId,
    request: {
      number: request.number,
      method: request.method,
      headSha: request.headSha,
      accountId: request.accountId,
    },
  })
  return normalizeForgeIssueRow(raw)
}

/* ===== 归一化 ===== */

/** 远端。缺 host 或 repo 就没有坐标，整条退化成 null（等同「不是 forge 仓库」）。 */
export function normalizeForgeRemote(input: unknown): ForgeRemote | null {
  const raw = normalizeRecord(input)
  if (!raw) return null
  const serverHost = pickString(raw.server_host, raw.serverHost)
  const ownerRepo = pickString(raw.owner_repo, raw.ownerRepo)
  if (!serverHost || !ownerRepo) return null
  const provider = pickString(raw.provider) === "gitlab" ? "gitlab" : "github"
  return {
    server_host: serverHost,
    owner_repo: ownerRepo,
    remote_url: pickString(raw.remote_url, raw.remoteUrl),
    provider,
    // 缺字段时按**支持**处理：老服务端没有这个字段，藏起功能比让请求自己报错更糟。
    supported: raw.supported === undefined ? true : Boolean(raw.supported),
  }
}

/** 一个标签。空名字的标签是一颗点不了也筛不了的空胶囊，丢掉。 */
export function normalizeForgeLabel(input: unknown): ForgeLabel | null {
  if (typeof input === "string") {
    const name = input.trim()
    return name ? { name, color: null } : null
  }
  const raw = normalizeRecord(input)
  if (!raw) return null
  const name = pickString(raw.name)
  if (!name) return null
  return { name, color: pickString(raw.color) || null }
}

/** 标签词汇表。`truncated` 缺失按 false —— 它只影响一行提示文案。 */
export function normalizeForgeLabelList(input: unknown): ForgeLabelList {
  const raw = normalizeRecord(input)
  const labels = normalizeList(raw?.labels ?? input)
    .map(normalizeForgeLabel)
    .filter((item): item is ForgeLabel => Boolean(item))
  return { labels, truncated: Boolean(raw?.truncated) }
}

/**
 * 一行。`number` 非法即丢弃 —— 后面每个动作（读详情、开关、合并、触发任务）
 * 都拿它当主键，没有 number 的行在 UI 上只是一张点不动的卡片。
 *
 * `state` **不做白名单校验**：服务端可能新增状态，未知值原样透传由展示层退化成
 * 通用样式。硬校验会让新状态整行消失。
 */
export function normalizeForgeIssueRow(input: unknown): ForgeIssueRow | null {
  const raw = normalizeRecord(input)
  if (!raw) return null
  const number = toInt(raw.number)
  if (!number || number <= 0) return null
  return {
    number,
    title: pickString(raw.title) || `#${number}`,
    body: pickString(raw.body) || null,
    state: pickString(raw.state) || "open",
    draft: Boolean(raw.draft),
    labels: normalizeList(raw.labels)
      .map(normalizeForgeLabel)
      .filter((item): item is ForgeLabel => Boolean(item)),
    author: pickString(raw.author) || null,
    author_avatar: pickString(raw.author_avatar, raw.authorAvatar) || null,
    updated_at: pickString(raw.updated_at, raw.updatedAt) || null,
    html_url: pickString(raw.html_url, raw.htmlUrl),
    is_pr: Boolean(raw.is_pr ?? raw.isPr),
    // 用 `??` 而不是 `||`：0 条评论与「读不到」在这里都画成不显示，但计数本身要准。
    comments: toInt(raw.comments) ?? 0,
  }
}

/**
 * 一页列表。
 *
 * 三个可空字段**必须保留 null**，压成 0 / false 各自对应一个具体的错误显示：
 * - `total_count: null` → 「该仓库不提供计数」，压成 0 会写「共 0 条」而列表里明明有行；
 * - `reachable_count: null` → 全部可翻，压成 0 会让分页立刻停在第一页；
 * - `incomplete` → 计数不可信，徽章必须消失。
 *
 * `page` / `per_page` 是服务端 clamp 后的回显；缺失时回落到请求值而不是 1/20 ——
 * 分页游标要跟着实际服务的那一页走。
 */
export function normalizeForgeIssueList(
  input: unknown,
  query?: Pick<ForgeListFilters, "page" | "perPage">
): ForgeIssueList {
  const raw = normalizeRecord(input)
  const rows = normalizeList(raw?.rows ?? input)
    .map(normalizeForgeIssueRow)
    .filter((item): item is ForgeIssueRow => Boolean(item))
  return {
    rows,
    page: toInt(raw?.page) ?? query?.page ?? 1,
    per_page: toInt(raw?.per_page ?? raw?.perPage) ?? query?.perPage ?? 20,
    total_count: toInt(raw?.total_count ?? raw?.totalCount),
    reachable_count: toInt(raw?.reachable_count ?? raw?.reachableCount),
    has_next: Boolean(raw?.has_next ?? raw?.hasNext),
    incomplete: Boolean(raw?.incomplete),
  }
}

/**
 * 一条评论。
 *
 * `id` 缺失即丢弃：它是渲染 key 与跨页去重的唯一依据，没有 id 的评论会在加载下一页
 * 时重复出现。
 *
 * `updated_at` **只在 forge 说它与 created_at 不同时才有** —— 后端已经过滤过
 * （两个 forge 创建时也盖这个戳，原样透传会让每条评论都标成「已编辑」），这里不再
 * 二次判断，只是原样接。
 */
export function normalizeForgeComment(input: unknown): ForgeComment | null {
  const raw = normalizeRecord(input)
  if (!raw) return null
  const id = pickString(raw.id) || (typeof raw.id === "number" ? String(raw.id) : "")
  if (!id) return null
  return {
    id,
    author: pickString(raw.author) || null,
    author_avatar: pickString(raw.author_avatar, raw.authorAvatar) || null,
    body: typeof raw.body === "string" ? raw.body : "",
    created_at: pickString(raw.created_at, raw.createdAt) || null,
    updated_at: pickString(raw.updated_at, raw.updatedAt) || null,
    html_url: pickString(raw.html_url, raw.htmlUrl) || null,
  }
}

/**
 * 一页讨论。
 *
 * `has_next` 来自 forge 的分页头，**不能**从 `comments.length >= per_page` 推 ——
 * GitLab 本地丢掉系统事件，一页可能一条人写的都不剩而讨论还在下一页。
 */
export function normalizeForgeCommentList(
  input: unknown,
  filters?: Pick<ForgeCommentFilters, "page" | "perPage">
): ForgeCommentList {
  const raw = normalizeRecord(input)
  const comments = normalizeList(raw?.comments ?? input)
    .map(normalizeForgeComment)
    .filter((item): item is ForgeComment => Boolean(item))
  return {
    comments,
    page: toInt(raw?.page) ?? filters?.page ?? 1,
    per_page: toInt(raw?.per_page ?? raw?.perPage) ?? filters?.perPage ?? 20,
    has_next: Boolean(raw?.has_next ?? raw?.hasNext),
  }
}

/**
 * 一个检查项。
 *
 * `state` 走白名单：五个值是后端从三套词汇（GitHub 的 status×conclusion、legacy
 * commit-status、GitLab 的 job status）折出来的，未知值只能是脏数据。落到 `neutral`
 * 而不是 `success` —— 「跑了但没结论」比「通过」保守，而把一个未知状态画成绿色正是
 * 让红色流水线读起来是绿的那个错误。
 */
export function normalizeForgeCheck(input: unknown): ForgeCheck | null {
  const raw = normalizeRecord(input)
  if (!raw) return null
  const name = pickString(raw.name)
  if (!name) return null
  const state = pickString(raw.state)
  return {
    id: pickString(raw.id) || name,
    name,
    state:
      state === "queued" ||
      state === "running" ||
      state === "success" ||
      state === "failure" ||
      state === "neutral"
        ? state
        : "neutral",
    summary: pickString(raw.summary) || null,
    url: pickString(raw.url) || null,
    allow_failure: Boolean(raw.allow_failure ?? raw.allowFailure),
  }
}

/**
 * 检查项列表。
 *
 * `available` **缺失按 false**（「读不到」）而不是 true：这是唯一安全的方向 ——
 * 把「读不到」当成「答了，什么都没配」会在一个流水线是红的仓库上印出「没有检查」。
 * 老服务端不带这个字段的情况不存在（它和检查项功能一起发布），所以缺失只能是脏数据。
 *
 * `partial` 在 `available` 为 false 时强制 false：没有部分答案可以限定。
 */
export function normalizeForgeCheckList(input: unknown): ForgeCheckList {
  const raw = normalizeRecord(input)
  const checks = normalizeList(raw?.checks ?? input)
    .map(normalizeForgeCheck)
    .filter((item): item is ForgeCheck => Boolean(item))
  const available = Boolean(raw?.available)
  return { checks, available, partial: available ? Boolean(raw?.partial) : false }
}

/**
 * 一个变更的详情。
 *
 * **每个计数都保留 null**：GitHub 的 pull 对象带 additions/deletions/changed_files/
 * commits，GitLab 的 merge request 一个都不带（只有时候一个字符串化的 `changes_count`）。
 * 在 forge 什么都没说的地方印一个 0 是在断言「这个变更什么都没碰」。
 *
 * `mergeable` 的 null 是**真实的第三种答案**（两个 forge 都异步计算），不是 false。
 */
export function normalizeForgeChangeDetail(input: unknown): ForgeChangeDetail | null {
  const raw = normalizeRecord(input)
  if (!raw) return null
  const number = toInt(raw.number)
  if (!number || number <= 0) return null
  return {
    number,
    base_ref: pickString(raw.base_ref, raw.baseRef),
    head_ref: pickString(raw.head_ref, raw.headRef),
    head_repo: pickString(raw.head_repo, raw.headRepo) || null,
    head_sha: pickString(raw.head_sha, raw.headSha) || null,
    draft: Boolean(raw.draft),
    state: pickString(raw.state) || "open",
    // `?? null` 而不是 `Boolean(...)`：undefined 与 false 在这里是两种答案。
    mergeable: typeof raw.mergeable === "boolean" ? raw.mergeable : null,
    merge_state: pickString(raw.merge_state, raw.mergeState) || null,
    additions: toInt(raw.additions),
    deletions: toInt(raw.deletions),
    changed_files: toInt(raw.changed_files ?? raw.changedFiles),
    commits: toInt(raw.commits),
    checks: normalizeForgeCheckList(raw.checks),
  }
}

/**
 * 一个改动文件。
 *
 * `status` 走白名单并落到 `modified`：四个值是后端归一化过的，未知值只能是脏数据，
 * 而 `modified` 是唯一不会误导的兜底（`added` / `removed` 都在断言一件没发生的事）。
 *
 * `patch` 的 null **覆盖两种情形**（二进制内容 / forge 因过大扣留了 diff），两者都
 * 意味着「没有 diff 可看」但都不是「diff 是空的」—— 所以展开按钮在这两种下都不该给。
 */
export function normalizeForgeChangedFile(input: unknown): ForgeChangedFile | null {
  const raw = normalizeRecord(input)
  if (!raw) return null
  const path = pickString(raw.path)
  if (!path) return null
  const status = pickString(raw.status)
  return {
    path,
    previous_path: pickString(raw.previous_path, raw.previousPath) || null,
    status:
      status === "added" || status === "removed" || status === "renamed" ? status : "modified",
    additions: toInt(raw.additions),
    deletions: toInt(raw.deletions),
    binary: Boolean(raw.binary),
    patch: typeof raw.patch === "string" && raw.patch ? raw.patch : null,
  }
}

export function normalizeForgeChangedFileList(
  input: unknown,
  query?: Pick<ForgeChangeFilesQuery, "page" | "perPage">
): ForgeChangedFileList {
  const raw = normalizeRecord(input)
  const files = normalizeList(raw?.files ?? input)
    .map(normalizeForgeChangedFile)
    .filter((item): item is ForgeChangedFile => Boolean(item))
  return {
    files,
    page: toInt(raw?.page) ?? query?.page ?? 1,
    per_page: toInt(raw?.per_page ?? raw?.perPage) ?? query?.perPage ?? 50,
    has_next: Boolean(raw?.has_next ?? raw?.hasNext),
  }
}

/**
 * 合并方式。
 *
 * **空 `methods` 是「forge 不肯说」**（token 读得到变更但读不到仓库设置），此时只提供
 * `merge` 一种 —— 画三个菜单项而其中两个答 405 比只画一个更糟。这个兜底与后端的
 * `ForgeMergeOptions::unknown()` 一致。
 */
export function normalizeForgeMergeOptions(input: unknown): ForgeMergeOptions {
  const raw = normalizeRecord(input)
  const methods = normalizeList(raw?.methods)
    .map((value) => normalizeMergeMethod(value))
    .filter((value): value is ForgeMergeMethod => Boolean(value))
  const defaultMethod = normalizeMergeMethod(raw?.default_method ?? raw?.defaultMethod) || "merge"
  const strategy = pickString(raw?.merge_strategy, raw?.mergeStrategy)
  return {
    methods,
    // 默认方式必须是 methods 的成员（非空时）—— 一个选不中的默认值会让菜单打开时
    // 什么都没选上。
    default_method:
      methods.length === 0 || methods.includes(defaultMethod) ? defaultMethod : methods[0],
    merge_strategy:
      strategy === "rebase_merge" || strategy === "fast_forward" ? strategy : "merge_commit",
  }
}

function normalizeMergeMethod(value: unknown): ForgeMergeMethod | null {
  const method = typeof value === "string" ? value.trim() : ""
  return method === "merge" || method === "squash" || method === "rebase" ? method : null
}

/* ===== 小工具（与 services/workTask.ts 同形） ===== *//** 把「数组或包着数组的对象」摊平。只认 `data` 一种包装。 */
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

/**
 * 整数或 null。**0 必须保留** —— `total_count === 0`（真的没有匹配）与 `null`
 * （forge 拒绝计数）在摘要行里是两句完全不同的话。
 */
function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return Math.trunc(parsed)
  }
  return null
}
