import fs from "node:fs"
import path from "node:path"

const root = path.resolve(__dirname, "../../../src")

function read(relative: string) {
  return fs.readFileSync(path.join(root, relative), "utf8")
}

function extractFunctionBlock(source: string, signature: string) {
  const start = source.indexOf(signature)
  if (start < 0) throw new Error(`signature not found: ${signature}`)
  // 从签名开始截到下一个顶层 `\n}` —— 页面里的函数都是顶层声明，这一刀足够精确，
  // 与 `conversations/detailNavigationContract.spec.ts` 的 `extractFunctionBlock` 同法。
  const end = source.indexOf("\n}", start)
  return source.slice(start, end < 0 ? undefined : end + 2)
}

/**
 * 任务页的**源码扫描契约**。
 *
 * 组件从不被挂载（jest 配的是 `testEnvironment: node`，仓库里没有 @vue/test-utils），
 * 所以模板与接线的不变量只能按字符串断言。这些断言每一条都对应一个具体的坑，注释说明
 * 它防的是什么 —— 见仓库里 `conversationListNavbarHeader.spec.ts` 的同类做法。
 */
describe("tasks page contract", () => {
  it("registers both task pages and puts 任务 in the tabBar", () => {
    const pages = JSON.parse(read("pages.json"))
    const paths = pages.pages.map((page: any) => page.path)
    expect(paths).toContain("pages/tasks/index")
    expect(paths).toContain("pages/task-detail/index")

    const tabPaths = pages.tabBar.list.map((item: any) => item.pagePath)
    expect(tabPaths).toContain("pages/tasks/index")
    // 待办让位给任务，不再是 tabBar 项。
    expect(tabPaths).not.toContain("pages/todos/index")
    const taskTab = pages.tabBar.list.find(
      (item: any) => item.pagePath === "pages/tasks/index"
    )
    expect(taskTab.text).toBe("任务")
  })

  /**
   * `CONVERSATIONS_TABBAR_INDEX` 是**按位置**取的（`uni.setTabBarBadge({index})`）。
   * 会话必须留在下标 1，否则会话角标会打到别的 tab 上。
   */
  it("keeps the conversations tab at the index its badge service hardcodes", () => {
    const pages = JSON.parse(read("pages.json"))
    expect(pages.tabBar.list[1].pagePath).toBe("pages/conversations/index")
    const badgeService = read("services/conversation/tabbarActiveSessions.ts")
    expect(badgeService).toContain("CONVERSATIONS_TABBAR_INDEX = 1")
  })

  /** 待办页仍然注册着，并且从「我的」里能进 —— 本地/云端待办不依赖 codeg 连接。 */
  it("keeps the todos page reachable from the profile page", () => {
    const pages = JSON.parse(read("pages.json"))
    expect(pages.pages.map((page: any) => page.path)).toContain("pages/todos/index")
    const profile = read("pages/profile/index.vue")
    expect(profile).toContain("goToTodos")
    // `navigateTo` 而不是 `switchTab` —— 它已经不在 tabBar 里了。
    expect(profile).toContain('url: "/pages/todos/index"')
    expect(extractFunctionBlock(profile, "function goToTodos()")).toContain("navigateTo")
  })

  /** 待办页从 tabBar 移出后只能 navigateTo 进入，自定义导航栏必须自己画返回。 */
  it("gives the todos header its own back affordance", () => {
    const header = read("pages/todos/components/TodoPageHeader.vue")
    expect(header).toContain("canGoBack")
    expect(header).toContain("getCurrentPages()")
    expect(header).toContain("navigateBack")
  })

  /** 项目详情的「待办」tab 仍然依赖 todos 的组件与状态模块，别一起删掉。 */
  it("leaves the project-detail todos panel intact", () => {
    const panel = read("pages/project-detail/components/ProjectTodosPanel.vue")
    expect(panel).toContain("@/pages/todos/components/TodoCardList.vue")
    expect(panel).toContain("@/pages/todos/todoState")
  })

  describe("list page", () => {
    const source = read("pages/tasks/index.vue")

    it("renders the header with up-tabs status filtering and a create entry", () => {
      const header = read("pages/tasks/components/TaskPageHeader.vue")
      expect(header).toContain("up-tabs")
      expect(header).toContain(':current="currentIndex"')
      expect(source).toContain("TaskPageHeader")
      expect(source).toContain('@create="openCreateSheet"')
    })

    /**
     * up-tabs 是**下标驱动**的，而页面持有的是 tab id。回调形状在各版本间不一致
     * （`{index}` / item / 裸下标），三种都要认 —— 认错会让点 tab 没反应。
     */
    it("tolerates every shape up-tabs reports a change in", () => {
      const header = read("pages/tasks/components/TaskPageHeader.vue")
      const block = extractFunctionBlock(header, "function handleTabChange(item: any)")
      expect(block).toContain('typeof item === "number"')
      expect(block).toContain('typeof item?.index === "number"')
      expect(block).toContain("item?.id")
    })

    /** 引擎无头运行，`task://changed` 是列表唯一的推进信号。 */
    it("subscribes to the work-task change channel per connection", () => {
      expect(source).toContain("WORK_TASK_CHANGED_CHANNEL")
      expect(source).toContain("subscribeGlobalEvent")
      expect(source).toContain("ensureTaskChangedSubscription")
      // 每条连接一份订阅，按 instanceKey 去重。
      expect(source).toContain("disposeTaskChanged")
    })

    /** 一次状态迁移会连发好几条事件，逐条拉会打出一串重复请求。 */
    it("debounces the event-driven refetch", () => {
      const block = extractFunctionBlock(source, "function scheduleRefresh()")
      expect(block).toContain("refreshTimer")
      expect(block).toContain("300")
    })

    /**
     * 在飞的那次拉取**不能**被直接复用：`runAction` 在 finally 里 await 它，而防抖
     * 定时器可能在写操作之前就发出了请求 —— 复用等于让调用方拿到一份看不到自己刚做的
     * 改动的列表。所以在飞时记脏标记，飞完补跑一趟。
     */
    it("re-runs the load instead of handing back an in-flight promise that predates the write", () => {
      expect(source).toContain("loadDirty")
      const block = extractFunctionBlock(source, "function loadTasks(): Promise<void>")
      expect(block).toContain("loadDirty = true")
      const chain = extractFunctionBlock(source, "async function runLoadChain()")
      expect(chain).toContain("while (loadDirty)")
    })

    it("tears the subscriptions down on unload", () => {
      expect(source).toContain("onUnload(")
      expect(source).toContain("teardownSubscriptions()")
    })

    it("supports pull-to-refresh and re-reads on show", () => {
      expect(source).toContain("onPullDownRefresh(")
      expect(source).toContain("uni.stopPullDownRefresh()")
      expect(source).toContain("onShow(")
      const pages = JSON.parse(read("pages.json"))
      const entry = pages.pages.find((page: any) => page.path === "pages/tasks/index")
      // 下拉刷新必须在 pages.json 里开，否则 onPullDownRefresh 永远不触发。
      expect(entry.style.enablePullDownRefresh).toBe(true)
    })

    /**
     * 状态机在服务端，每次迁移都是带期望状态的 CAS —— 客户端猜出来的中间态只会和
     * 真相打架，所以每个写操作都是「发出去 → 重新拉取」。
     */
    it("refetches after every mutation instead of updating optimistically", () => {
      const block = extractFunctionBlock(
        source,
        "async function runAction(entry: TaskListEntry, fn: (gateway: CodegGateway) => Promise<unknown>)"
      )
      expect(block).toContain("await loadTasks()")
      expect(block).toContain("finally")
    })

    /** 点击前对着**实时**那一行再校验一次，别让一次合理的点击换来一条 CAS 错误 toast。 */
    it("re-checks the live row before dispatching a card action", () => {
      const block = extractFunctionBlock(
        source,
        "function handleCardAction(entry: TaskListEntry, id: TaskActionId)"
      )
      expect(block).toContain("findLiveTask(entry.task.id)")
      expect(block).toContain("isTaskActionAllowed(live, id)")
    })

    /**
     * 编辑必须落在**任务自己的**连接上（任务 id 只在它自己的服务端唯一，发错会更新到
     * 一个同 id 的无关任务）。但也**不能靠改 `filter.connectionKey`** 来做到 —— 那样
     * 点一下别的连接上的任务的「编辑」，整个列表会收窄到那条连接，用户只想改个标题
     * 却发现别的机器的任务全不见了。所以编辑器有自己独立的作用域 ref。
     */
    it("scopes the editor to the task's own connection without narrowing the list", () => {
      expect(source).toContain("const editorConnectionKey = ")
      expect(source).toContain("const editorGateway = ")
      expect(source).toContain(':gateway="editorGateway"')
      const block = extractFunctionBlock(
        source,
        "function handleCardAction(entry: TaskListEntry, id: TaskActionId)"
      )
      expect(block).toContain("editorConnectionKey.value = entry.connectionKey")
      // 关键的反向断言：编辑不得改动列表筛选。
      expect(block).not.toContain("filter.connectionKey =")
      // 提交也必须用编辑器自己那条网关，而不是当前筛选那条。
      const submit = extractFunctionBlock(
        source,
        "async function submitEditor(draft: WorkTaskDraft)"
      )
      expect(submit).toContain("editorGateway.value")
      expect(submit).not.toContain("activeGateway.value")
    })

    /** 任务 id 只在它自己的连接里唯一，动作必须落在那条连接的网关上。 */
    it("resolves the gateway per entry rather than using a global one", () => {
      expect(source).toContain("function bucketFor(entry: TaskListEntry)")
      const block = extractFunctionBlock(
        source,
        "async function runAction(entry: TaskListEntry, fn: (gateway: CodegGateway) => Promise<unknown>)"
      )
      expect(block).toContain("bucketFor(entry)")
      expect(block).toContain("bucket.gateway")
    })

    /** 任务的会话跑在 worktree 里，用项目 folder_id 会让详情页定位到错误的目录。 */
    it("opens the conversation with the worktree folder, not the project folder", () => {
      const block = extractFunctionBlock(source, "function openTaskConversation(entry: TaskListEntry)")
      expect(block).toContain("task.worktree_folder_id || task.folder_id")
      expect(block).toContain("/pages/conversation-detail/index?id=")
    })

    /** 详情路由由 services 层构造（同 projectDetail），页面不自己拼字符串。 */
    it("navigates to the detail page through the shared route builder", () => {
      expect(source).toContain("buildTaskDetailRoute")
      expect(source).toContain('from "@/services/taskDetail"')
    })

    /** `work_task_*` 只有 codeg 有，opencode / mcode-desktop 会 404。 */
    it("filters the connection list down to task-capable connections", () => {
      expect(source).toContain("isTaskCapableConnection")
      const block = extractFunctionBlock(source, "async function prepareConnections()")
      expect(block).toContain("isTaskCapableConnection(connection)")
    })

    /** 一条连接读失败不该清空别的连接已加载的任务。 */
    it("keeps loaded tasks when only some connections fail", () => {
      const block = extractFunctionBlock(source, "async function runLoadTasks()")
      expect(block).toContain("failures")
      expect(block).toContain("Promise.all")
      // 部分失败在列表末尾说明，不遮挡已加载的内容。
      expect(source).toContain("tasks-partial-error")
    })

    /** 筛选自愈：选中的连接/项目消失后要退回「全部」，而不是让用户面对空列表。 */
    it("self-heals a filter that points at a vanished connection or project", () => {
      const block = extractFunctionBlock(source, "function pruneFilterScope()")
      expect(block).toContain('filter.connectionKey = ""')
      expect(block).toContain("filter.folderId = 0")
    })

    it("persists the filter across sessions", () => {
      expect(source).toContain("readStoredTaskFilter")
      expect(source).toContain("writeStoredTaskFilter")
    })

    it("wires every action sheet the feature needs", () => {
      ;[
        "TaskEditorSheet",
        "TaskMergeSheet",
        "TaskAcceptSheet",
        "TaskCancelSheet",
        "TaskRestartSheet",
        "TaskScheduleSheet",
        "TaskFollowUpSheet",
        "TaskSettingsSheet",
        "TaskFilterSheet",
      ].forEach((component) => {
        expect(source).toContain(component)
      })
    })

    /**
     * 选项探测要带 `workingDir`，而 `filterProjectOptions` 只带名字 —— 路径得从
     * `activeBucket.projects`（`loadRemoteProjects` 的结果）里取。少传路径不会报错，
     * 只会让探测回来的是无目录上下文那份选项集，与引擎真正启动时读到的可能不同。
     */
    it("hands the settings sheet the project path its probe needs", () => {
      expect(source).toContain(':folderPath="settingsFolderPath"')
      const block = extractFunctionBlock(source, "function openSettingsSheet()")
      expect(block).toContain("activeBucket.value?.projects")
      expect(block).toContain("settingsFolderPath.value")
    })
  })

  /**
   * 智能体选项（授权模式 / 模型 / 推理程度）。
   *
   * 这一组的共同点是：**错了不会报错**，只会让任务悄悄跑在另一套配置上。所以判定全部
   * 收在 `pages/tasks/taskAgentConfig.ts`（有独立单测），这里只锁两个弹层确实用的是
   * 那一份、以及几处容易接错的线。
   */
  describe("agent options", () => {
    const editor = read("pages/tasks/components/TaskEditorSheet.vue")
    const settings = read("pages/tasks/components/TaskSettingsSheet.vue")
    const configSheet = read("pages/tasks/components/TaskAgentConfigSheet.vue")

    /** 探测命令与超时是既有契约（后端探测预算 60s，网关侧 70s），别换成别的命令。 */
    it("probes the same command the conversation flows probe", () => {
      ;[editor, settings].forEach((source) => {
        expect(source).toContain('"acp_describe_agent_options"')
        expect(source).toContain("workingDir")
      })
      ;["services/gateway/directGateway.ts", "services/gateway/relayGateway.ts"].forEach((file) => {
        expect(read(file)).toContain("acp_describe_agent_options: 70_000")
      })
    })

    /**
     * 快照归一化只有一份实现（`composerTools.createReadyDetailAgentConfigState`，经
     * `taskAgentConfigStateFromSnapshot` 转出）—— 它负责摘掉 `mode` 那个镜像配置项。
     * 自己 map 一遍 `snapshot.config_options` 会把那个镜像项画出来，而 replay 它会被
     * `acp_set_config_option` 拒绝（见 P53 笔记）。
     */
    it("normalizes every snapshot through the shared projection", () => {
      ;[editor, settings].forEach((source) => {
        expect(source).toContain("taskAgentConfigStateFromSnapshot")
        expect(source).toContain('from "../taskAgentConfig"')
        // 反向断言：不在组件里自己拆快照。
        expect(source).not.toContain("snapshot.config_options")
      })
      expect(read("pages/tasks/taskAgentConfig.ts")).toContain(
        "createReadyDetailAgentConfigState"
      )
    })

    /**
     * 保存写的是 `effectiveTaskAgentSelection` 的结果 —— 界面上正在显示的那份具体值。
     * 直接写 `selectedValues` 会漏掉用户没动过的选项（存空 = 跟随远端默认，而远端默认
     * 将来会变）；探测失败时它又会原样退回存储值，不至于把配置清空。
     */
    it("saves the pinned selection rather than the raw selected values", () => {
      const draft = extractFunctionBlock(editor, "function buildDraft(): WorkTaskDraft")
      expect(draft).toContain(
        "effectiveTaskAgentSelection(agentConfig.value, projectedSelection.value)"
      )
      expect(draft).toContain("mode_id: selection.mode_id")
      expect(draft).toContain("config_values: selection.config_values")
      expect(draft).toContain("taskAgentLabelSnapshot")
      // 没碰过 agent 的分支仍然写 null —— 继承不能被冻结成一份快照。
      expect(draft).toContain("agent_type: null")

      const save = extractFunctionBlock(settings, "async function save()")
      expect(save).toContain("effectiveTaskAgentSelection(agentConfig.value, storedSelection.value)")
      expect(save).toContain("taskAgentLabelSnapshot")
    })

    /**
     * 「记住每个 agent 上次配的选项」这条本机记忆。四条判定错了都不报错：要么记不住
     * （功能形同不存在），要么把一份用户没要的配置悄悄冻进任务里。
     */
    it("carries the per-agent option memory into a new task", () => {
      const memory = read("services/taskAgentOptionMemory.ts")

      // 记忆按 agent 分桶（这就是需求本身），且不按项目路径分桶 —— 模型/推理程度是
      // agent 级的概念，快照里已消失的取值由共享投影自然丢掉。
      expect(memory).toContain("export function readTaskAgentOptionMemory(")
      expect(memory).toContain("export function writeTaskAgentOptionMemory(")
      expect(memory).toContain("normalizeAgentType")
      expect(memory).not.toContain("projectPath")

      // 投影与保存都用叠加后的那一份，否则记忆只影响界面、存的还是文件夹默认值。
      expect(editor).toContain("mergeTaskAgentSelection(storedSelection.value, rememberedSelection.value)")
      const probe = extractFunctionBlock(editor, "async function loadAgentConfig()")
      expect(probe).toContain("taskAgentConfigStateFromSnapshot(cached, projectedSelection.value)")
      expect(probe).toContain("taskAgentConfigStateFromSnapshot(snapshot, projectedSelection.value)")

      // draft 的分支判据不能再是 `agentDirty`：记忆命中时用户没动过任何控件，界面上
      // 却已经显示着记忆里那套配置，走继承分支就是「显示一套、跑另一套」。
      const draft = extractFunctionBlock(editor, "function buildDraft(): WorkTaskDraft")
      expect(draft).toContain("if (!agentOverridden.value)")
      expect(draft).not.toContain("if (!agentDirty.value)")

      // 但 `agentDirty` 本身仍然只表示「用户动过」—— 它是 `syncEffectiveAgent()` 的闸门，
      // 被记忆置真的话换项目时 agent 就不再跟随新项目的默认值了。
      const sync = extractFunctionBlock(editor, "async function syncEffectiveAgent()")
      expect(sync).toContain("if (agentDirty.value ||")
      expect(sync).toContain("loadRememberedSelection()")
    })

    /**
     * 记忆只在**新建**时读。编辑已有任务必须显示服务端那一行的真实值 —— 否则用户改个
     * 标题就把这个任务的模型换了。模板与「恢复继承」同样要压住记忆，不然一个显式动作
     * 会被一份旧偏好悄悄盖回去。
     */
    it("lets the record, the template and the reset win over the memory", () => {
      const seed = extractFunctionBlock(editor, "function seedForm()")
      // 编辑分支关闸、新建分支开闸。
      expect(seed).toContain("agentMemoryEnabled.value = false")
      expect(seed).toContain("agentMemoryEnabled.value = true")

      const template = extractFunctionBlock(
        editor,
        "function applyTemplate(template: WorkTaskTemplate)"
      )
      expect(template).toContain("agentMemoryEnabled.value = false")

      const reset = extractFunctionBlock(editor, "function resetAgentOverride()")
      expect(reset).toContain("agentMemoryEnabled.value = false")
      // 关闸之后要立刻把叠加层撤下来，否则「恢复继承」看起来点了没反应。
      expect(reset).toContain("loadRememberedSelection()")

      // 换 agent 时重新开闸：旧选择已经清空，此时正需要新 agent 自己那份默认值。
      const confirm = extractFunctionBlock(editor, "function onAgentConfirm(event: any)")
      expect(confirm).toContain("agentMemoryEnabled.value = true")
      expect(confirm).toContain("loadRememberedSelection()")

      // 写入只发生在用户真的点了选项那两处，不在提交时 —— 否则一次「什么都没改就创建」
      // 会把探测快照的远端默认值冻成偏好。
      const mode = extractFunctionBlock(editor, "function selectAgentMode(modeId: string)")
      expect(mode).toContain("rememberCurrentSelection()")
      const value = extractFunctionBlock(
        editor,
        "function selectAgentConfigValue(payload: { configId: string; valueId: string })"
      )
      expect(value).toContain("rememberCurrentSelection()")
      expect(extractFunctionBlock(editor, "function submit()")).not.toContain(
        "rememberCurrentSelection()"
      )

      // 设置弹层是**共享**的文件夹默认值，不该被一台手机的个人偏好带着走。
      expect(settings).not.toContain("taskAgentOptionMemory")
    })

    /**
     * 选项与 agent 是一组三件套：`opus` 这种取值只在某个 agent 下有意义。换 agent 不清空
     * 会把一份跨 agent 的垃圾配置存进去；而动选项不置 dirty，则会让「本任务覆盖」在
     * `agent_type: null` 的分支里被整段丢弃。
     */
    it("keeps the agent and its options as one override unit", () => {
      const confirm = extractFunctionBlock(editor, "function onAgentConfirm(event: any)")
      expect(confirm).toContain("INHERITED_TASK_AGENT_SELECTION")
      expect(confirm).toContain("agentDirty.value = true")

      const mode = extractFunctionBlock(editor, "function selectAgentMode(modeId: string)")
      expect(mode).toContain("agentDirty.value = true")
      const value = extractFunctionBlock(
        editor,
        "function selectAgentConfigValue(payload: { configId: string; valueId: string })"
      )
      expect(value).toContain("agentDirty.value = true")

      // 恢复继承要把三样一起收回，否则选项行还显示着上一个 agent 的模型。
      const reset = extractFunctionBlock(editor, "function resetAgentOverride()")
      expect(reset).toContain("agentDirty.value = false")
      expect(reset).toContain("INHERITED_TASK_AGENT_SELECTION")

      // 设置弹层换 agent 时同样清空（那里没有 dirty 位，直接改 draft）。
      const settingsConfirm = extractFunctionBlock(settings, "function onAgentConfirm(event: any)")
      expect(settingsConfirm).toContain("INHERITED_TASK_AGENT_SELECTION")
      expect(settingsConfirm).toContain("draft.value.config_values = {}")
    })

    /** 生效设置与模板都存着三件套，只回填 agent 会让模型选择静默丢掉。 */
    it("carries mode and config through inheritance and templates", () => {
      const sync = extractFunctionBlock(editor, "async function syncEffectiveAgent()")
      expect(sync).toContain("readTaskAgentSelection(settings)")
      const template = extractFunctionBlock(
        editor,
        "function applyTemplate(template: WorkTaskTemplate)"
      )
      expect(template).toContain("readTaskAgentSelection(template.config)")
    })

    /**
     * 存储那份选择晚于探测落地是常态（探测走缓存能立刻返回，而设置/设置行要一次往返）。
     * 不重新投影的话，界面显示的是探测时那份（可能是上一次打开留下的）选择，而不是
     * 服务端这一行的真实值。
     */
    it("re-projects the stored selection when it lands after the probe", () => {
      ;[editor, settings].forEach((source) => {
        expect(source).toContain("function reprojectStoredSelection()")
        const block = extractFunctionBlock(source, "function reprojectStoredSelection()")
        expect(block).toContain('agentConfig.value.status !== "ready"')
        expect(block).toContain("taskAgentConfigStateFromSnapshot")
      })
      expect(extractFunctionBlock(editor, "async function syncEffectiveAgent()")).toContain(
        "reprojectStoredSelection()"
      )
      expect(extractFunctionBlock(settings, "async function loadSettings()")).toContain(
        "reprojectStoredSelection()"
      )
    })
    /**
     * 探测的 watch **不能依赖 `props.gateway`**：它是个对象，而列表每次后台刷新都会重建
     * 连接桶（于是换一个新实例）。依赖它会让一次刷新重新投影状态，把用户刚在弹层里
     * 选好的取值冲掉。
     */
    it("keys the probe on strings, not on the gateway object", () => {
      expect(editor).toContain(
        "() => [props.show, agentType.value, selectedProjectPath.value] as const"
      )
      expect(settings).toContain('props.folderPath || ""] as const')
      ;[editor, settings].forEach((source) => {
        expect(source).not.toContain("props.gateway] as const")
      })
    })

    /**
     * 切 agent / 切项目 / 关弹层之后回来的旧探测响应必须丢掉 —— 一次慢探测会把另一个
     * agent 的选项集写进状态，用户于是对着一份不属于当前 agent 的模型列表做选择。
     */
    it("discards a probe response that outlived its request", () => {
      ;[editor, settings].forEach((source) => {
        expect(source).toContain("let agentProbeToken = 0")
        expect(source).toContain("const token = ++agentProbeToken")
        expect(source).toContain("if (token !== agentProbeToken) return")
        // 关闭弹层也推进一格。
        expect(source).toContain("agentProbeToken += 1")
      })
    })

    /**
     * 「跟随全局」时不探测：那份配置属于全局那一行，保存走的是 delete，在这里改动
     * 只会被丢弃 —— 而探测本身要在远端现拉一个 CLI 进程。
     */
    it("skips the probe while a folder follows the global defaults", () => {
      expect(settings).toContain("const editing = computed(")
      expect(settings).toContain('source.value === "custom"')
      expect(settings).toContain('v-if="editing"')
      const probe = extractFunctionBlock(settings, "async function loadAgentConfig()")
      // 没定具体 agent 时也探不出东西来（真正要跑的由每个项目的默认值决定）。
      expect(probe).toContain("!agentType")
    })

    /**
     * 探测要现拉一个 agent，失败得能重试 —— 否则用户只能关掉弹层再开一次（而缓存
     * 里没有快照，等于重来一遍）。
     */
    it("offers a retry on a failed probe", () => {
      expect(configSheet).toContain('emit(\'reload\')')
      ;[editor, settings].forEach((source) => {
        expect(source).toContain('@reload="loadAgentConfig"')
      })
    })

    /**
     * 没有取值列表的配置项（ACP 的 boolean kind，例如 Cline 的 `auto_approve`）在 chip
     * 界面里会渲染成一个空的分组标题 —— 一行看不懂也点不动的字。
     */
    it("renders only options that have values to pick from", () => {
      expect(configSheet).toContain("selectableTaskConfigOptions")
      expect(configSheet).toContain('v-for="option in configOptions"')
    })

    /**
     * 两个弹层共用同一个选项组件，且它是**兄弟节点**而不是嵌在各自的 popup 里：
     * uview-plus 的 popup 各自 fixed 定位，嵌套时内层会被外层的 transform 上下文困住。
     */
    it("mounts one shared config sheet as a sibling popup", () => {
      ;[editor, settings].forEach((source) => {
        expect(source).toContain("<TaskAgentConfigSheet")
        expect(source).toContain('import TaskAgentConfigSheet from "./TaskAgentConfigSheet.vue"')
      })
    })

    /** 标签映射只有一份（`remoteSettings.AGENT_LABELS`），此前这两处各抄了一份副本。 */
    it("labels agents through the single shared map", () => {
      ;[editor, settings].forEach((source) => {
        expect(source).toContain("AGENT_DISPLAY_ORDER")
        expect(source).toContain('from "@/services/remoteSettings"')
        // 副本里 codex 曾被写成「Codex CLI」，而全局那份是「Codex」。
        expect(source).not.toContain('"Codex CLI"')
      })
    })

    /**
     * 详情页显示 `label_snapshot` 而不是原始 `agent_type`：那份快照带着这一轮实际用的
     * 模型，并且在 agent 被卸载之后依然说得出人话。
     */
    it("shows the resolved agent label on the detail header", () => {
      const detail = read("pages/task-detail/index.vue")
      expect(detail).toContain("const agentMetaText = computed(")
      expect(detail).toContain("label_snapshot")
      expect(detail).toContain("taskAgentLabel")
      // 反向断言：不再把原始 id 直接印在头部。
      expect(detail).not.toContain("{{ task.agent_type }}")
    })
  })

  describe("schedule sheet", () => {
    const source = read("pages/tasks/components/TaskScheduleSheet.vue")

    /**
     * `up-datetime-picker` 的两种 mode 绑定值**类型不同**（见 uview-plus
     * `u-datetime-picker` 的 `correctValue`）：`date` 吃毫秒时间戳，`time` 吃
     * `"HH:mm"` 字符串。给 time picker 传数字会走进「时间错误，请传递如 12:24 的
     * 格式」那条分支 —— 时间列直接不显示，且**不抛错**，所以只能在这里锁住。
     */
    it("binds the date picker to a timestamp and the time picker to HH:mm", () => {
      expect(source).toContain("const dayPickerValue = ref(Date.now())")
      expect(source).toContain('const timePickerValue = ref("09:00")')
      const block = extractFunctionBlock(source, "function onTimeConfirm(event: any)")
      // time 模式的 confirm 载荷是字符串，不能 Number() 它。
      expect(block).toContain("String(event?.value")
      expect(block).toContain("\\d{2}:\\d{2}")
      expect(block).not.toContain("Number(event?.value)")
    })

    /** 计划是本地墙上时钟，保存时才转成服务端存的 UTC 时刻。 */
    it("converts the local pick to a UTC instant only on save", () => {
      expect(source).toContain("parseLocalDateTime")
      expect(source).toContain("picked.value.toISOString()")
      // 清除计划送 null，而不是空串。
      expect(source).toContain("save(null)")
    })

    /** 没有计划时弹层是空的 —— 预填会让每个待办看起来都定了时。 */
    it("opens empty unless the task already has a plan", () => {
      expect(source).toContain("splitIsoToLocal(props.task?.scheduled_at)")
      expect(source).toContain("defaultTimeForDay")
    })
  })

  describe("detail page", () => {
    const source = read("pages/task-detail/index.vue")

    it("parses its route through the shared parser", () => {
      expect(source).toContain("parseTaskDetailRouteOptions")
      expect(source).toContain("onLoad(")
    })

    /** 动作区与列表卡片共用同一份判定，两处不会给出不同的可做事项。 */
    it("derives its action zone from the shared builder", () => {
      expect(source).toContain("buildTaskZoneActions")
      expect(source).toContain("isTaskActionAllowed")
      const block = extractFunctionBlock(source, "function handleZoneAction(id: TaskActionId)")
      expect(block).toContain("isTaskActionAllowed(current, id)")
    })

    it("loads the task, its events and its changed files", () => {
      expect(source).toContain("getWorkTask")
      expect(source).toContain("listWorkTaskEvents")
      expect(source).toContain("listWorkTaskChangedFiles")
    })

    /** worktree 不可用时连请求都不发 —— 服务端只能报错，而这不是错误状态。 */
    it("skips the changed-files request when the worktree is unusable", () => {
      const block = extractFunctionBlock(
        source,
        "async function loadChangedFiles(target: CodegGateway, current: WorkTask, seq: number)"
      )
      expect(block).toContain("isWorktreeUsable(current)")
    })

    it("shows the diff through the shared git diff viewer", () => {
      expect(source).toContain("GitDiffViewer")
      expect(source).toContain("buildGitDiffView")
      expect(source).toContain("getWorkTaskDiff")
    })

    /** 删除后主体已经不存在，留在这一页只会显示一个空壳。 */
    it("navigates back after a successful delete", () => {
      const block = extractFunctionBlock(source, "async function confirmDelete()")
      expect(block).toContain("deleteWorkTask")
      expect(block).toContain("navigateBack")
    })

    /** 删除 worktree 是可选项，只在确实有 worktree 时提供。 */
    it("offers the worktree checkbox only when there is one", () => {
      expect(source).toContain('v-if="hasWorktree"')
      expect(source).toContain("同时删除其 worktree")
    })

    it("opens the task's conversation with the worktree folder", () => {
      const block = extractFunctionBlock(source, "function openConversation()")
      expect(block).toContain("current.worktree_folder_id || current.folder_id")
      expect(block).toContain("/pages/conversation-detail/index?id=")
    })

    it("subscribes to the change channel and debounces the refetch", () => {
      expect(source).toContain("WORK_TASK_CHANGED_CHANNEL")
      const block = extractFunctionBlock(source, "function scheduleRefresh()")
      expect(block).toContain("300")
    })

    /**
     * 三条路（`onShow`、事件防抖、每个动作的 finally）都会调 `loadTask`，三个请求可以
     * 同时在飞而返回顺序不保证。没有序号守卫时，一个先发出、后返回的旧响应会把新状态
     * 盖回去 —— 用户会看到刚点的操作「没生效」。
     */
    it("drops a stale response instead of letting it overwrite newer state", () => {
      expect(source).toContain("let loadSeq = 0")
      const block = extractFunctionBlock(source, "async function loadTask()")
      expect(block).toContain("const seq = ++loadSeq")
      expect(block).toContain("if (seq !== loadSeq) return")
      // 两个从属请求也各自带序号，否则它们的旧结果仍会覆盖。
      expect(source).toContain("async function loadEvents(target: CodegGateway, seq: number)")
      expect(source).toContain(
        "async function loadChangedFiles(target: CodegGateway, current: WorkTask, seq: number)"
      )
    })

    it("renders the append-only timeline with round markers filtered out", () => {
      expect(source).toContain("isVisibleTaskEvent")
      expect(source).toContain("taskEventLabel")
      expect(source).toContain("taskEventDetail")
    })

    it("keeps the non-advancing utilities in a footer bar", () => {
      expect(source).toContain("task-detail-footer")
      expect(source).toContain("打开会话")
      expect(source).toContain("重试清理")
      expect(source).toContain("删除")
    })
  })

  describe("shared stylesheet", () => {
    /**
     * `<style scoped>` 不跨组件边界，所以共享类必须住在 `pages/tasks/index.scss`
     * 并由每一方 `@import` —— 与 `pages/conversations/index.scss` 同一套办法。
     */
    it("keeps the shared classes in one sheet every consumer imports", () => {
      const sheet = read("pages/tasks/index.scss")
      ;[".task-status-chip", ".task-badge", ".task-sheet", ".task-form-group", ".task-chip", ".task-notice"].forEach(
        (className) => {
          expect(sheet).toContain(className)
        }
      )
      ;[
        "pages/tasks/index.vue",
        "pages/tasks/components/TaskCard.vue",
        "pages/tasks/components/TaskStatusChip.vue",
        "pages/tasks/components/TaskEditorSheet.vue",
        "pages/tasks/components/TaskAgentConfigSheet.vue",
        "pages/tasks/components/TaskMergeSheet.vue",
        "pages/tasks/components/TaskAcceptSheet.vue",
        "pages/tasks/components/TaskCancelSheet.vue",
        "pages/tasks/components/TaskRestartSheet.vue",
        "pages/tasks/components/TaskScheduleSheet.vue",
        "pages/tasks/components/TaskFollowUpSheet.vue",
        "pages/tasks/components/TaskSettingsSheet.vue",
        "pages/tasks/components/TaskFilterSheet.vue",
        "pages/task-detail/index.vue",
      ].forEach((file) => {
        expect(read(file)).toContain("index.scss")
      })
    })

    /** AGENTS.md：只用 `--up-*` 运行时变量，不新增 `--mcode-*` 别名。 */
    it("styles only through --up-* theme variables", () => {
      const files = [
        "pages/tasks/index.scss",
        "pages/tasks/index.vue",
        "pages/tasks/components/TaskCard.vue",
        "pages/task-detail/index.vue",
      ]
      files.forEach((file) => {
        // 注释里提到这个前缀是允许的（`index.scss` 顶部就在解释这条规矩）；
        // 被禁的是真正声明或读取它，也就是 `var(--mcode-…)` 与 `--mcode-…:`。
        const source = read(file)
        expect(source).not.toMatch(/var\(\s*--mcode-/)
        expect(source).not.toMatch(/^\s*--mcode-[\w-]+\s*:/m)
      })
    })

    /**
     * `upThemeVar` 是 uview-plus 用 Options API mixin 注入的，`<script setup>` 里
     * 裸调会 ReferenceError（在 computed 里还会静默失败）—— 必须经实例代理取。
     */
    it("reaches upThemeVar through the instance proxy in every component", () => {
      ;[
        "pages/tasks/index.vue",
        "pages/tasks/components/TaskCard.vue",
        "pages/tasks/components/TaskStatusChip.vue",
        "pages/tasks/components/TaskPageHeader.vue",
        "pages/task-detail/index.vue",
      ].forEach((file) => {
        const source = read(file)
        expect(source).toContain("getCurrentInstance()")
        expect(source).toContain("currentInstance?.proxy?.upThemeVar")
      })
    })
  })
})
