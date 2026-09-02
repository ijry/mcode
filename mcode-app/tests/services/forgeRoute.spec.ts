import {
  buildForgeAccountsRoute,
  buildForgeItemRoute,
  buildForgeRoute,
  forgeUnsupportedText,
  isForgeCapableConnection,
  parseForgeAccountsRouteOptions,
  parseForgeItemRouteOptions,
  parseForgeRouteOptions,
} from "@/services/forge/forgeRoute"

describe("forge routes", () => {
  it("round-trips the list route", () => {
    const url = buildForgeRoute({ connectionId: "conn 1", folderId: 7 })
    expect(url.startsWith("/pages/forge/index?")).toBe(true)
    const parsed = parseForgeRouteOptions(queryOf(url))
    expect(parsed.connectionId).toBe("conn 1")
    expect(parsed.folderId).toBe(7)
  })

  /** folderId 0 是「让页面自己决定」（存储 → 第一个项目），不是一个真实的文件夹。 */
  it("keeps folderId 0 as the let-the-page-decide sentinel", () => {
    const parsed = parseForgeRouteOptions(queryOf(buildForgeRoute({ connectionId: "a" })))
    expect(parsed.folderId).toBe(0)
  })

  /** 连接上下文是兜底口径（连接记录还没落到存储里时用），没有就不要往 URL 里塞空参数。 */
  it("only carries the connection context when there is one", () => {
    expect(buildForgeRoute({ connectionId: "a" })).not.toContain("connection=")
    expect(buildForgeRoute({ connectionId: "a", connection: '{"id":"a"}' })).toContain(
      "connection="
    )
  })

  it("round-trips the item route with its coordinates", () => {
    const url = buildForgeItemRoute({
      connectionId: "a",
      folderId: 3,
      kind: "pr",
      number: 42,
    })
    const parsed = parseForgeItemRouteOptions(queryOf(url))
    expect(parsed).toMatchObject({ connectionId: "a", folderId: 3, kind: "pr", number: 42 })
  })

  /**
   * 详情路由**只带坐标**，不带标题正文 —— issue body 上限 16000 字符，塞进 URL
   * 会超长且各端行为不一致。首屏内容走 forgeRowInbox 的 seed。
   */
  it("never puts item content in the item route", () => {
    const url = buildForgeItemRoute({ connectionId: "a", folderId: 1, kind: "issue", number: 1 })
    expect(url).not.toContain("title")
    expect(url).not.toContain("body")
  })

  /** 未知 kind 落到 issue：`pr` 是唯一需要区分的另一种。 */
  it("falls back to issue for an unrecognized kind", () => {
    expect(parseForgeItemRouteOptions({ kind: "merge_request" }).kind).toBe("issue")
    expect(parseForgeItemRouteOptions({}).kind).toBe("issue")
  })

  /**
   * 账号页预填 host 与 provider —— 用户是因为「这个 host 没有账号」被送过来的，
   * 让他再手打一遍主机名是把一个已知答案伪装成一道题。
   */
  it("prefills the host and provider on the accounts route", () => {
    const url = buildForgeAccountsRoute({
      connectionId: "a",
      serverHost: "ghe.corp.com",
      provider: "github",
    })
    const parsed = parseForgeAccountsRouteOptions(queryOf(url))
    expect(parsed.serverHost).toBe("ghe.corp.com")
    expect(parsed.provider).toBe("github")
  })

  /** provider 只认两个值：客户端从不自己猜 forge 种类（那等于选一份凭据）。 */
  it("drops an unrecognized provider rather than guessing", () => {
    expect(parseForgeAccountsRouteOptions({ provider: "bitbucket" }).provider).toBe("")
    expect(parseForgeAccountsRouteOptions({}).provider).toBe("")
  })
})

describe("isForgeCapableConnection", () => {
  /** `forge_*` 与 `work_task_*` 一样是 codeg-plus 独有的命令族，别的目标会 404。 */
  it("only allows codeg targets", () => {
    expect(isForgeCapableConnection({ targetAgent: "codeg" } as any)).toBe(true)
    expect(isForgeCapableConnection({ targetAgent: "opencode" } as any)).toBe(false)
    expect(isForgeCapableConnection({ targetAgent: "mcode-desktop" } as any)).toBe(false)
  })

  /** 空值放行：老连接记录没有 targetAgent，凭一个缺失字段把功能藏起来比让请求自己报错更糟。 */
  it("lets an unlabelled legacy record through", () => {
    expect(isForgeCapableConnection({} as any)).toBe(true)
    expect(isForgeCapableConnection({ targetAgent: "" } as any)).toBe(true)
  })

  it("reads the target agent from all three places it can live", () => {
    expect(isForgeCapableConnection({ targetProfile: { targetAgent: "opencode" } } as any)).toBe(
      false
    )
    expect(isForgeCapableConnection({ gatewaySession: { targetAgent: "opencode" } } as any)).toBe(
      false
    )
  })

  it("refuses a missing connection", () => {
    expect(isForgeCapableConnection(null)).toBe(false)
    expect(isForgeCapableConnection(undefined)).toBe(false)
  })

  it("says nothing when the connection is capable", () => {
    expect(forgeUnsupportedText({ targetAgent: "codeg" } as any)).toBe("")
    expect(forgeUnsupportedText({ targetAgent: "opencode" } as any)).toBeTruthy()
  })
})

/** 把 build 出来的 URL 拆回 onLoad 会收到的那个 options 对象。 */
function queryOf(url: string): Record<string, string> {
  const query = url.slice(url.indexOf("?") + 1)
  const options: Record<string, string> = {}
  query.split("&").forEach((pair) => {
    const index = pair.indexOf("=")
    if (index <= 0) return
    options[pair.slice(0, index)] = pair.slice(index + 1)
  })
  return options
}
