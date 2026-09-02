import {
  archiveWorkTask,
  cancelWorkTask,
  completeWorkTask,
  createWorkTask,
  deleteWorkTask,
  deliverWorkTaskPr,
  deleteWorkTaskSettings,
  getWorkTask,
  getWorkTaskDiff,
  getWorkTaskSettingsOwn,
  listWorkTaskChangedFiles,
  listWorkTaskEvents,
  listWorkTasks,
  mergeWorkTask,
  normalizeFolderSettings,
  normalizeWorkTask,
  requeueWorkTask,
  returnWorkTask,
  retryWorkTask,
  saveWorkTaskTemplate,
  scheduleWorkTask,
  setWorkTaskSettings,
  startWorkTask,
  unqueueWorkTaskMerge,
  updateWorkTask,
  WORK_TASK_CHANGED_CHANNEL,
} from "@/services/workTask"
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

describe("workTask service", () => {
  /**
   * 通道名是 mcode-app 与 codeg-plus 之间的硬契约（服务端
   * `web/event_bridge.rs::WORK_TASK_CHANGED_EVENT`）。写错的话列表永远不会自动刷新，
   * 而且不会报错 —— 只是安静地一直显示旧数据。
   */
  it("subscribes to the exact channel the backend broadcasts on", () => {
    expect(WORK_TASK_CHANGED_CHANNEL).toBe("task://changed")
  })

  it("sends folderId null when listing every folder", async () => {
    const { gateway, calls } = makeGateway([])
    await listWorkTasks(gateway)
    expect(calls).toEqual([{ command: "work_task_list", payload: { folderId: null } }])
  })

  /** 线上字段名是 camelCase（服务端 `rename_all = "camelCase"`），不能顺手统一成 snake。 */
  it("uses camelCase wire params", async () => {
    const { gateway, calls } = makeGateway([])
    await listWorkTaskEvents(gateway, 7)
    await listWorkTaskChangedFiles(gateway, 7)
    await getWorkTaskDiff(gateway, 7, "src/a.ts")
    await deleteWorkTask(gateway, 7, true)
    expect(calls.map((call) => [call.command, call.payload])).toEqual([
      ["work_task_events", { taskId: 7, limit: 500 }],
      ["work_task_changed_files", { id: 7 }],
      ["work_task_diff", { id: 7, file: "src/a.ts" }],
      ["work_task_delete", { id: 7, deleteWorktree: true }],
    ])
  })

  it("defaults the event limit to 500 like the desktop client", async () => {
    const { gateway, calls } = makeGateway([])
    await listWorkTaskEvents(gateway, 1)
    expect(calls[0].payload.limit).toBe(500)
  })

  it("passes a null file for the full diff", async () => {
    const { gateway, calls } = makeGateway("")
    await getWorkTaskDiff(gateway, 3)
    expect(calls[0].payload).toEqual({ id: 3, file: null })
  })

  it("maps every lifecycle action onto its command", async () => {
    const { gateway, calls } = makeGateway(null)
    await startWorkTask(gateway, 1)
    await cancelWorkTask(gateway, 1, " 方向不对 ")
    await scheduleWorkTask(gateway, 1, "2026-09-05T01:00:00.000Z")
    await returnWorkTask(gateway, 1, "改一下", "revise")
    await unqueueWorkTaskMerge(gateway, 1)
    await completeWorkTask(gateway, 1, true)
    await archiveWorkTask(gateway, 1, true)
    expect(calls.map((call) => call.command)).toEqual([
      "work_task_start",
      "work_task_cancel",
      "work_task_schedule",
      "work_task_return",
      "work_task_merge_unqueue",
      "work_task_complete",
      "work_task_archive",
    ])
  })

  /** 空理由/空备注要送 `null` 而不是空串 —— 服务端把空串当成"用户写了个空的"。 */
  it("sends null rather than an empty string for optional notes", async () => {
    const { gateway, calls } = makeGateway(null)
    await cancelWorkTask(gateway, 1)
    await retryWorkTask(gateway, 1)
    expect(calls[0].payload).toEqual({ id: 1, reason: null })
    expect(calls[1].payload).toEqual({
      id: 1,
      note: null,
      blocks: [],
      allowDuplicateSource: false,
    })
  })

  /**
   * 复活守卫的豁免必须**默认 false**。默认 true 会让每一次重启都悄悄绕过守卫，
   * 而那个守卫存在的理由是防止同一个 forge 工作项上同时活着两个任务。
   */
  it("defaults allowDuplicateSource to false on both restart paths", async () => {
    const { gateway, calls } = makeGateway(null)
    await retryWorkTask(gateway, 1, "note")
    await requeueWorkTask(gateway, 2, "note")
    expect(calls[0].payload.allowDuplicateSource).toBe(false)
    expect(calls[1].payload.allowDuplicateSource).toBe(false)
  })

  it("forwards the waiver when the user confirms", async () => {
    const { gateway, calls } = makeGateway(null)
    await retryWorkTask(gateway, 1, null, [], true)
    expect(calls[0].payload.allowDuplicateSource).toBe(true)
  })

  /** `intent` 省略时送 null —— 服务端把 absent 读作 `revise`（历史行为）。 */
  it("sends a null intent when none was chosen", async () => {
    const { gateway, calls } = makeGateway(null)
    await returnWorkTask(gateway, 1, "改一下")
    expect(calls[0].payload).toEqual({ id: 1, feedback: "改一下", intent: null, blocks: [] })
  })

  /**
   * merge **返回布尔**，`true` = 被排队而不是立即开始。把它读成 void 会让用户以为
   * 点击丢失了（卡片还停在待验收）。
   */
  it("reports a queued merge through the boolean return", async () => {
    const queued = makeGateway(true)
    await expect(mergeWorkTask(queued.gateway, 1, null, true)).resolves.toBe(true)
    const started = makeGateway(false)
    await expect(mergeWorkTask(started.gateway, 1, "msg", false)).resolves.toBe(false)
    expect(started.calls[0].payload).toEqual({ id: 1, message: "msg", deleteWorktree: false })
  })

  /** 非布尔响应（老服务端 / 代理包装）不能被当成 true —— 那会误报"已排队"。 */
  it("treats a non-boolean merge response as not queued", async () => {
    const { gateway } = makeGateway({ ok: true })
    await expect(mergeWorkTask(gateway, 1, null, true)).resolves.toBe(false)
  })

  /** deliver 返回 PR 地址字符串。 */
  it("returns the pull request url from deliver", async () => {
    const { gateway, calls } = makeGateway("https://example.com/pr/1")
    await expect(deliverWorkTaskPr(gateway, 1, "标题", true)).resolves.toBe(
      "https://example.com/pr/1"
    )
    expect(calls[0].payload).toEqual({ id: 1, prTitle: "标题", draft: true })
  })

  it("wraps the draft in a `draft` key for create/update/template-save", async () => {
    const { gateway, calls } = makeGateway(null)
    const config = { prompt_blocks: [], display_text: "做点事", config_values: {} }
    await createWorkTask(gateway, { folder_id: 3, title: "t", config })
    await updateWorkTask(gateway, 9, { folder_id: 3, title: "t", config })
    await saveWorkTaskTemplate(gateway, { name: "n", title: "t", config })
    expect(calls[0].payload).toEqual({ draft: { folder_id: 3, title: "t", config } })
    expect(calls[1].payload).toEqual({ id: 9, draft: { folder_id: 3, title: "t", config } })
    expect(calls[2].payload).toEqual({ draft: { name: "n", title: "t", config } })
  })

  it("routes the two settings scopes to their own commands", async () => {
    const { gateway, calls } = makeGateway(null)
    const settings = normalizeFolderSettings({})
    await setWorkTaskSettings(gateway, 4, settings)
    await deleteWorkTaskSettings(gateway, 4)
    expect(calls.map((call) => call.command)).toEqual([
      "work_task_settings_set",
      "work_task_settings_delete",
    ])
  })

  /** `work_task_settings_get_own` 返回 null 就是「跟随全局」，不能补成一份默认值。 */
  it("keeps a null own-settings row as null", async () => {
    const { gateway } = makeGateway(null)
    await expect(getWorkTaskSettingsOwn(gateway, 4)).resolves.toBeNull()
  })

  describe("normalizeWorkTask", () => {
    const raw = {
      id: 5,
      folder_id: 2,
      title: "任务",
      status: "review",
      run_seq: 1,
      sort_order: 0,
      files_changed: 0,
      additions: 0,
      deletions: 0,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    }

    /**
     * `0` 必须保留：`files_changed === 0`（确实没改动）与 `null`（引擎读不到统计）
     * 在验收判定里是两种语义 —— 用 `||` 兜底会把 0 变成 null，让「完成」按钮消失。
     */
    it("preserves zero instead of coercing it to null", () => {
      const task = normalizeWorkTask(raw)
      expect(task?.files_changed).toBe(0)
      expect(task?.additions).toBe(0)
      expect(task?.deletions).toBe(0)
    })

    it("drops a row without a usable id", () => {
      expect(normalizeWorkTask({ ...raw, id: 0 })).toBeNull()
      expect(normalizeWorkTask({ ...raw, id: undefined })).toBeNull()
      expect(normalizeWorkTask(null)).toBeNull()
      expect(normalizeWorkTask("string")).toBeNull()
    })

    /** 未知状态原样透传 —— 白名单校验会让服务端新增的状态整行消失。 */
    it("passes an unknown status through untouched", () => {
      expect(normalizeWorkTask({ ...raw, status: "brand_new" })?.status).toBe("brand_new")
    })

    /** config 历史上可能是 JSON **字符串**（早期版本直接塞文本），两种都要接。 */
    it("accepts config as either an object or a JSON string", () => {
      const fromObject = normalizeWorkTask({
        ...raw,
        config: { display_text: "做点事", prompt_blocks: [{ type: "text", text: "做点事" }] },
      })
      expect(fromObject?.config?.display_text).toBe("做点事")
      const fromString = normalizeWorkTask({
        ...raw,
        config: JSON.stringify({ display_text: "做点事" }),
      })
      expect(fromString?.config?.display_text).toBe("做点事")
    })

    it("degrades an unparseable config to null instead of throwing", () => {
      expect(normalizeWorkTask({ ...raw, config: "{not json" })?.config).toBeNull()
      expect(normalizeWorkTask({ ...raw, config: null })?.config).toBeNull()
    })

    /** 只有三个合法的预检状态；别的值当没有预检，而不是画一个空胶囊。 */
    it("only accepts the three known preflight statuses", () => {
      expect(
        normalizeWorkTask({ ...raw, preflight: { status: "passed", command: "pnpm test" } })
          ?.preflight?.status
      ).toBe("passed")
      expect(
        normalizeWorkTask({ ...raw, preflight: { status: "weird", command: "x" } })?.preflight
      ).toBeNull()
    })

    it("reads snake_case and camelCase alike", () => {
      const task = normalizeWorkTask({
        ...raw,
        worktreeFolderId: 11,
        workBranch: "task/5",
        latestProgress: "跑测试",
      })
      expect(task?.worktree_folder_id).toBe(11)
      expect(task?.work_branch).toBe("task/5")
      expect(task?.latest_progress).toBe("跑测试")
    })

    it("stamps worktree_missing as a boolean", () => {
      expect(normalizeWorkTask(raw)?.worktree_missing).toBe(false)
      expect(normalizeWorkTask({ ...raw, worktree_missing: true })?.worktree_missing).toBe(true)
    })
  })

  describe("normalizeFolderSettings", () => {
    /**
     * `delete_worktree_default` 的内置默认是 **true**（与 Rust `Default` 一致）。
     * 缺字段读成 false 会让合并弹层默认不清理 worktree，与 PC 端不一致。
     */
    it("defaults delete_worktree_default to true when absent", () => {
      expect(normalizeFolderSettings({}).delete_worktree_default).toBe(true)
      expect(
        normalizeFolderSettings({ delete_worktree_default: false }).delete_worktree_default
      ).toBe(false)
    })

    it("fills every field so the settings form stays controlled", () => {
      const settings = normalizeFolderSettings({})
      expect(settings.max_concurrent).toBe(2)
      expect(settings.merge_strategy).toBe("squash")
      expect(settings.auto_process).toBe(false)
      expect(settings.auto_merge).toBe(false)
      expect(settings.config_values).toEqual({})
      expect(settings.stage_prompts).toEqual({})
    })

    it("only accepts the two known merge strategies", () => {
      expect(normalizeFolderSettings({ merge_strategy: "merge" }).merge_strategy).toBe("merge")
      expect(normalizeFolderSettings({ merge_strategy: "rebase" }).merge_strategy).toBe("squash")
    })

    /** 老设置行没有 `stage_prompts` —— 缺键就是那次迁移，不能因此抛错。 */
    it("decodes a legacy settings row that predates stage prompts", () => {
      const settings = normalizeFolderSettings({
        default_agent_type: "claude_code",
        max_concurrent: 3,
        merge_strategy: "merge",
        delete_worktree_default: false,
        init_command: "pnpm install",
      })
      expect(settings.stage_prompts).toEqual({})
      expect(settings.max_concurrent).toBe(3)
      expect(settings.init_command).toBe("pnpm install")
    })
  })

  it("normalizes a wrapped list payload", async () => {
    const { gateway } = makeGateway({ data: [{ id: 1, title: "t", status: "todo" }] })
    await expect(listWorkTasks(gateway, 1)).resolves.toHaveLength(1)
  })

  it("returns null for a get that answers with nothing usable", async () => {
    const { gateway } = makeGateway(null)
    await expect(getWorkTask(gateway, 1)).resolves.toBeNull()
  })
})
