import {
  createForgeComment,
  createForgeIssue,
  fetchForgeChangeDetail,
  fetchForgeIdentity,
  fetchForgeMergeOptions,
  fetchForgeRemote,
  fetchForgeTabCount,
  listForgeChangeFiles,
  listForgeComments,
  listForgeIssues,
  listForgeLabels,
  mergeForgeChange,
  normalizeForgeChangeDetail,
  normalizeForgeChangedFile,
  normalizeForgeChangedFileList,
  normalizeForgeCheck,
  normalizeForgeCheckList,
  normalizeForgeComment,
  normalizeForgeCommentList,
  normalizeForgeIssueList,
  normalizeForgeIssueRow,
  normalizeForgeLabel,
  normalizeForgeLabelList,
  normalizeForgeMergeOptions,
  normalizeForgeRemote,
  setForgeItemState,
} from "@/services/forge/forgeApi"
import type { CodegGateway } from "@/services/gateway"

/** 记录每次 `gateway.call`，让每个封装的 command 名与载荷成为被断言的契约。 */
function makeGateway(result: unknown = null) {
  const calls: Array<{ command: string; payload: any }> = []
  const gateway = {
    mode: "direct" as const,
    async pair() {
      return null
    },
    async call(command: string, payload?: Record<string, unknown>) {
      calls.push({ command, payload })
      return result as any
    },
    async connectEvents() {
      throw new Error("not used")
    },
    async refreshAuth() {},
    getRemoteInstanceDescriptor() {
      return { instanceKey: "test", mode: "direct" as const, baseUrl: "", principal: "" }
    },
  }
  return { gateway: gateway as unknown as CodegGateway, calls }
}

const BASE_QUERY = {
  tab: "issues" as const,
  state: "open" as const,
  assignedMe: false,
  labels: [] as string[],
  search: null,
  sort: "newest" as const,
  page: 1,
  perPage: 20,
  accountId: null,
}

describe("forge api commands", () => {
  it("asks for a folder's forge remote with a camelCase folderId", async () => {
    const { gateway, calls } = makeGateway(null)
    await fetchForgeRemote(gateway, 7)
    expect(calls).toEqual([{ command: "folder_forge_remote", payload: { folderId: 7 } }])
  })

  /**
   * 外层是 camelCase，**请求 DTO 内部也是 camelCase**（`assignedMe` / `perPage`），
   * 而响应是 snake_case。三层不同名，写错哪一层都是 serde 静默忽略后拿到默认值。
   */
  it("nests the list filters under `query` with camelCase field names", async () => {
    const { gateway, calls } = makeGateway({ rows: [] })
    await listForgeIssues(gateway, 3, {
      ...BASE_QUERY,
      tab: "prs",
      state: "all",
      assignedMe: true,
      labels: ["bug", "p1"],
      search: "crash",
      sort: "recently_updated",
      page: 2,
      perPage: 30,
      accountId: "acc-1",
    })
    expect(calls).toEqual([
      {
        command: "forge_list_issues",
        payload: {
          folderId: 3,
          query: {
            tab: "prs",
            state: "all",
            assignedMe: true,
            labels: ["bug", "p1"],
            search: "crash",
            sort: "recently_updated",
            page: 2,
            perPage: 30,
            accountId: "acc-1",
          },
        },
      },
    ])
  })

  /**
   * 仓库**不在** filters 里，也不可能在 —— 服务端从文件夹自己的 origin 远端派生。
   * 这条断言防的是「顺手把 ownerRepo 塞进 query 让服务端省一次 git 调用」。
   */
  it("never sends a repository in the list payload", async () => {
    const { gateway, calls } = makeGateway({ rows: [] })
    await listForgeIssues(gateway, 1, BASE_QUERY)
    const payload = JSON.stringify(calls[0].payload)
    expect(payload).not.toContain("ownerRepo")
    expect(payload).not.toContain("owner_repo")
    expect(payload).not.toContain("serverHost")
  })

  /**
   * 计数的 tab 是**独立参数**（问的就是「那个不可见的 tab」），而 filters 里故意
   * 没有 tab / page / sort —— 服务端有义务忽略它们，带着三个被忽略的字段正是客户端
   * 误以为自己设了它们的由来。
   */
  it("puts the tab beside the count filters rather than inside them", async () => {
    const { gateway, calls } = makeGateway(7)
    await fetchForgeTabCount(gateway, 3, "prs", {
      state: "all",
      assignedMe: true,
      labels: ["bug"],
      search: "crash",
      accountId: "acc-1",
    })
    expect(calls).toEqual([
      {
        command: "forge_tab_count",
        payload: {
          folderId: 3,
          tab: "prs",
          filters: {
            state: "all",
            assignedMe: true,
            labels: ["bug"],
            search: "crash",
            accountId: "acc-1",
          },
        },
      },
    ])
    expect(Object.keys(calls[0].payload.filters).sort()).not.toContain("tab")
  })

  /** `null` 是「forge 拒绝计数」。压成 0 会让徽章画出一个错的数字。 */
  it("keeps a refused count null instead of zero", async () => {
    const refused = makeGateway(null)
    await expect(
      fetchForgeTabCount(refused.gateway, 1, "issues", {
        state: "open",
        assignedMe: false,
        labels: [],
        search: null,
        accountId: null,
      })
    ).resolves.toBeNull()
  })

  it("keeps a genuine zero count", async () => {
    const zero = makeGateway(0)
    await expect(
      fetchForgeTabCount(zero.gateway, 1, "issues", {
        state: "open",
        assignedMe: false,
        labels: [],
        search: null,
        accountId: null,
      })
    ).resolves.toBe(0)
  })

  /** 标签的 param 是**扁平**的（没有可供客户端决定的筛选，只有一个鉴权字段）。 */
  it("sends a flat payload for the label vocabulary", async () => {
    const { gateway, calls } = makeGateway({ labels: [] })
    await listForgeLabels(gateway, 5)
    expect(calls).toEqual([
      { command: "forge_list_labels", payload: { folderId: 5, accountId: null } },
    ])
  })

  /**
   * 讨论的键名是 `filters` 而不是 `query` —— 与 `forge_list_issues` 不同。这是服务端
   * param struct 的字面名字（`ListCommentsParams.filters`），写错会让整个 body 反序列化
   * 失败。
   */
  it("nests the comment paging under `filters`, not `query`", async () => {
    const { gateway, calls } = makeGateway({ comments: [] })
    await listForgeComments(gateway, 3, {
      kind: "pr",
      number: 42,
      page: 2,
      perPage: 20,
      accountId: null,
    })
    expect(calls[0]).toEqual({
      command: "forge_list_comments",
      payload: {
        folderId: 3,
        filters: { kind: "pr", number: 42, page: 2, perPage: 20, accountId: null },
      },
    })
  })

  it("nests a comment draft under `draft`", async () => {
    const { gateway, calls } = makeGateway({ id: "1", body: "hi" })
    await createForgeComment(gateway, 3, {
      kind: "issue",
      number: 7,
      body: "hi",
      accountId: null,
    })
    expect(calls[0]).toEqual({
      command: "forge_create_comment",
      payload: { folderId: 3, draft: { kind: "issue", number: 7, body: "hi", accountId: null } },
    })
  })

  /** 状态变更是**动词**（close / reopen）而不是目标状态 —— 与 GitLab 的 API 一致。 */
  it("sends a state action as a verb", async () => {
    const { gateway, calls } = makeGateway({ number: 7 })
    await setForgeItemState(gateway, 3, {
      kind: "issue",
      number: 7,
      action: "close",
      accountId: null,
    })
    expect(calls[0]).toEqual({
      command: "forge_set_item_state",
      payload: {
        folderId: 3,
        request: { kind: "issue", number: 7, action: "close", accountId: null },
      },
    })
  })

  it("nests a new issue under `draft`", async () => {
    const { gateway, calls } = makeGateway({ number: 8 })
    await createForgeIssue(gateway, 3, {
      title: "Crash",
      body: null,
      labels: ["bug"],
      accountId: null,
    })
    expect(calls[0]).toEqual({
      command: "forge_create_issue",
      payload: {
        folderId: 3,
        draft: { title: "Crash", body: null, labels: ["bug"], accountId: null },
      },
    })
  })

  /** 身份的 param 也是扁平的（与标签一样）。 */
  it("sends a flat payload for the write identity", async () => {
    const { gateway, calls } = makeGateway({ username: "octocat", avatar_url: null })
    await expect(fetchForgeIdentity(gateway, 3)).resolves.toEqual({
      username: "octocat",
      avatar_url: null,
    })
    expect(calls[0]).toEqual({
      command: "forge_identity",
      payload: { folderId: 3, accountId: null },
    })
  })

  /** 没有用户名的身份没有可显示的东西 —— 退化成 null 让评论框少一行署名。 */
  it("degrades an identity with no username to null", async () => {
    await expect(fetchForgeIdentity(makeGateway({}).gateway, 3)).resolves.toBeNull()
    await expect(fetchForgeIdentity(makeGateway(null).gateway, 3)).resolves.toBeNull()
  })

  it("nests the change coordinates under `query`", async () => {
    const detail = makeGateway({ number: 42, checks: { available: true, checks: [] } })
    await fetchForgeChangeDetail(detail.gateway, 3, { number: 42, accountId: null })
    expect(detail.calls[0]).toEqual({
      command: "forge_change_detail",
      payload: { folderId: 3, query: { number: 42, accountId: null } },
    })

    const files = makeGateway({ files: [] })
    await listForgeChangeFiles(files.gateway, 3, {
      number: 42,
      page: 2,
      perPage: 50,
      accountId: null,
    })
    expect(files.calls[0]).toEqual({
      command: "forge_change_files",
      payload: { folderId: 3, query: { number: 42, page: 2, perPage: 50, accountId: null } },
    })
  })

  /** 合并方式是仓库级事实，param 与身份/标签一样是**扁平**的。 */
  it("sends a flat payload for the merge options", async () => {
    const { gateway, calls } = makeGateway({ methods: ["merge"], default_method: "merge" })
    await fetchForgeMergeOptions(gateway, 3)
    expect(calls[0]).toEqual({
      command: "forge_merge_options",
      payload: { folderId: 3, accountId: null },
    })
  })

  /**
   * `headSha` 必须原样送出 —— 两个 forge 都把它当前置条件并在分支动过时以 409 拒绝，
   * 那正是要它的原因。
   */
  it("forwards the captured head sha with a merge", async () => {
    const { gateway, calls } = makeGateway({ number: 42 })
    await mergeForgeChange(gateway, 3, {
      number: 42,
      method: "squash",
      headSha: "abc123",
      accountId: null,
    })
    expect(calls[0]).toEqual({
      command: "forge_merge_change",
      payload: {
        folderId: 3,
        request: { number: 42, method: "squash", headSha: "abc123", accountId: null },
      },
    })
  })

  /**
   * **返回 `null` 是「合并成功了但回读那一行失败」**，不是失败：GitHub 的合并响应不含
   * PR 本身，那一行要花第二次请求而它可以独立失败。这里只保证封装层把 null 传出去 ——
   * 报成失败会让人去把一个不可逆的操作再做一遍。
   */
  it("passes a null merge result through as success", async () => {
    const { gateway } = makeGateway(null)
    await expect(
      mergeForgeChange(gateway, 3, {
        number: 42,
        method: "merge",
        headSha: null,
        accountId: null,
      })
    ).resolves.toBeNull()
  })
})

describe("normalizeForgeRemote", () => {
  it("keeps the server-derived provider and repo path", () => {
    expect(
      normalizeForgeRemote({
        server_host: "gitlab.corp.com",
        owner_repo: "group/sub/app",
        remote_url: "https://gitlab.corp.com/group/sub/app.git",
        provider: "gitlab",
        supported: true,
      })
    ).toEqual({
      server_host: "gitlab.corp.com",
      owner_repo: "group/sub/app",
      remote_url: "https://gitlab.corp.com/group/sub/app.git",
      provider: "gitlab",
      supported: true,
    })
  })

  /** 没有坐标就没有可用的远端 —— 等同「这个项目不是 forge 仓库」那条前置状态。 */
  it("degrades to null when either coordinate is missing", () => {
    expect(normalizeForgeRemote(null)).toBeNull()
    expect(normalizeForgeRemote({ server_host: "github.com" })).toBeNull()
    expect(normalizeForgeRemote({ owner_repo: "a/b" })).toBeNull()
  })

  /** 未知 provider 落到 github：`gitlab` 是唯一需要区分的另一种，别的值只能是脏数据。 */
  it("falls back to github for an unrecognized provider", () => {
    const remote = normalizeForgeRemote({
      server_host: "github.com",
      owner_repo: "a/b",
      provider: "bitbucket",
    })
    expect(remote?.provider).toBe("github")
  })

  /** 缺 `supported` 按**支持**处理：老服务端没有这个字段，藏起功能比让请求自己报错更糟。 */
  it("treats a missing `supported` flag as supported", () => {
    const remote = normalizeForgeRemote({ server_host: "github.com", owner_repo: "a/b" })
    expect(remote?.supported).toBe(true)
  })

  it("respects an explicit unsupported host", () => {
    const remote = normalizeForgeRemote({
      server_host: "bitbucket.org",
      owner_repo: "a/b",
      supported: false,
    })
    expect(remote?.supported).toBe(false)
  })
})

describe("normalizeForgeLabel", () => {
  it("accepts both the object shape and a bare name", () => {
    expect(normalizeForgeLabel({ name: "bug", color: "#d73a4a" })).toEqual({
      name: "bug",
      color: "#d73a4a",
    })
    // 单条目响应（GitLab 的 close/reopen）只给标签名，不给颜色。
    expect(normalizeForgeLabel("bug")).toEqual({ name: "bug", color: null })
  })

  /** 空名字的标签是一颗点不了也筛不了的空胶囊。 */
  it("drops a label with no usable name", () => {
    expect(normalizeForgeLabel({ name: "   " })).toBeNull()
    expect(normalizeForgeLabel("")).toBeNull()
    expect(normalizeForgeLabel(null)).toBeNull()
  })

  /** 颜色缺失是 null 而不是空串 —— 展示层靠 null 走中性胶囊。 */
  it("normalizes a missing colour to null", () => {
    expect(normalizeForgeLabel({ name: "bug" })?.color).toBeNull()
    expect(normalizeForgeLabel({ name: "bug", color: "" })?.color).toBeNull()
  })
})

describe("normalizeForgeLabelList", () => {
  it("keeps the truncated flag", () => {
    expect(
      normalizeForgeLabelList({ labels: [{ name: "bug" }], truncated: true })
    ).toEqual({ labels: [{ name: "bug", color: null }], truncated: true })
  })

  it("tolerates a bare array", () => {
    expect(normalizeForgeLabelList([{ name: "bug" }])).toEqual({
      labels: [{ name: "bug", color: null }],
      truncated: false,
    })
  })
})

describe("normalizeForgeIssueRow", () => {
  it("carries every field the row renders", () => {
    expect(
      normalizeForgeIssueRow({
        number: 42,
        title: "Crash on save",
        body: "steps",
        state: "open",
        draft: false,
        labels: [{ name: "bug", color: "d73a4a" }],
        author: "octocat",
        author_avatar: "https://example.com/a.png",
        updated_at: "2026-09-01T00:00:00Z",
        html_url: "https://github.com/a/b/issues/42",
        is_pr: false,
        comments: 3,
      })
    ).toEqual({
      number: 42,
      title: "Crash on save",
      body: "steps",
      state: "open",
      draft: false,
      labels: [{ name: "bug", color: "d73a4a" }],
      author: "octocat",
      author_avatar: "https://example.com/a.png",
      updated_at: "2026-09-01T00:00:00Z",
      html_url: "https://github.com/a/b/issues/42",
      is_pr: false,
      comments: 3,
    })
  })

  /** number 是后面每个动作的主键，没有它这一行只是一张点不动的卡片。 */
  it("drops a row without a usable number", () => {
    expect(normalizeForgeIssueRow({ number: 0, title: "x" })).toBeNull()
    expect(normalizeForgeIssueRow({ number: -1, title: "x" })).toBeNull()
    expect(normalizeForgeIssueRow({ title: "x" })).toBeNull()
  })

  /** 服务端可能新增状态，未知值原样透传由展示层退化成中性字形；硬校验会让新状态整行消失。 */
  it("passes an unknown state through instead of rejecting the row", () => {
    expect(normalizeForgeIssueRow({ number: 1, state: "locked" })?.state).toBe("locked")
  })

  it("keeps a zero comment count", () => {
    expect(normalizeForgeIssueRow({ number: 1, comments: 0 })?.comments).toBe(0)
  })

  /** 标题缺失时用 `#号` 兜底 —— 一行没有任何文字读起来像加载失败。 */
  it("falls back to the number when a title is missing", () => {
    expect(normalizeForgeIssueRow({ number: 7 })?.title).toBe("#7")
  })
})

describe("normalizeForgeIssueList", () => {
  /**
   * 三个可空字段必须保留 null。压平各自对应一个具体的错误显示：
   * `total_count → 0` 会写「共 0 条」而列表里明明有行；
   * `reachable_count → 0` 会让分页立刻停在第一页。
   */
  it("preserves null counts rather than collapsing them to zero", () => {
    const list = normalizeForgeIssueList({
      rows: [{ number: 1 }],
      page: 1,
      per_page: 20,
      total_count: null,
      reachable_count: null,
      has_next: true,
      incomplete: false,
    })
    expect(list.total_count).toBeNull()
    expect(list.reachable_count).toBeNull()
    expect(list.has_next).toBe(true)
  })

  it("keeps a real zero total apart from a missing one", () => {
    expect(normalizeForgeIssueList({ rows: [], total_count: 0 }).total_count).toBe(0)
    expect(normalizeForgeIssueList({ rows: [] }).total_count).toBeNull()
  })

  it("keeps the incomplete flag the badge has to obey", () => {
    expect(normalizeForgeIssueList({ rows: [], incomplete: true }).incomplete).toBe(true)
  })

  /** 服务端 clamp 后的回显缺失时回落到**请求值**，分页游标要跟着实际服务的那一页走。 */
  it("echoes the requested paging when the response omits it", () => {
    const list = normalizeForgeIssueList({ rows: [] }, { page: 4, perPage: 50 })
    expect(list.page).toBe(4)
    expect(list.per_page).toBe(50)
  })

  it("prefers the server's clamped paging over the request", () => {
    const list = normalizeForgeIssueList({ rows: [], page: 1, per_page: 100 }, { page: 9, perPage: 500 })
    expect(list.page).toBe(1)
    expect(list.per_page).toBe(100)
  })

  it("drops unusable rows without failing the page", () => {
    const list = normalizeForgeIssueList({ rows: [{ number: 1 }, { number: 0 }, null] })
    expect(list.rows.map((row) => row.number)).toEqual([1])
  })
})

describe("normalizeForgeComment", () => {
  it("carries every field the thread renders", () => {
    expect(
      normalizeForgeComment({
        id: "12",
        author: "octocat",
        author_avatar: "https://example.com/a.png",
        body: "looks good",
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-02T00:00:00Z",
        html_url: "https://github.com/a/b/issues/1#issuecomment-12",
      })
    ).toEqual({
      id: "12",
      author: "octocat",
      author_avatar: "https://example.com/a.png",
      body: "looks good",
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-02T00:00:00Z",
      html_url: "https://github.com/a/b/issues/1#issuecomment-12",
    })
  })

  /** GitHub 的 id 是 i64，后端字符串化过 —— 但脏数据里可能还是数字。 */
  it("accepts a numeric id", () => {
    expect(normalizeForgeComment({ id: 12 })?.id).toBe("12")
  })

  /** id 是渲染 key 与跨页去重的唯一依据，没有它的评论会在翻页时重复出现。 */
  it("drops a comment with no id", () => {
    expect(normalizeForgeComment({ body: "hi" })).toBeNull()
    expect(normalizeForgeComment({ id: "  " })).toBeNull()
    expect(normalizeForgeComment(null)).toBeNull()
  })

  /** 空正文是合法的（forge 上真的有），保留空串让展示层说「（空评论）」。 */
  it("keeps an empty body as an empty string", () => {
    expect(normalizeForgeComment({ id: "1" })?.body).toBe("")
  })
})

describe("normalizeForgeCommentList", () => {
  /**
   * `has_next` 来自 forge 的分页头，**不能**从「这一页满了没」推 —— GitLab 本地丢掉
   * 系统事件，一页可能一条人写的都不剩而讨论还在下一页。
   */
  it("takes has_next from the forge rather than the page size", () => {
    const list = normalizeForgeCommentList({ comments: [], has_next: true, page: 1, per_page: 20 })
    expect(list.comments).toEqual([])
    expect(list.has_next).toBe(true)
  })

  it("echoes the requested paging when the response omits it", () => {
    const list = normalizeForgeCommentList({ comments: [] }, { page: 3, perPage: 20 })
    expect(list.page).toBe(3)
    expect(list.per_page).toBe(20)
  })

  it("drops unusable comments", () => {
    const list = normalizeForgeCommentList({ comments: [{ id: "1" }, { body: "x" }, null] })
    expect(list.comments).toHaveLength(1)
  })
})

describe("normalizeForgeCheck", () => {
  it("carries the five folded states through", () => {
    ;(["queued", "running", "success", "failure", "neutral"] as const).forEach((state) => {
      expect(normalizeForgeCheck({ name: "build", state })?.state).toBe(state)
    })
  })

  /**
   * 未知 state 落到 `neutral` 而不是 `success`：「跑了但没结论」比「通过」保守，而把
   * 一个未知状态画成绿色正是让红色流水线读起来是绿的那个错误。
   */
  it("falls back to neutral rather than success", () => {
    expect(normalizeForgeCheck({ name: "build", state: "timed_out" })?.state).toBe("neutral")
    expect(normalizeForgeCheck({ name: "build" })?.state).toBe("neutral")
  })

  /** 没有名字的检查项在列表里是一行空白，丢掉。 */
  it("drops a check with no name", () => {
    expect(normalizeForgeCheck({ state: "success" })).toBeNull()
    expect(normalizeForgeCheck(null)).toBeNull()
  })

  /** id 缺失时用名字兜底（渲染 key 必须有值）。 */
  it("falls back to the name as an id", () => {
    expect(normalizeForgeCheck({ name: "build" })?.id).toBe("build")
  })

  it("keeps the allow_failure flag", () => {
    expect(normalizeForgeCheck({ name: "lint", allow_failure: true })?.allow_failure).toBe(true)
  })
})

describe("normalizeForgeCheckList", () => {
  /**
   * `available` **缺失按 false**（「读不到」）—— 把「读不到」当成「答了，什么都没配」
   * 会在一个流水线是红的仓库上印出「没有检查」。
   */
  it("treats a missing available flag as unreadable", () => {
    expect(normalizeForgeCheckList({ checks: [] }).available).toBe(false)
    expect(normalizeForgeCheckList({ checks: [], available: true }).available).toBe(true)
  })

  /** `partial` 在 available 为 false 时强制 false：没有部分答案可以限定。 */
  it("cannot be partial while it is unavailable", () => {
    expect(
      normalizeForgeCheckList({ checks: [], available: false, partial: true }).partial
    ).toBe(false)
  })

  it("keeps a partial answer on a readable list", () => {
    expect(
      normalizeForgeCheckList({ checks: [{ name: "a" }], available: true, partial: true }).partial
    ).toBe(true)
  })
})

describe("normalizeForgeChangeDetail", () => {
  it("carries every field the panes render", () => {
    const detail = normalizeForgeChangeDetail({
      number: 42,
      base_ref: "main",
      head_ref: "fix/crash",
      head_repo: "fork/app",
      head_sha: "abc123",
      draft: true,
      state: "open",
      mergeable: false,
      merge_state: "dirty",
      additions: 10,
      deletions: 2,
      changed_files: 3,
      commits: 1,
      checks: { checks: [], available: true, partial: false },
    })
    expect(detail).toMatchObject({
      number: 42,
      base_ref: "main",
      head_ref: "fix/crash",
      head_repo: "fork/app",
      head_sha: "abc123",
      draft: true,
      mergeable: false,
      merge_state: "dirty",
    })
  })

  /**
   * **`mergeable` 的 null 必须活下来** —— 它是两个 forge 异步计算时的真实答案，
   * 压成 false 会让面板说「存在冲突」而实际上还没算完。
   */
  it("keeps a null mergeable apart from false", () => {
    expect(normalizeForgeChangeDetail({ number: 1, mergeable: null })?.mergeable).toBeNull()
    expect(normalizeForgeChangeDetail({ number: 1 })?.mergeable).toBeNull()
    expect(normalizeForgeChangeDetail({ number: 1, mergeable: false })?.mergeable).toBe(false)
  })

  /** 四个计数都可能缺（GitLab 一个都不给）—— 印一个 0 是在断言变更什么都没碰。 */
  it("keeps every absent counter null", () => {
    const detail = normalizeForgeChangeDetail({ number: 1 })
    expect(detail?.additions).toBeNull()
    expect(detail?.deletions).toBeNull()
    expect(detail?.changed_files).toBeNull()
    expect(detail?.commits).toBeNull()
  })

  it("keeps a genuine zero counter", () => {
    expect(normalizeForgeChangeDetail({ number: 1, additions: 0 })?.additions).toBe(0)
  })

  /** `head_repo` 只在 fork 时有值 —— 空串要变成 null，不然 UI 会画出「来自 」。 */
  it("normalizes a same-repo head to null", () => {
    expect(normalizeForgeChangeDetail({ number: 1, head_repo: "" })?.head_repo).toBeNull()
  })

  it("drops a detail with no usable number", () => {
    expect(normalizeForgeChangeDetail({ number: 0 })).toBeNull()
    expect(normalizeForgeChangeDetail(null)).toBeNull()
  })
})

describe("normalizeForgeChangedFile", () => {
  it("carries every field the row renders", () => {
    expect(
      normalizeForgeChangedFile({
        path: "src/a.ts",
        previous_path: "src/b.ts",
        status: "renamed",
        additions: 3,
        deletions: 1,
        binary: false,
        patch: "@@ -1 +1 @@",
      })
    ).toEqual({
      path: "src/a.ts",
      previous_path: "src/b.ts",
      status: "renamed",
      additions: 3,
      deletions: 1,
      binary: false,
      patch: "@@ -1 +1 @@",
    })
  })

  /** 未知 status 落到 `modified` —— `added` / `removed` 都在断言一件没发生的事。 */
  it("falls back to modified for an unknown status", () => {
    expect(normalizeForgeChangedFile({ path: "a", status: "copied" })?.status).toBe("modified")
    expect(normalizeForgeChangedFile({ path: "a" })?.status).toBe("modified")
  })

  /** 空 patch 与缺失 patch 都是 null（「没有 diff 可看」），而不是空串。 */
  it("normalizes an absent patch to null", () => {
    expect(normalizeForgeChangedFile({ path: "a" })?.patch).toBeNull()
    expect(normalizeForgeChangedFile({ path: "a", patch: "" })?.patch).toBeNull()
  })

  it("keeps absent line counts null", () => {
    const file = normalizeForgeChangedFile({ path: "a", binary: true })
    expect(file?.additions).toBeNull()
    expect(file?.deletions).toBeNull()
    expect(file?.binary).toBe(true)
  })

  it("drops a file with no path", () => {
    expect(normalizeForgeChangedFile({ status: "added" })).toBeNull()
  })
})

describe("normalizeForgeChangedFileList", () => {
  it("echoes the requested paging and keeps has_next", () => {
    const list = normalizeForgeChangedFileList({ files: [], has_next: true }, { page: 2, perPage: 50 })
    expect(list.page).toBe(2)
    expect(list.per_page).toBe(50)
    expect(list.has_next).toBe(true)
  })

  it("drops unusable files", () => {
    const list = normalizeForgeChangedFileList({ files: [{ path: "a" }, {}, null] })
    expect(list.files).toHaveLength(1)
  })
})

describe("normalizeForgeMergeOptions", () => {
  it("keeps the permitted methods in order", () => {
    const options = normalizeForgeMergeOptions({
      methods: ["squash", "merge"],
      default_method: "squash",
      merge_strategy: "fast_forward",
    })
    expect(options.methods).toEqual(["squash", "merge"])
    expect(options.default_method).toBe("squash")
    expect(options.merge_strategy).toBe("fast_forward")
  })

  /** 空 methods 是「forge 不肯说」—— 保留空数组，展示层退化成只提供 merge。 */
  it("keeps an empty method list as the forge's silence", () => {
    const options = normalizeForgeMergeOptions({ methods: [], default_method: "merge" })
    expect(options.methods).toEqual([])
    expect(options.default_method).toBe("merge")
  })

  /** 默认方式必须是 methods 的成员 —— 一个选不中的默认值会让菜单打开时什么都没选上。 */
  it("pulls an out-of-range default into the offered set", () => {
    const options = normalizeForgeMergeOptions({
      methods: ["squash"],
      default_method: "rebase",
    })
    expect(options.default_method).toBe("squash")
  })

  it("drops unknown methods and falls back on the strategy", () => {
    const options = normalizeForgeMergeOptions({
      methods: ["squash", "cherry_pick"],
      default_method: "nonsense",
      merge_strategy: "nonsense",
    })
    expect(options.methods).toEqual(["squash"])
    expect(options.default_method).toBe("squash")
    expect(options.merge_strategy).toBe("merge_commit")
  })

  it("survives a junk response with the same fallback the backend uses", () => {
    expect(normalizeForgeMergeOptions(null)).toEqual({
      methods: [],
      default_method: "merge",
      merge_strategy: "merge_commit",
    })
  })
})
