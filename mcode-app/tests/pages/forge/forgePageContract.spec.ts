import fs from "node:fs"
import path from "node:path"

const root = path.resolve(__dirname, "../../../src")

function read(relative: string) {
  return fs.readFileSync(path.join(root, relative), "utf8")
}

function extractFunctionBlock(source: string, signature: string) {
  const start = source.indexOf(signature)
  if (start < 0) throw new Error(`signature not found: ${signature}`)
  const end = source.indexOf("\n}", start)
  return source.slice(start, end < 0 ? undefined : end + 2)
}

/**
 * 仓库面板的**源码扫描契约**。
 *
 * 组件从不被挂载（jest 配的是 `testEnvironment: node`，仓库里没有
 * @vue/test-utils），所以模板与接线的不变量只能按字符串断言。每一条都对应一个
 * 具体的坑，注释说明它防的是什么 —— 与 `tests/pages/tasks/tasksPageContract.spec.ts`
 * 同一套做法。
 */
describe("forge page contract", () => {
  it("registers the forge pages without touching the tabBar", () => {
    const pages = JSON.parse(read("pages.json"))
    const paths = pages.pages.map((page: any) => page.path)
    expect(paths).toContain("pages/forge/index")
    expect(paths).toContain("pages/forge-item/index")
    expect(paths).toContain("pages/forge-accounts/index")

    // tabBar 已经 5 项，仓库面板是从任务页顶部进的二级页，**不加第 6 项**。
    expect(pages.tabBar.list).toHaveLength(5)
    expect(pages.tabBar.list.map((item: any) => item.pagePath)).not.toContain("pages/forge/index")
    // `CONVERSATIONS_TABBAR_INDEX = 1` 是按位置取的（`uni.setTabBarBadge({index})`）。
    expect(pages.tabBar.list[1].pagePath).toBe("pages/conversations/index")
  })

  /** 从别处 navigateTo 进来的二级页用原生 navbar（与既有三个 git 页一致），省去自己画返回。 */
  it("keeps the native navbar and pull-to-refresh on every forge page", () => {
    const pages = JSON.parse(read("pages.json"))
    ;["pages/forge/index", "pages/forge-item/index", "pages/forge-accounts/index"].forEach(
      (path) => {
        const page = pages.pages.find((item: any) => item.path === path)
        expect(page.style.navigationStyle).toBeUndefined()
        // 下拉刷新必须在 pages.json 里开，否则 onPullDownRefresh 永远不触发。
        expect(page.style.enablePullDownRefresh).toBe(true)
      }
    )
  })

  describe("entry from the task page", () => {
    const header = read("pages/tasks/components/TaskPageHeader.vue")
    const tasks = read("pages/tasks/index.vue")

    /** uview 内置图标集里唯一的 GitHub 图标。写错名字时 u-icon 会把 name 当字面文本渲染出来 —— 不报错，只是一行乱码。 */
    it("puts a github icon in the task header tools", () => {
      expect(header).toContain('name="github-circle-fill"')
      expect(header).toContain("task-header__tool")
      expect(header).toContain(`emit('openForge')`)
      expect(header).toContain('(event: "openForge"): void')
    })

    it("wires the header emit through to a navigateTo", () => {
      expect(tasks).toContain('@openForge="openForgePanel"')
      const block = extractFunctionBlock(tasks, "function openForgePanel()")
      expect(block).toContain("buildForgeRoute")
      expect(block).toContain("navigateTo")
    })

    /**
     * 跳转前把全局 auth 切过去，让新页首屏就用对网关（与 `openTaskDetail` 同一套路），
     * 否则第一次请求会打到上一条连接上并失败一次。
     */
    it("applies the connection auth before navigating", () => {
      const block = extractFunctionBlock(tasks, "function openForgePanel()")
      expect(block).toContain("applyConnectionAuth")
    })

    /** forge 与 work_task 一样是 codeg 独占，先过一遍能力判定而不是让请求 404。 */
    it("filters to forge-capable connections", () => {
      const block = extractFunctionBlock(tasks, "function openForgePanel()")
      expect(block).toContain("isForgeCapableConnection")
    })

    /**
     * 作用域三级回退，且**存储优先于当前筛选** —— 「上次看的仓库」比「任务列表当前
     * 筛到哪台机器」更可能是他现在想看的。
     */
    it("prefers the remembered connection over the task filter", () => {
      const block = extractFunctionBlock(tasks, "function openForgePanel()")
      expect(block).toContain("readStoredForgeScope")
      expect(block.indexOf("stored.connectionId")).toBeLessThan(block.indexOf("activeBucket"))
    })

    /**
     * 任务页的项目筛选（可能是 0 = 全部）与「看哪个仓库」不是同一个问题，
     * 硬塞进去会让面板打开在一个用户没选过的仓库上。
     */
    it("does not push the task filter's folder into the forge route", () => {
      const block = extractFunctionBlock(tasks, "function openForgePanel()")
      expect(block).not.toContain("folderId: filter.folderId")
      expect(block).toContain("folderId: 0")
    })
  })

  describe("list page", () => {
    const source = read("pages/forge/index.vue")

    /**
     * **最重要的一条。** 任务页的 `onShow` 是无条件重拉，forge 照抄就完了：GitHub 的
     * 列表来自 search 索引，落后写入几秒到几分钟，从详情页返回时重拉极大概率拿回
     * 「刚刚被改掉的那个状态」并盖上去 —— 用户看着关闭成功的 issue 又变回 open。
     */
    it("only reloads on show when the previous request failed", () => {
      const block = extractFunctionBlock(source, "onShow(() => {")
      expect(block).toContain("scopeError.value")
      expect(block).toContain("listError.value")
      // 成功态直接 return，不发任何请求。
      expect(block).toContain("return")
      expect(block).not.toContain("void reloadScope()\n  void reloadList()")
    })

    /**
     * `folder_forge_remote` 要服务端 fork 一个 `git remote get-url origin` 子进程，
     * 所以只在**切项目**时探测 —— 不能进下拉刷新，也不能进事件回调。
     */
    it("probes the forge remote only when the project changes", () => {
      expect(extractFunctionBlock(source, "async function handleSelectProject(")).toContain(
        "probeRemote"
      )
      expect(extractFunctionBlock(source, "onPullDownRefresh(() => {")).not.toContain("probeRemote")
      expect(extractFunctionBlock(source, "async function reloadList()")).not.toContain(
        "probeRemote"
      )
    })

    /** 前两种前置状态在探测期就能判定，此时**一个 forge 请求都不该发**。 */
    it("refuses to spend a forge request on an unusable remote", () => {
      const block = extractFunctionBlock(source, "async function probeRemote()")
      expect(block).toContain("!remote.value.supported")
      expect(block).toContain("resetRepositoryState()")
      const list = extractFunctionBlock(source, "async function reloadList()")
      expect(list).toContain("remote.value?.supported")
      // 标签也不能拉：它同样打 forge API。
      expect(extractFunctionBlock(source, "async function loadLabels()")).toContain(
        "remote.value?.supported"
      )
    })

    /** 三种前置状态全走统一的状态卡组件，而不是各写一段 UI。 */
    it("renders all three precondition states through the shared state card", () => {
      expect(source).toContain("ProjectUnsupportedState")
      expect(source).toContain("不是 forge 仓库")
      expect(source).toContain("暂不支持这个代码托管平台")
      expect(source).toContain("actionText=\"切换项目\"")
    })

    /** 单调代际：过期响应直接丢，否则慢的那个赢会把新数据盖回旧的。 */
    it("drops a stale list response", () => {
      expect(source).toContain("let listSeq = 0")
      const block = extractFunctionBlock(source, "async function reloadList()")
      expect(block).toContain("const seq = ++listSeq")
      expect(block).toContain("if (seq !== listSeq) return")
    })

    /**
     * `openConnectionGateway` 会就地改写传入的 connection（补 id / baseUrl），
     * 连接键必须在它之后重算，否则存下来的是旧键。
     */
    it("recomputes the connection key after opening the gateway", () => {
      const block = extractFunctionBlock(source, "async function reloadScope()")
      expect(block.indexOf("openConnectionGateway")).toBeLessThan(
        block.indexOf("scope.connectionKey = buildConnectionKey(target)")
      )
    })

    /**
     * 换仓库时要清一整套状态，漏一个就有一类 bug —— 所以它们收在**一个**函数里
     * （切项目与切连接两条路都走它），而不是各写一遍。
     */
    it("clears the whole per-repository state when the project changes", () => {
      const block = extractFunctionBlock(source, "async function handleSelectProject(")
      expect(block).toContain("remote.value = null")
      expect(block).toContain("resetRepositoryState()")

      const reset = extractFunctionBlock(source, "function resetRepositoryState()")
      expect(reset).toContain("rows.value = []")
      expect(reset).toContain("paging.value")
      // 两个 tab 的计数：countsScope 含 folderId，旧数字已经不描述任何东西。
      expect(reset).toContain("emptyForgeTabCounts()")
      // 标签是每个仓库自己的词汇表 —— 选项与**已选**都要清，否则旧选择会在新仓库
      // 里筛出一个空列表而用户无从知道为什么。
      expect(reset).toContain("labelOptions.value = []")
      expect(reset).toContain("filter.labels = []")
      // 失败态与它的分类一起清（`clearListError`）—— 只清文案会留下一颗指向旧主机的
      // 「添加账号」按钮。
      expect(reset).toContain("clearListError()")
      // 开着的弹层也要关：新建 issue 的弹层开着时切项目会开到另一个仓库去。
      expect(reset).toContain("showFilterSheet.value = false")
    })

    /** 分类必须和文案一起清 —— 否则换了仓库还挂着上一个 host 的恢复动作。 */
    it("clears the classified error together with its message", () => {
      const block = extractFunctionBlock(source, "function clearListError()")
      expect(block).toContain("listError.value")
      expect(block).toContain("listErrorInfo.value = null")
    })

    /** 切连接与切项目共用同一套清理，不要各写一份（那是分叉的起点）。 */
    it("reuses the same reset when the connection changes", () => {
      expect(extractFunctionBlock(source, "async function handleSelectConnection(")).toContain(
        "resetRepositoryState()"
      )
    })

    /** 切连接必须清 folderId：folder_id 是按连接的，跨连接复用会指向一个不存在的文件夹。 */
    it("clears the folder when the connection changes", () => {
      const block = extractFunctionBlock(source, "async function handleSelectConnection(")
      expect(block).toContain("scope.folderId = 0")
      expect(block).toContain("applyConnectionAuth")
    })

    /** 已有数据时失败不遮挡已加载的行，只在列表末尾说明（同任务页的 partial-error）。 */
    it("keeps a partial failure out of the way of loaded rows", () => {
      expect(source).toContain('v-if="listError && rows.length > 0"')
      expect(source).toContain("forge-notice--error")
    })

    /** 外链一律走 guard（会对非可信域名弹确认），不要直接 openURL。 */
    it("opens every external link through the guard", () => {
      expect(source).toContain("openGuardedExternalUrl")
      expect(source).not.toContain("plus.runtime.openURL")
    })
  })

  /**
   * ## 配额纪律
   *
   * GitHub 的列表走 `/search/issues`，**30 次/分钟**。这一组断言每一条都对应一个
   * 会把配额烧光的写法。
   */
  describe("quota discipline", () => {
    const source = read("pages/forge/index.vue")

    /** 逐字符发请求两句话就打爆配额，之后所有请求都是 403。 */
    it("debounces the search by 500ms", () => {
      expect(source).toContain("SEARCH_DEBOUNCE_MS = 500")
      const block = extractFunctionBlock(source, "function handleKeywordChange(")
      expect(block).toContain("clearTimeout(searchTimer)")
      expect(block).toContain("SEARCH_DEBOUNCE_MS")
      // 防抖定时器必须在 onUnload 里清掉，否则页面卸载后还会发一次请求。
      expect(extractFunctionBlock(source, "onUnload(() => {")).toContain("clearTimeout(searchTimer)")
    })

    /**
     * **切 tab 不能产生额外请求。** 可见 tab 的计数搭在它自己的列表响应里，隐藏 tab
     * 的按 `countsScope`（不含 tab）缓存 —— 所以切 tab 只重拉列表（那是用户要看的
     * 内容），一次计数探测都不发。
     */
    it("does not spend a count probe on a tab switch", () => {
      const block = extractFunctionBlock(source, "function handleTabChange(")
      expect(block).toContain("reloadList")
      expect(block).not.toContain("fetchForgeTabCount")
      expect(block).not.toContain("ensureHiddenTabCount")
      expect(block).not.toContain("loadLabels")
      // 计数不能在切 tab 时被清空 —— 清了就等于下一次必然重新探测。
      expect(block).not.toContain("emptyForgeTabCounts")
    })

    /** 可见 tab 的数字取自列表响应，而不是再问一次。 */
    it("reads the visible tab's count off its own list response", () => {
      const block = extractFunctionBlock(source, "async function reloadList()")
      expect(block).toContain("tabCountFromList(list")
      expect(block).not.toContain("fetchForgeTabCount")
    })

    /** 探测请求只在缓存的数字已经不描述当前筛选时才发。 */
    it("probes only the hidden tab and only when its number is stale", () => {
      const block = extractFunctionBlock(source, "async function ensureHiddenTabCount()")
      expect(block).toContain("shouldProbeForgeTabCount")
      expect(block).toContain("hiddenForgeTab(filter.tab)")
    })

    /** 探测失败静默：一个没有数字的徽章远好过一条用户点不动的错误，而列表已经成功了。 */
    it("swallows a failed count probe", () => {
      const block = extractFunctionBlock(source, "async function ensureHiddenTabCount()")
      expect(block).toContain("console.warn")
      expect(block).not.toContain("listError.value")
    })

    /** 标签是仓库级事实，切仓库时拉一次，不随筛选变化。 */
    it("loads the label vocabulary once per repository", () => {
      expect(extractFunctionBlock(source, "async function probeRemote()")).toContain("loadLabels()")
      expect(extractFunctionBlock(source, "async function reloadList()")).not.toContain(
        "loadLabels"
      )
      expect(extractFunctionBlock(source, "function applyFilter<")).not.toContain("loadLabels")
    })

    /**
     * 追加分页必须过 `canLoadMoreForgeRows` —— 它含天花板判据。GitHub 在越过 1000 条
     * 时 `has_next` 仍是 true，照着翻就是一次 422。
     */
    it("guards the append against the reachable ceiling", () => {
      const block = extractFunctionBlock(source, "async function loadMore()")
      expect(block).toContain("canLoadMoreForgeRows")
      expect(block).toContain("appendForgeRows")
    })

    /** 三条独立代际：共用一个会让它们互相取消，于是徽章永远停在旧值上。 */
    it("gives the list and the count probe separate generations", () => {
      expect(source).toContain("let listSeq = 0")
      expect(source).toContain("let countSeq = 0")
      expect(extractFunctionBlock(source, "async function ensureHiddenTabCount()")).toContain(
        "++countSeq"
      )
    })
  })

  /**
   * ## 结构化错误
   *
   * forge 有三个**可恢复**的失败，判据是 `i18n_key` 而不是 message 子串 —— Rust 侧
   * 注释明说 code 被多种失败共用（死 token 与无账号会撞同一个 code），认错的代价是
   * token 过期时给用户一颗解决不了问题的「添加账号」按钮。
   */
  describe("structured errors", () => {
    const source = read("pages/forge/index.vue")

    it("classifies a list failure by its i18n key", () => {
      expect(source).toContain("classifyForgeError")
      expect(extractFunctionBlock(source, "function setListError(")).toContain(
        "classifyForgeError"
      )
    })

    /** 有账号出路时按钮去账号页，否则退回重试 —— 两种失败的下一步不同。 */
    it("routes the recovery action by kind", () => {
      const block = extractFunctionBlock(source, "function handleListErrorAction()")
      expect(block).toContain("forgeErrorWantsAccount")
      expect(block).toContain("goToAccounts")
      expect(block).toContain("reloadList")
    })

    /**
     * `wrongForge` 静默重试**一次**：后端返回它时已经把 host 的归类改正了，把它摊给
     * 用户等于把自家的记账问题当成用户的问题。第二次同样的 key 就摊开 —— 后端不会对
     * 同一个 host 报两次。
     */
    it("silently corrects a wrong-forge failure exactly once per folder", () => {
      expect(source).toContain("correctedFolders")
      const block = extractFunctionBlock(source, "async function handleWrongForge(")
      expect(block).toContain("forgeErrorWantsRetry")
      expect(block).toContain("correctedFolders.has(scope.folderId)")
      expect(block).toContain("correctedFolders.add(scope.folderId)")
      // 重探而不只是重拉：归类变了意味着 provider 也变了，而 source key 依赖它。
      expect(block).toContain("probeRemote()")
    })

    /** 首屏失败与追加失败共用同一份分类文案，不要各写一句。 */
    it("shares one classified message between the state card and the notice", () => {
      expect(source).toContain(":text=\"listErrorText\"")
      expect(source).toContain("{{ listErrorText }}")
      expect(source).toContain(":title=\"listErrorTitle\"")
    })

    /** provider 只能从错误或远端探测来 —— 客户端从不自己猜（那等于替用户选一份凭据）。 */
    it("never guesses the provider when routing to the accounts page", () => {
      const block = extractFunctionBlock(source, "function goToAccounts(")
      expect(block).toContain("remote.value?.provider")
      expect(block).not.toContain("guessForgeProvider")
    })
  })

  describe("accounts page", () => {
    const source = read("pages/forge-accounts/index.vue")

    /**
     * **保存必须先存 token 再写 accounts。** 反过来的话中间失败会留下一个有身份、
     * 没凭据的账号行 —— forge 会挑中它然后 401，用户看到的是「token 无效」而不是
     * 「保存没成功」。
     */
    it("stores the token before the account row", () => {
      const block = extractFunctionBlock(source, "async function handleSubmit(")
      expect(block.indexOf("saveForgeAccountToken")).toBeGreaterThan(0)
      expect(block.indexOf("saveForgeAccountToken")).toBeLessThan(
        block.indexOf("saveForgeAccounts")
      )
    })

    /**
     * **替换 token 必须沿用原 id。** 每个 forge 触发的任务都把它钉在
     * `source_meta.account_id` 上，换 id 会让那些任务失去可交付的身份 —— 而失败发生
     * 在几小时后任务跑完时，那时没人会想到是换 token 引起的。
     */
    it("keeps the account id when replacing a token", () => {
      const block = extractFunctionBlock(source, "async function handleSubmit(")
      expect(block).toContain("isReplacing")
      expect(block).toContain("editingId.value")
      expect(block).toContain("buildForgeAccountId")
    })

    /** 删除时顺序相反（先写 accounts 再删 token）：孤儿 token 无害，孤儿账号行会 401。 */
    it("drops the account row before its token", () => {
      const block = extractFunctionBlock(source, "async function removeAccount(")
      expect(block.indexOf("saveForgeAccounts")).toBeLessThan(
        block.indexOf("deleteForgeAccountToken")
      )
    })

    /**
     * 校验是必须的：账号行里的 username / avatar / scopes 全部来自它，跳过就只能存
     * 一个空身份 —— 而那个用户名会被当成 git 推送时的凭据用户名。
     */
    it("validates before it saves even if the user never pressed validate", () => {
      const block = extractFunctionBlock(source, "async function handleSubmit(")
      expect(block).toContain("validateForgeToken")
      expect(block).toContain("if (!result.success)")
    })

    /** 撞车要说清出路是「替换 Token」而不是让用户自己琢磨。 */
    it("points a duplicate at the replace flow", () => {
      const block = extractFunctionBlock(source, "async function handleSubmit(")
      expect(block).toContain("findConflictingAccount")
      expect(block).toContain("替换 Token")
    })

    /** 删除的确认框要说清后果：已触发的任务会失去交付身份。 */
    it("spells out what deleting an account breaks", () => {
      const block = extractFunctionBlock(source, "function confirmRemove(")
      expect(block).toContain("showModal")
      expect(block).toContain("无法推送分支")
    })

    /** 从错误跳过来时预填主机 —— 让他再手打一遍是把一个已知答案伪装成一道题。 */
    it("prefills the host it was sent here to fix", () => {
      expect(source).toContain("pendingHost")
      expect(extractFunctionBlock(source, "function openCreateSheet()")).toContain(
        "pendingHost.value"
      )
    })
  })

  /**
   * ## 列表 ↔ 详情
   *
   * 桌面端详情是与列表共享 state 的非模态抽屉；手机端是独立页面，所以那条双向线要靠
   * `services/forge/forgeRowInbox` 补。这一组锁住「写回而不是重拉」这个决定。
   */
  describe("list and detail", () => {
    const list = read("pages/forge/index.vue")
    const detail = read("pages/forge-item/index.vue")

    /** seed 让详情首屏不用等请求，也绕开了「issue body 16000 字塞不进 URL」。 */
    it("hands the row to the detail page through the inbox, not the url", () => {
      const block = extractFunctionBlock(list, "function openItem(")
      expect(block).toContain("putForgeSeed")
      expect(block).toContain("buildForgeItemRoute")
      // 路由里只有坐标 —— 内容走信箱。
      expect(block).not.toContain("row.title")
      expect(block).not.toContain("row.body")
      expect(detail).toContain("takeForgeSeed")
    })

    /**
     * **最重要的一条。** 详情页交出**权威行**（写操作的响应），列表原地替换 ——
     * 而不是重拉。GitHub 的列表来自 search 索引，落后写入几秒到几分钟，重拉会把刚改完
     * 的状态盖回旧值。
     */
    it("applies the write-back instead of reloading the list", () => {
      const block = extractFunctionBlock(list, "function applyPendingWrites()")
      expect(block).toContain("drainForgeRowUpdates")
      expect(block).toContain("replaceForgeRow")
      expect(block).not.toContain("reloadList")
      // onShow 先排空信箱，再（只在失败态）决定要不要重拉。
      const onShow = extractFunctionBlock(list, "onShow(() => {")
      expect(onShow.indexOf("applyPendingWrites()")).toBeLessThan(onShow.indexOf("listError.value"))
    })

    /** 切仓库要丢掉信箱：那些写回已经过时，留着会盖掉一次刚成功的刷新。 */
    it("drops the inbox when the repository changes", () => {
      expect(extractFunctionBlock(list, "function resetRepositoryState()")).toContain(
        "clearForgeInbox"
      )
    })

    /** 关闭 / 重开的响应是权威的，但要补回 GitLab 单条目响应没带的标签颜色。 */
    it("merges the authoritative row rather than flipping state locally", () => {
      const block = extractFunctionBlock(detail, "async function applyStateChange(")
      expect(block).toContain("setForgeItemState")
      expect(block).toContain("mergeForgeRowUpdate")
      expect(block).toContain("publishRow")
      // 不本地翻转 —— 一个刚在浏览器里被合并的 PR 会以 merged 回来。
      expect(block).not.toContain('state: "closed"')
    })

    /** 连接键要在 openConnectionGateway 之后重算，否则写回投进一个没人读的格子。 */
    it("recomputes the connection key before publishing a write-back", () => {
      const block = extractFunctionBlock(detail, "async function reload()")
      expect(block.indexOf("openConnectionGateway")).toBeLessThan(
        block.indexOf("route.value.connectionKey = buildConnectionKey(target)")
      )
    })
  })

  describe("item detail page", () => {
    const source = read("pages/forge-item/index.vue")

    /**
     * `v-if=mounted` + `v-show=active`：只用 v-if 会在切 tab 时丢掉已加载的评论页
     * （用户往回一切，刚发的评论没了）；全挂 v-show 会给只想看讨论的人预先花掉另外
     * 两次请求。
     */
    it("keeps a visited pane mounted while hiding it", () => {
      expect(source).toContain('mounted.has(\'conversation\')')
      expect(source).toContain("v-show=\"activeTab === 'conversation'\"")
      const block = extractFunctionBlock(source, "function handleTabChange(")
      expect(block).toContain("mounted.value.has(next)")
    })

    /** 三个分区各有自己的分页，`onReachBottom` 全都触发会一次花掉三次请求。 */
    it("dispatches reach-bottom to the active pane only", () => {
      const block = extractFunctionBlock(source, "onReachBottom(() => {")
      expect(block).toContain('activeTab.value === "conversation"')
      expect(block).toContain("loadMoreComments")
    })

    /** issue 只有对话 —— 不给它画两个空 tab。 */
    it("only shows the subsection when there is more than one pane", () => {
      expect(source).toContain('v-if="tabs.length > 1"')
      expect(source).toContain("forgeDetailTabsFor")
    })

    /**
     * 冷启动直达（没有 seed）时要用 `state: "all"` 拉 —— 用户可能从通知直达一个已关闭
     * 的条目，默认的 open 筛选会让它「不存在」。
     */
    it("finds a closed item on a cold open", () => {
      const block = extractFunctionBlock(source, "async function fetchRow(")
      expect(block).toContain('state: "all"')
    })

    /** 有 seed 就不重复拉那一行 —— 它来自列表响应，与详情要显示的完全一样。 */
    it("skips the row fetch when a seed arrived", () => {
      expect(extractFunctionBlock(source, "async function reload()")).toContain("if (!row.value)")
    })

    /**
     * 发评论用 forge 返回的那一条（带真实 id / 时间 / 永久链接），而不是本地拼一个乐观
     * 条目 —— 后者没有 id，会在下一次翻页时和真的那条重复出现。
     */
    it("appends the comment the forge stored, not an optimistic stub", () => {
      const block = extractFunctionBlock(source, "async function submitComment(")
      expect(block).toContain("appendPostedForgeComment(comments.value, posted)")
      expect(block).toContain("createForgeComment")
    })

    /** 评论数 +1 要写回列表：那个数字在列表行上，用户返回时要看到它变了。 */
    it("publishes the bumped comment count back to the list", () => {
      const block = extractFunctionBlock(source, "async function submitComment(")
      expect(block).toContain("comments: row.value.comments + 1")
      expect(block).toContain("publishRow")
    })

    /**
     * 失败时**不能**自动重试也不能诱导重试：一次 POST 可能已经到达 forge 而只是响应
     * 丢了，重试就是发两遍到一个别人在读的线程里。
     */
    it("never retries a posted comment", () => {
      const block = extractFunctionBlock(source, "async function submitComment(")
      expect(block).toContain("forgeCommentFailureText")
      expect(block).not.toMatch(/for\s*\(|while\s*\(|retry/i)
    })

    /** 关闭 / 重开走系统模态（没有表单字段），文案由纯模块给。 */
    it("confirms a state change through a system modal", () => {
      const block = extractFunctionBlock(source, "function confirmStateChange()")
      expect(block).toContain("forgeStateConfirmText")
      expect(block).toContain("showModal")
    })

    /** 两条独立代际：条目本身与评论线程由不同动作触发，共用一个会互相取消。 */
    it("gives the row and the thread separate generations", () => {
      expect(source).toContain("let rowSeq = 0")
      expect(source).toContain("let commentsSeq = 0")
    })
  })

  /**
   * ## PR 的三个分区
   *
   * 这一组几乎全部在锁「不能压平的 null」。每条都对应一个具体的错误显示。
   */
  describe("pull request panes", () => {
    const source = read("pages/forge-item/index.vue")

    /**
     * 分区数据**只在第一次访问时**拉：预先拉会给只想看讨论的人白花两次请求，而每次
     * 切回来重拉又会让已加载的文件分页丢掉。
     */
    it("loads a pane's data on its first visit only", () => {
      const block = extractFunctionBlock(source, "function handleTabChange(")
      expect(block).toContain("const firstVisit = !mounted.value.has(next)")
      expect(block).toContain("if (firstVisit)")
      expect(block).toContain("reloadChangeDetail()")
      expect(block).toContain("reloadChangeFiles()")
    })

    /** 三个分区各有自己的代际 —— 三颗刷新按钮互不相干。 */
    it("gives each pane its own generation", () => {
      expect(source).toContain("let detailSeq = 0")
      expect(source).toContain("let filesSeq = 0")
    })

    /** 文件分页也要按路径去重 —— 一个变更里同一个文件只会出现一次。 */
    it("dedupes appended files by path", () => {
      const block = extractFunctionBlock(source, "async function loadMoreChangeFiles(")
      expect(block).toContain("new Set(changedFiles.value.map((file) => file.path))")
    })

    /** issue 没有这两个分区 —— 对它调这两个函数会打到一个不存在的端点。 */
    it("refuses to fetch change data for an issue", () => {
      expect(extractFunctionBlock(source, "async function reloadChangeDetail(")).toContain(
        'route.value.kind !== "pr"'
      )
      expect(extractFunctionBlock(source, "async function reloadChangeFiles(")).toContain(
        'route.value.kind !== "pr"'
      )
    })
  })

  describe("merge", () => {
    const source = read("pages/forge-item/index.vue")
    const sheet = read("pages/forge-item/components/ForgeMergeSheet.vue")

    /**
     * **`headSha` 必须在打开弹层那一刻捕获，不能在确认时重读。** 面板是拿着一份 diff、
     * 一份文件表和一组检查项（都描述同一个提交）做的决定；一次静默落地了更新提交的
     * 合并会把那段对话里没人看过的代码合进去。
     */
    it("captures the head sha when the sheet opens", () => {
      expect(source).toContain("capturedHeadSha")
      const open = extractFunctionBlock(source, "async function openMergeSheet(")
      expect(open).toContain("capturedHeadSha.value = changeDetail.value?.head_sha || null")
      // 确认时原样送出 —— 不重读 detail。
      const apply = extractFunctionBlock(source, "async function applyMerge(")
      expect(apply).toContain("headSha: capturedHeadSha.value")
      expect(apply).not.toContain("changeDetail.value?.head_sha")
    })

    /**
     * **返回 `null` 是成功**（合并成功但回读那一行失败）。报成失败会让人去把一个不可逆
     * 的操作再做一遍。
     */
    it("treats a null merge result as success", () => {
      const block = extractFunctionBlock(source, "async function applyMerge(")
      expect(block).toContain('{ ...current, state: "merged" }')
      expect(block).toContain("publishRow(merged)")
      expect(block).toContain("已合并")
    })

    /** 合并方式是仓库级事实，只拉一次 —— 折进 detail 会让每个只为读打开的变更都白花。 */
    it("fetches the merge options at most once", () => {
      const block = extractFunctionBlock(source, "async function ensureMergeOptions(")
      expect(block).toContain("mergeOptions.value) return")
      // 读不到就退化成只提供 merge，而不是拦住整个合并。
      expect(block).toContain("console.warn")
    })

    /** 合并前要过系统模态，且文案点名目标分支。 */
    it("confirms through a modal that names the base branch", () => {
      const block = extractFunctionBlock(source, "function confirmMerge(")
      expect(block).toContain("forgeMergeConfirmText")
      expect(block).toContain("detail?.base_ref")
      expect(block).toContain("showModal")
    })

    /**
     * `mergeable === null` **不禁用**确认按钮 —— 只有 forge 有资格说不，而它此刻还没
     * 算完；禁用意味着用户要反复下拉刷新直到它变绿。
     */
    it("keeps the confirm button live while mergeability is unknown", () => {
      expect(sheet).toContain("forgeMergeBlocker")
      expect(sheet).toContain("!blocker.value && !props.submitting")
    })

    /** 每次打开都回到 forge 给的默认 —— 上一次的选择属于上一个变更。 */
    it("resets the picked method when the sheet opens", () => {
      expect(sheet).toContain("if (show) picked.value = null")
    })

    /** headSha 缺失时要说清后果：那次合并没有「分支没动过」的保护。 */
    it("warns when there is no head sha to guard with", () => {
      expect(sheet).toContain('v-if="!props.headSha"')
      expect(sheet).toContain("不会校验分支")
    })

    /** 合并按钮只对还开着的 PR 出 —— 已合并的给一颗必然失败的按钮比不给更糟。 */
    it("only offers merge on an open pull request", () => {
      expect(source).toMatch(/canMerge = computed\([\s\S]*?kind === "pr"[\s\S]*?state === "open"/)
    })
  })

  /**
   * ## 处理成 work task
   *
   * 这一组锁「反查只刷芯片、绝不重拉列表」这个决定，以及 source key 的两处对齐。
   */
  describe("work task bridge", () => {
    const source = read("pages/forge/index.vue")
    const sheet = read("pages/forge/components/ForgeStartSheet.vue")

    /**
     * **`task://changed` 的回调只刷芯片。** 两个理由：重拉会把详情页刚写回的状态盖回
     * 旧值（而且是**自动**发生 —— 任务每推进一步就抹一次）；一个任务从 running 到 done
     * 会发好几条事件，每条都重拉就是把 30 次/分钟的 search 配额烧在用户没要求的刷新上。
     */
    it("only refreshes the chips on a task event", () => {
      expect(source).toContain("WORK_TASK_CHANGED_CHANNEL")
      expect(source).toContain("subscribeGlobalEvent")
      const subscribe = extractFunctionBlock(source, "function ensureTaskChangedSubscription(")
      expect(subscribe).toContain("scheduleTaskLinkRefresh()")
      expect(subscribe).not.toContain("reloadList")

      const schedule = extractFunctionBlock(source, "function scheduleTaskLinkRefresh()")
      expect(schedule).toContain("refreshTaskLinks()")
      expect(schedule).not.toContain("reloadList")
      // 300ms 合并窗口：一次状态迁移会连着发好几条事件。
      expect(schedule).toContain("300")
    })

    /** 订阅按 instanceKey 去重，且 onUnload 要拆掉 —— 否则页面卸载后还在刷。 */
    it("dedupes and tears down the subscription", () => {
      expect(source).toContain("disposeTaskChanged")
      expect(extractFunctionBlock(source, "onUnload(() => {")).toContain(
        "teardownTaskSubscriptions()"
      )
    })

    /**
     * 反查有**自己的代际**。共用列表那个会让两条线互相取消，而反查的答复是整体替换
     * map —— 慢的赢会让已存在的 link 消失，于是芯片变回「处理」按钮，一个正在跑的任务
     * 被重复触发。
     */
    it("gives the lookup its own generation", () => {
      expect(source).toContain("let linkSeq = 0")
      const block = extractFunctionBlock(source, "async function refreshTaskLinks()")
      expect(block).toContain("++linkSeq")
      expect(block).toContain("if (seq !== linkSeq) return")
    })

    /** 反查失败静默：芯片没了比一条用户点不动的错误好，而列表本身是好的。 */
    it("swallows a failed lookup", () => {
      const block = extractFunctionBlock(source, "async function refreshTaskLinks()")
      expect(block).toContain("console.warn")
      expect(block).not.toContain("listError.value")
    })

    /**
     * onShow **无条件刷芯片**是安全的（走本地数据库，不花 forge 配额）—— 与列表重拉
     * 刻意不同。芯片可能在别处变过（在任务页取消了任务、订阅因断线错过事件）。
     */
    it("refreshes the chips unconditionally on show, unlike the list", () => {
      const block = extractFunctionBlock(source, "onShow(() => {")
      expect(block.indexOf("refreshTaskLinks()")).toBeLessThan(block.indexOf("scopeError.value"))
    })

    /**
     * source key 的 **provider 只用远端给的那个** —— 客户端从不自己猜（那等于替用户选
     * 一份凭据），而从 host 看到 `github.com` 就填 `github` 在自建实例上必错。
     */
    it("never guesses the provider when building a source key", () => {
      const block = extractFunctionBlock(source, "function sourceKeyFor(")
      expect(block).toContain("provider: current.provider")
      expect(block).not.toContain('"github"')
      expect(block).not.toContain("guessForgeProvider")
    })

    /** 换仓库时反查也要清：source key 含 owner_repo，旧 link 全都不匹配新仓库的行。 */
    it("clears the lookup when the repository changes", () => {
      expect(extractFunctionBlock(source, "function resetRepositoryState()")).toContain(
        "taskLinks.value = new Map()"
      )
    })

    /** 触发时把 provider 交给服务端对账，而不是让它自己再推一遍。 */
    it("sends the server-derived coordinates with the trigger", () => {
      // 这几个断言打在整个文件上而不是 `submitStart` 的块里：它的签名是一个多行内联
      // 对象类型，`extractFunctionBlock` 会在那个类型的收尾大括号处截断。
      expect(source).toContain("provider: current.provider")
      expect(source).toContain("server_host: current.server_host")
      expect(source).toContain("owner_repo: current.owner_repo")
    })

    /** 创建成功后立刻反查一次让芯片亮起来 —— 不等事件（它可能因断线错过）。 */
    it("lights the chip up without waiting for the broadcast", () => {
      expect(source).toContain('result.outcome === "created"')
      expect(source).toContain("void refreshTaskLinks()")
    })

    /** duplicate / folder_mismatch 留在弹层里由它变形，而不是弹一个 toast 然后关掉。 */
    it("keeps the two answers inside the sheet", () => {
      expect(source).toContain("startResult.value = result")
      expect(sheet).toContain("duplicateTask")
      expect(sheet).toContain("mismatchRemote")
      expect(sheet).toContain("查看已有任务")
      expect(sheet).toContain("仍要新建")
    })

    /** 打开弹层要清掉上一次的答案 —— 留着会让它一打开就显示「已有进行中的任务」。 */
    it("clears the previous answer when the sheet opens", () => {
      const block = extractFunctionBlock(source, "function openStartSheet(")
      expect(block).toContain("startResult.value = null")
    })

    /**
     * 场景是**模板名**，提示词文本全部由服务端合成 —— 客户端从不送提示词。
     * 断言打在服务封装层上（那是唯一构造载荷的地方）。
     */
    it("never sends prompt text, only a scenario name", () => {
      const api = read("services/forge/forgeTaskApi.ts")
      expect(api).toContain("scenario: draft.scenario")
      expect(api).not.toMatch(/prompt:\s/)
      expect(source).toContain("scenario: payload.scenario")
    })

    /** 常驻提示词在弹层里是**只读预览**，且拼法要与服务端一致。 */
    it("previews the standing prompt read-only", () => {
      expect(sheet).toContain("forgeStandingPrompt")
      expect(sheet).toContain("常驻提示词")
    })

    /** 回写默认值来自面板设置，但每次打开都重算 —— 上一次的选择属于上一个工作项。 */
    it("resets the form from the settings on every open", () => {
      expect(sheet).toContain("initialForgeScenario(props.kind, props.settings)")
      expect(sheet).toContain("props.settings?.writeback_default !== false")
    })

    /** 空补充说明送 null —— 服务端把空串当成「用户写了个空的」并为它拼一段空 note。 */
    it("sends a null instruction rather than an empty string", () => {
      expect(sheet).toContain("instruction.value.trim() || null")
    })
  })

  /**
   * ## 面板设置
   *
   * 作用域语义在两处不同名（线上 `null` / UI `0`），且覆盖是**整份替换**。这一组锁住
   * 那两条。
   */
  describe("panel settings", () => {
    const source = read("pages/forge/index.vue")
    const sheet = read("pages/forge/components/ForgeSettingsSheet.vue")

    /**
     * `0 → null` 的转换**只在 service 层做一次**。页面直接传 UI 的哨兵值 —— 两处都转
     * 会把全局行写成 `folderId: null` 之后再被另一处改回 0，而漏转会把全局设置写到一个
     * 不存在的 folder 0 上（保存成功但下次打开什么都没变）。
     */
    it("leaves the zero-to-null conversion to the service layer", () => {
      // 断言打在整个文件上：`submitSettings` 的签名是一个多行内联对象类型，
      // `extractFunctionBlock` 会在那个类型的收尾大括号处截断。
      expect(source).toContain("payload.folderId,")
      expect(read("services/forge/forgeSettingsApi.ts")).toContain(
        "folderId: folderId > 0 ? folderId : null"
      )
      // 页面不做第二次转换 —— 两处都转会互相抵消，漏转会写到不存在的 folder 0 上。
      expect(source).not.toContain("payload.folderId > 0")
    })

    /**
     * 生效的设置走 `effectiveForgeSettings`（整份替换）—— 绝不逐字段混合。
     * 「处理」弹层拿的就是这一份。
     */
    it("resolves the effective settings without merging field by field", () => {
      expect(source).toContain("effectiveForgeSettings(settingsStore.value, scope.folderId)")
      expect(source).toContain(':settings="panelSettings"')
    })

    /** 「跟随全局」保存的是 `settings: null`（删掉那一行），不是抄一份全局的值过去。 */
    it("saves follow-global as a dropped row", () => {
      const block = extractFunctionBlock(sheet, "function handleSave()")
      expect(block).toContain("settings: null")
      expect(block).toContain("!isGlobalScope.value && !custom.value")
    })

    /** 弹层要区分「有自己的设置」与「在跟随全局」，否则用户以为自己已经脱离了全局。 */
    it("tells an own row apart from following the global one", () => {
      expect(sheet).toContain("ownForgeSettings")
      expect(extractFunctionBlock(sheet, "function resetDraftForScope()")).toContain(
        "custom.value = Boolean(own)"
      )
    })

    /** 全局作用域没有「来源」选择 —— 它后面没有东西可以回退（服务端会以 422 拒绝）。 */
    it("hides the source choice on the global scope", () => {
      expect(sheet).toContain('v-if="!isGlobalScope"')
    })

    /** 「独立配置」的说明要写清这是**整份**替换 —— 用户可能以为只有改过的项会覆盖。 */
    it("says an override replaces the whole row", () => {
      expect(sheet).toContain("整份使用下面的配置")
    })

    /** 4000 字上限在**打字时**撞到，而不是写完之后被服务端告知。 */
    it("enforces the prompt cap while typing", () => {
      expect(sheet).toContain("FORGE_PROMPT_CAP")
      expect(sheet).toContain("promptOver")
      expect(sheet).toContain("validateForgePrompts")
    })

    /** 保存后用服务端返回的那份整份替换本地 —— 它已经 trim 过并丢掉了空提示词。 */
    it("adopts the stored value rather than the local draft", () => {
      expect(source).toContain("settingsStore.value = await saveForgeSettings(")
    })

    /** 设置是连接级的（一个 blob 装着所有作用域），切项目不用重读。 */
    it("reads the settings once per connection", () => {
      expect(extractFunctionBlock(source, "async function reloadScope()")).toContain(
        "loadSettings(resolvedGateway)"
      )
      expect(extractFunctionBlock(source, "async function probeRemote()")).not.toContain(
        "loadSettings"
      )
    })

    /** 读设置失败静默 —— 弹层退化成内置默认，而列表本身不依赖它。 */
    it("swallows a failed settings read", () => {
      const block = extractFunctionBlock(source, "async function loadSettings(")
      expect(block).toContain("console.warn")
    })

    /** 切项目要关掉设置弹层：它编辑的是「当前项目」那个作用域。 */
    it("closes the settings sheet when the project changes", () => {
      expect(extractFunctionBlock(source, "function resetRepositoryState()")).toContain(
        "showSettingsSheet.value = false"
      )
    })
  })

  describe("checks pane", () => {
    const pane = read("pages/forge-item/components/ForgeChecksPane.vue")

    /**
     * `ForgeChangeDetail.checks` 是一个 **`ForgeCheckList`**（`{checks, available,
     * partial}`），数组在它的 `.checks` 里。少一层会把一个对象喂给按数组遍历的汇总
     * 函数 —— 类型检查抓得到，但这个形状足够容易搞错，值得钉一下。
     */
    it("reaches through the check list to the array", () => {
      expect(pane).toContain("forgeCheckSummary(props.detail.checks.checks)")
      expect(pane).toContain("forgeChecksState(props.detail.checks)")
    })

    /** 「读不到」与「没有配置」用不同的提示色，且都要说出来。 */
    it("distinguishes unreadable checks from an empty pipeline", () => {
      expect(pane).toContain("forgeChecksStateText")
      expect(pane).toContain("checksState === 'unavailable'")
    })

    /** forge 自己的 `merge_state` 只作补充，**不翻译** —— 两套词汇对不上。 */
    it("passes the forge's own merge_state through untranslated", () => {
      expect(pane).toContain("props.detail.merge_state")
    })

    /** 规模的四个计数各自可能为 null，全 null 时整块不画。 */
    it("hides a size cell the forge did not fill", () => {
      expect(pane).toContain("hasForgeChangeSize")
      expect(pane).toContain("filter((cell) => Boolean(cell.text))")
    })
  })

  describe("files pane", () => {
    const pane = read("pages/forge-item/components/ForgeFilesPane.vue")

    /**
     * `patch` 随文件列表白送，所以展开**不花请求** —— 展开状态因此是组件本地的，
     * 而不是页面状态。
     */
    it("expands a diff locally without a request", () => {
      expect(pane).toContain("canExpandForgeFile")
      expect(pane).toContain("buildGitDiffView")
      expect(pane).toContain("GitDiffViewer")
      expect(pane).not.toContain("gateway")
    })

    /** parse-diff 不便宜，同一个文件反复折叠展开不该重复解析。 */
    it("caches the parsed diff", () => {
      expect(pane).toContain("parsed.get(file.path)")
      expect(pane).toContain("parsed.set(file.path")
    })

    /** 不能展开的两种情形要分别说明，而不是给一个展开后是空白的按钮。 */
    it("explains an unavailable diff instead of offering an empty expander", () => {
      expect(pane).toContain("forgeFileDiffUnavailableText")
      expect(pane).toContain('v-if="!canExpandForgeFile(file)"')
    })
  })

  describe("new issue sheet", () => {
    const list = read("pages/forge/index.vue")
    const sheet = read("pages/forge/components/ForgeNewIssueSheet.vue")

    /** 三个上限在提交前拦：服务端也会拒，但那要花一次往返换一句用户照不着改的 422。 */
    it("enforces the backend's own limits before spending a request", () => {
      expect(sheet).toContain("FORGE_MAX_TITLE_CHARS")
      expect(sheet).toContain("FORGE_MAX_COMMENT_CHARS")
      expect(sheet).toContain("FORGE_MAX_ISSUE_LABELS")
    })

    /** 空描述送 null 而不是空串：GitHub 把空串存成正文，条目会渲染出一个空的描述块。 */
    it("sends a null body rather than an empty string", () => {
      expect(extractFunctionBlock(sheet, "function handleSubmit()")).toContain(
        "body: trimmedBody || null"
      )
    })

    /**
     * 乐观插入必须诚实：只有排序真的会把它排在第一位、且筛选不排除它时才插。
     * **且不重拉列表** —— GitHub 的 search 索引落后写入数秒，刚创建的 issue 大概率不在
     * 结果里，于是「创建成功」之后列表看起来什么都没发生。
     */
    it("only prepends a new issue when it would really sort first", () => {
      const block = extractFunctionBlock(list, "async function submitNewIssue(")
      expect(block).toContain("shouldPrependNewIssue(filter)")
      expect(block).toContain("matchesForgeLabelFilter(created, filter)")
      expect(block).not.toContain("reloadList")
    })

    /** 创建完直接进详情：刚开的 issue 通常还要补描述或立刻处理成任务。 */
    it("opens the created issue", () => {
      expect(extractFunctionBlock(list, "async function submitNewIssue(")).toContain(
        "openItem(created)"
      )
    })

    /** 新建只对 issue 有意义 —— PR 要有一个分支才能开，那不是手机上做的事。 */
    it("hides the create button on the pull request tab", () => {
      expect(read("pages/forge/components/ForgeListHeader.vue")).toContain(
        "v-if=\"props.tab === 'issues'\""
      )
    })
  })

  describe("theme discipline", () => {
    const files = [
      "pages/forge/index.vue",
      "pages/forge/components/ForgeListHeader.vue",
      "pages/forge/components/ForgeIssueRow.vue",
      "pages/forge/components/ForgeStateChip.vue",
      "pages/forge/components/ForgeLabelChip.vue",
      "pages/forge/components/ForgeScopeSheet.vue",
      "pages/forge/components/ForgeFilterSheet.vue",
      "pages/forge/components/ForgeNewIssueSheet.vue",
      "pages/forge/components/ForgeStartSheet.vue",
      "pages/forge/components/ForgeSettingsSheet.vue",
      "pages/forge/components/ForgeTaskChip.vue",
      "pages/forge-item/index.vue",
      "pages/forge-item/components/ForgeConversationPane.vue",
      "pages/forge-item/components/ForgeCommentComposer.vue",
      "pages/forge-item/components/ForgeChecksPane.vue",
      "pages/forge-item/components/ForgeFilesPane.vue",
      "pages/forge-item/components/ForgeMergeSheet.vue",
      "pages/forge-accounts/index.vue",
      "pages/forge-accounts/components/ForgeAccountTokenSheet.vue",
    ]

    /**
     * `upThemeVar` / `upThemeIsDark` 是 uview-plus 用 Options API mixin 注入的，
     * `<script setup>` 里裸调会 ReferenceError，在 computed 里还会**静默失败**
     * （prop 变成空串）。必须经 instance proxy 取。
     */
    it("reaches the uview theme mixin through the instance proxy", () => {
      files.forEach((file) => {
        const source = read(file)
        if (!/upThemeVar|upThemeIsDark|upThemeVars|upThemeCardStyle/.test(source)) return
        expect(source).toContain("getCurrentInstance()")
        expect(source).toMatch(/currentInstance\?\.proxy\?\.upTheme/)
      })
    })

    /** 项目约定：只用 uview 运行时主题变量，**不引入 `--mcode-*` 别名**（见 AGENTS.md）。 */
    it("never introduces a --mcode-* theme alias", () => {
      files
        .concat(["pages/forge/index.scss", "pages/forge-item/index.scss"])
        .forEach((file) => {
          const source = read(file)
          expect(source).not.toMatch(/--mcode-[a-z-]+\s*:/)
          expect(source).not.toMatch(/var\(--mcode-/)
        })
    })

    /**
     * 标签配色算在 JS 里（按感知亮度分两套），而 `isDark` 必须取 mixin 的
     * `upThemeIsDark`（computed，随主题重算），**不能**用 `isDarkThemeMode()` 一次性
     * 读值 —— 后者会让切到深色后每颗标签仍是浅色配方，深蓝标签变成黑底黑字。
     */
    it("makes the label swatch follow theme changes", () => {
      const chip = read("pages/forge/components/ForgeLabelChip.vue")
      expect(chip).toContain("upThemeIsDark")
      // 断言 import 而不是裸字符串 —— 这个文件的注释里就写着「不要用
      // isDarkThemeMode」，按子串断言会打在那段说明上。
      expect(chip).not.toMatch(/import[^\n]*isDarkThemeMode/)
    })
  })

  /** `<style scoped>` 不跨组件边界，共享类必须住在 index.scss 里且每个消费方 import。 */
  it("shares the cross-component classes through one stylesheet", () => {
    const shared = read("pages/forge/index.scss")
    ;["forge-sheet", "forge-notice", "forge-chip", "forge-inline-loading"].forEach((className) => {
      expect(shared).toContain(`.${className}`)
    })
    // 详情页的分区共用另一份（分区外壳、评论卡片、统计格）。
    const detailShared = read("pages/forge-item/index.scss")
    ;["forge-pane", "forge-comment", "forge-more", "forge-stat"].forEach((className) => {
      expect(detailShared).toContain(`.${className}`)
    })
    // 只列**用到**共享类的消费方。`ForgeTaskChip` 与 `ForgeStateChip` 自带全部样式，
    // 硬要它们 import 一份用不上的表只会让编译产物变大。
    ;[
      "pages/forge/index.vue",
      "pages/forge/components/ForgeIssueRow.vue",
      "pages/forge/components/ForgeLabelChip.vue",
      "pages/forge/components/ForgeListHeader.vue",
      "pages/forge/components/ForgeScopeSheet.vue",
      "pages/forge/components/ForgeFilterSheet.vue",
      "pages/forge/components/ForgeNewIssueSheet.vue",
      "pages/forge/components/ForgeStartSheet.vue",
      "pages/forge/components/ForgeSettingsSheet.vue",
      "pages/forge-item/index.vue",
      "pages/forge-item/components/ForgeConversationPane.vue",
      "pages/forge-item/components/ForgeCommentComposer.vue",
      "pages/forge-item/components/ForgeChecksPane.vue",
      "pages/forge-item/components/ForgeFilesPane.vue",
      "pages/forge-item/components/ForgeMergeSheet.vue",
      "pages/forge-accounts/index.vue",
      "pages/forge-accounts/components/ForgeAccountTokenSheet.vue",
    ].forEach((file) => {
      expect(read(file)).toMatch(/@import "[^"]*index\.scss"/)
    })
  })
})
