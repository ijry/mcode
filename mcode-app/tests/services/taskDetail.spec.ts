import {
  buildTaskDetailRoute,
  isTaskCapableConnection,
  parseTaskDetailRouteOptions,
  taskUnsupportedText,
} from "@/services/taskDetail"
import {
  DEFAULT_STORED_TASK_FILTER,
  readStoredTaskFilter,
  writeStoredTaskFilter,
} from "@/services/taskFilterPreference"

describe("taskDetail route", () => {
  /**
   * 路由必须带 `connectionId`：任务是**按连接**存在的（每台 codeg 各有自己一套
   * work_task 行），单独一个 id 无法定位。
   */
  it("carries both the connection and the task id", () => {
    expect(buildTaskDetailRoute({ connectionId: "conn-1", taskId: 42 })).toBe(
      "/pages/task-detail/index?connectionId=conn-1&taskId=42"
    )
  })

  /** 连接 id 是用户可命名的，可能含 `&` `?` 之类会截断查询串的字符。 */
  it("encodes a connection id that would otherwise break the query string", () => {
    const url = buildTaskDetailRoute({ connectionId: "a&b?c=d", taskId: 1 })
    expect(url).toContain("connectionId=a%26b%3Fc%3Dd")
    expect(parseTaskDetailRouteOptions({ connectionId: "a%26b%3Fc%3Dd", taskId: "1" })).toEqual({
      connectionId: "a&b?c=d",
      taskId: 1,
    })
  })

  it("parses missing or malformed options into a harmless zero", () => {
    expect(parseTaskDetailRouteOptions(undefined)).toEqual({ connectionId: "", taskId: 0 })
    expect(parseTaskDetailRouteOptions({ taskId: "abc" })).toEqual({
      connectionId: "",
      taskId: 0,
    })
  })

  /**
   * `work_task_*` 是 codeg-plus 独有的命令族。对 opencode / mcode-desktop 发这些请求
   * 会拿到 404 —— 与其让用户读一串网关错误，不如提前说清楚。
   */
  it("only offers the task feature on codeg connections", () => {
    expect(isTaskCapableConnection({ targetAgent: "codeg" } as never)).toBe(true)
    expect(isTaskCapableConnection({ targetAgent: "opencode" } as never)).toBe(false)
    expect(isTaskCapableConnection({ targetAgent: "mcode-desktop" } as never)).toBe(false)
    expect(isTaskCapableConnection(null)).toBe(false)
  })

  /** 配对回来的 targetProfile 比记录里的字段更权威。 */
  it("prefers the paired target profile over the stored field", () => {
    expect(
      isTaskCapableConnection({
        targetAgent: "codeg",
        targetProfile: { targetAgent: "opencode" },
      } as never)
    ).toBe(false)
  })

  /**
   * 老连接记录可能完全没有 targetAgent —— 那时按历史默认（codeg）放行，
   * 让请求自己去报错，而不是凭一个缺失字段把功能藏起来。
   */
  it("lets a connection with no recorded agent through", () => {
    expect(isTaskCapableConnection({ name: "旧连接" } as never)).toBe(true)
  })

  it("explains itself only when the connection is unsupported", () => {
    expect(taskUnsupportedText({ targetAgent: "codeg" } as never)).toBe("")
    expect(taskUnsupportedText({ targetAgent: "opencode" } as never)).toContain("codeg")
  })
})

describe("taskFilterPreference", () => {
  beforeEach(() => {
    uni.clearStorageSync()
  })

  /** 已取消默认显示（还能重新排队），已归档默认隐藏 —— 与 PC 端一致。 */
  it("defaults to showing canceled and hiding archived", () => {
    expect(DEFAULT_STORED_TASK_FILTER.showCanceled).toBe(true)
    expect(DEFAULT_STORED_TASK_FILTER.showArchived).toBe(false)
    expect(readStoredTaskFilter()).toEqual(DEFAULT_STORED_TASK_FILTER)
  })

  it("round-trips a filter", () => {
    writeStoredTaskFilter({
      tab: "attention",
      showCanceled: false,
      showArchived: true,
      connectionKey: "conn-a",
      folderId: 7,
    })
    expect(readStoredTaskFilter()).toEqual({
      tab: "attention",
      showCanceled: false,
      showArchived: true,
      connectionKey: "conn-a",
      folderId: 7,
    })
  })

  /**
   * 未知 tab 回退到 `all`：状态分组以后可能改名，一个存着旧名字的偏好不能让列表
   * 永远空着（`filterTaskEntries` 会拿它跟分组比对，永不相等）。
   */
  it("falls back to the all tab for a stored name that no longer exists", () => {
    uni.setStorageSync("mcode_task_list_filter", { tab: "someOldGroup" })
    expect(readStoredTaskFilter().tab).toBe("all")
  })

  /** showCanceled 的默认是 true，所以缺字段不能读成 false。 */
  it("keeps showCanceled on when the stored row predates the toggle", () => {
    uni.setStorageSync("mcode_task_list_filter", { tab: "all", showArchived: true })
    const filter = readStoredTaskFilter()
    expect(filter.showCanceled).toBe(true)
    expect(filter.showArchived).toBe(true)
  })

  it("ignores a corrupt stored value", () => {
    uni.setStorageSync("mcode_task_list_filter", "not-an-object")
    expect(readStoredTaskFilter()).toEqual(DEFAULT_STORED_TASK_FILTER)
    uni.setStorageSync("mcode_task_list_filter", [1, 2, 3])
    expect(readStoredTaskFilter()).toEqual(DEFAULT_STORED_TASK_FILTER)
  })

  it("clamps a nonsense folder id to 0 (all projects)", () => {
    uni.setStorageSync("mcode_task_list_filter", { tab: "all", folderId: -5 })
    expect(readStoredTaskFilter().folderId).toBe(0)
    uni.setStorageSync("mcode_task_list_filter", { tab: "all", folderId: "abc" })
    expect(readStoredTaskFilter().folderId).toBe(0)
  })
})
