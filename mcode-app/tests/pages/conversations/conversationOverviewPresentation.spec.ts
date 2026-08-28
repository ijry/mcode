import {
  buildBulkSelectionItem,
  buildBulkSelectionKey,
  formatOverviewAgentLabel,
  buildOverviewDisplayModel,
  formatOverviewRelativeTime,
  isSelectableOverviewCard,
  resolveOverviewCardDisplayStatus,
  shouldHideCompletedOverviewCard,
} from "@/pages/conversations/conversationOverviewPresentation"

describe("conversationOverviewPresentation", () => {
  it("keeps persisted summary status when runtime is only connected state", () => {
    expect(resolveOverviewCardDisplayStatus("completed", "connected")).toBe("completed")
    expect(resolveOverviewCardDisplayStatus("failed", "connecting")).toBe("failed")
    expect(resolveOverviewCardDisplayStatus("unknown", "idle")).toBe("unknown")
    expect(resolveOverviewCardDisplayStatus("completed", "error")).toBe("failed")
  })

  it("promotes only real execution states to in_progress", () => {
    expect(resolveOverviewCardDisplayStatus("completed", "thinking")).toBe("in_progress")
    expect(resolveOverviewCardDisplayStatus("completed", "running_tool")).toBe("in_progress")
    expect(resolveOverviewCardDisplayStatus("completed", "waiting_permission")).toBe("in_progress")
    expect(resolveOverviewCardDisplayStatus("completed", "waiting_question")).toBe("in_progress")
  })
})

describe("hiding completed cards", () => {
  it("hides a completed card when the preference is on", () => {
    expect(shouldHideCompletedOverviewCard("completed", true)).toBe(true)
  })

  it("keeps every other status", () => {
    // 只挡 `completed`。特别是 `pending_review`（列表上显示「待处理」）—— 轮次跑完时
    // mcode 写的正是它（`conversationSyncService.ts` 的 markSummaryPendingReview 硬编码），
    // 把它一起藏掉会让「刚跑完等我看」的会话消失，那是数据丢失级的误解。
    expect(shouldHideCompletedOverviewCard("pending_review", true)).toBe(false)
    expect(shouldHideCompletedOverviewCard("in_progress", true)).toBe(false)
    expect(shouldHideCompletedOverviewCard("failed", true)).toBe(false)
    expect(shouldHideCompletedOverviewCard("cancelled", true)).toBe(false)
    expect(shouldHideCompletedOverviewCard("unknown", true)).toBe(false)
    expect(shouldHideCompletedOverviewCard("", true)).toBe(false)
  })

  it("hides nothing when the preference is off", () => {
    expect(shouldHideCompletedOverviewCard("completed", false)).toBe(false)
  })

  it("is driven by displayStatus, so a running card is never hidden", () => {
    // 判据必须是 displayStatus 而非 summary 原值：一个状态是 completed、但此刻 runtime
    // 正在跑的会话，displayStatus 会被提升成 in_progress —— 那种会话绝不能藏。
    // 这两行合起来锁住「用哪个值判」这个决定。
    const runningDisplayStatus = resolveOverviewCardDisplayStatus("completed", "thinking")
    expect(shouldHideCompletedOverviewCard(runningDisplayStatus, true)).toBe(false)

    const idleDisplayStatus = resolveOverviewCardDisplayStatus("completed", "connected")
    expect(shouldHideCompletedOverviewCard(idleDisplayStatus, true)).toBe(true)
  })

  it("normalizes casing and padding like the status resolver does", () => {
    // 状态串来自服务端且不是封闭枚举（normalizeConversationSummaryStatus 会原样透传
    // 未知值），所以这里必须和 displayStatus 用同一套归一化，否则 " Completed " 之类
    // 的漂移写法会绕过过滤。
    expect(shouldHideCompletedOverviewCard(" COMPLETED ", true)).toBe(true)
  })
})

describe("buildOverviewDisplayModel", () => {
  // 这一组取代了原先 `hideCompletedFilterWiring.spec.ts` 的源码扫描断言。
  //
  // 那份 spec 存在的唯一理由是「可见卡片有两条并行派生（渲染用的 computed 与喂订阅/批量
  // 选择的函数），必须同时改」——它靠数字符串出现次数来防漏改。收口成单一纯函数之后，
  // 那个前提消失了：两个消费者读的是同一次计算的两个字段，结构上不可能分叉。
  // 于是断言可以从「源码里出现了几次」变成「行为对不对」。
  const card = (patch: Record<string, unknown> = {}) => ({
    tabId: 1,
    conversationId: 101,
    folderId: 7,
    projectName: "demo",
    agentType: "claude_code",
    title: "会话 A",
    activityAt: 1000,
    status: "pending_review",
    isActive: false,
    isOpenTab: false,
    ...patch,
  })

  const group = (patch: Record<string, unknown> = {}) => ({
    key: "conn-a",
    name: "本机",
    targetAgent: "codeg",
    routeMode: "direct" as const,
    baseUrl: "http://127.0.0.1:8080",
    projects: [],
    openTabCards: [],
    recentActiveCards: [],
    cards: [card()],
    loadError: null,
    ...patch,
  })

  const build = (patch: Record<string, unknown> = {}) =>
    buildOverviewDisplayModel({
      groups: [group()],
      resolveRuntimeSession: () => undefined,
      instanceKeyByGroupKey: { "conn-a": "direct::local" },
      keyword: "",
      hideCompleted: false,
      livePreviewEnabled: false,
      ...patch,
    })

  it("returns the rendered groups and the flat candidates from one pass", () => {
    const model = build()

    expect(model.groups).toHaveLength(1)
    expect(model.groups[0].cards.map((item) => item.conversationId)).toEqual([101])
    expect(model.candidates.map((item) => item.conversationId)).toEqual([101])
  })

  it("gives candidates the group key and instance key the subscriptions need", () => {
    const model = build()

    expect(model.candidates[0]).toMatchObject({
      groupKey: "conn-a",
      instanceKey: "direct::local",
    })
    // 分组结构那一份不带这两个字段（模板不需要），但两份的 displayStatus 必须同源。
    expect(model.candidates[0].displayStatus).toBe(model.groups[0].cards[0].displayStatus)
  })

  it("falls back to an empty instance key for an unmapped group", () => {
    // prepare 完成但 loadConnectionGroup 还没跑的窗口里，映射表里确实没有这个 key。
    const model = build({ instanceKeyByGroupKey: {} })
    expect(model.candidates[0].instanceKey).toBe("")
  })

  it("applies the completed filter to BOTH outputs, never to just one", () => {
    // 这是原先那条源码扫描测试真正想保证的事。只藏渲染那一份会让看不见的卡仍被订阅
    // 实时流、仍能被「全选」勾中 —— 用户于是对着一个看不见的会话发消息。
    const model = build({
      groups: [group({ cards: [card({ status: "completed" })] })],
      hideCompleted: true,
    })

    expect(model.groups[0].cards).toHaveLength(0)
    expect(model.candidates).toHaveLength(0)
  })

  it("keeps a completed card that runtime says is running", () => {
    const model = build({
      groups: [group({ cards: [card({ status: "completed" })] })],
      hideCompleted: true,
      resolveRuntimeSession: () => ({ status: "thinking" }),
    })

    expect(model.groups[0].cards).toHaveLength(1)
    expect(model.candidates).toHaveLength(1)
    expect(model.candidates[0].displayStatus).toBe("in_progress")
  })

  it("filters both outputs by keyword, matching the agent label too", () => {
    // 「Claude Code」是 label，卡片上存的是 `claude_code`。不过 label 映射，用户搜
    // 界面上看到的那串字就搜不到 —— 历史面板至今是这个毛病（见 C2）。
    const model = build({ keyword: "claude code" })
    expect(model.groups[0].cards).toHaveLength(1)
    expect(model.candidates).toHaveLength(1)

    const miss = build({ keyword: "codex" })
    expect(miss.groups).toHaveLength(0)
    expect(miss.candidates).toHaveLength(0)
  })

  it("keeps a group whose own name matches even when no card does", () => {
    // 组级兜底：搜连接名/地址时该看到那个组（哪怕它的会话都不匹配），否则用户会以为
    // 这台机器不存在。**但候选集不能跟着保留** —— 那些卡在界面上是不可见的。
    const model = build({ keyword: "本机" })

    expect(model.groups).toHaveLength(1)
    expect(model.groups[0].cards).toHaveLength(0)
    expect(model.candidates).toHaveLength(0)
  })

  it("matches a group by base url as well", () => {
    const model = build({ keyword: "127.0.0.1" })
    expect(model.groups).toHaveLength(1)
    expect(model.groups[0].cards).toHaveLength(0)
  })

  it("sorts running cards ahead of idle ones while keeping snapshot order otherwise", () => {
    const model = build({
      groups: [
        group({
          cards: [
            card({ conversationId: 1, title: "闲置一", activityAt: 3000 }),
            card({ conversationId: 2, title: "闲置二", activityAt: 2000 }),
            card({ conversationId: 3, title: "在跑", activityAt: 1000, status: "in_progress" }),
          ],
        }),
      ],
    })

    // 在跑的提到最前；其余保持传入顺序（快照已经按活跃时间排好，这里不得重排）。
    expect(model.groups[0].cards.map((item) => item.conversationId)).toEqual([3, 1, 2])
    // 候选集**不排序** —— 它喂的是订阅与选择集，顺序只需稳定。
    expect(model.candidates.map((item) => item.conversationId)).toEqual([1, 2, 3])
  })

  it("fills livePreviewText only when the preference is on", () => {
    const session = { status: "waiting_permission" as const }

    const off = build({ resolveRuntimeSession: () => session, livePreviewEnabled: false })
    expect(off.groups[0].cards[0].livePreviewText).toBe("")

    const on = build({ resolveRuntimeSession: () => session, livePreviewEnabled: true })
    expect(on.groups[0].cards[0].livePreviewText).toBe("等待确认")
  })

  it("looks the runtime session up by conversation id", () => {
    const seen: number[] = []
    build({
      resolveRuntimeSession: (conversationId) => {
        seen.push(conversationId)
        return undefined
      },
    })
    expect(seen).toContain(101)
  })

  it("resolves each runtime session once per card, not once per consumer", () => {
    // 收口前：两条派生 + 三个 watcher + 订阅对账 + Promise.all 里的逐个复查，单个
    // runtime tick 会把同一批卡遍历 8 次。合成一次计算之后，每张卡只查一次 session。
    let calls = 0
    build({
      groups: [
        group({
          cards: [card({ conversationId: 1 }), card({ conversationId: 2 })],
        }),
      ],
      resolveRuntimeSession: () => {
        calls += 1
        return undefined
      },
    })
    expect(calls).toBe(2)
  })

  it("drops a group with no matching cards only when the keyword misses the group too", () => {
    const model = build({
      groups: [
        group({ key: "a", name: "甲机", cards: [card({ conversationId: 1, title: "命中" })] }),
        group({ key: "b", name: "乙机", cards: [card({ conversationId: 2, title: "无关" })] }),
      ],
      keyword: "命中",
    })

    expect(model.groups.map((item) => item.key)).toEqual(["a"])
    expect(model.candidates.map((item) => item.conversationId)).toEqual([1])
  })
})

describe("bulk selection identity", () => {
  const card = (patch: Record<string, unknown> = {}) => ({
    tabId: 1,
    conversationId: 42,
    folderId: 7,
    projectName: "demo",
    agentType: "codex_cli",
    title: "会话 A",
    activityAt: 1000,
    status: "pending_review",
    isActive: false,
    isOpenTab: false,
    ...patch,
  })

  it("keys a selection by connection and conversation", () => {
    expect(buildBulkSelectionKey("conn-a", 42)).toBe("conn-a:42")
  })

  // 「这张卡能不能选」此前在页面里有五处各自的判据（isSelectableLiveCard、
  // buildBulkSelectionItem、isConversationSelected、openLiveSession、以及
  // selectConversationLivePreviewIds）。收成一个判据，其余都读它。
  it("requires a real conversation id", () => {
    expect(isSelectableOverviewCard(card())).toBe(true)
    expect(isSelectableOverviewCard(card({ conversationId: 0 }))).toBe(false)
    expect(isSelectableOverviewCard(card({ conversationId: undefined }))).toBe(false)
    // 标签卡还没关联会话时 conversationId 是负数（tabId 取的 -id），绝不能选。
    expect(isSelectableOverviewCard(card({ conversationId: -3 }))).toBe(false)
  })

  it("builds a selection item with a normalized agent type", () => {
    // `codex_cli` 是服务端可能给的别名，落进批量发送载荷前必须归一化 —— 否则
    // ensureBulkSendConnection 拿它去匹配连接会失败。
    expect(buildBulkSelectionItem(card(), "conn-a")).toEqual({
      key: "conn-a:42",
      connectionKey: "conn-a",
      conversationId: 42,
      folderId: 7,
      agentType: "codex",
      title: "会话 A",
      projectName: "demo",
    })
  })

  it("refuses to build an item without a usable identity", () => {
    expect(buildBulkSelectionItem(card(), "")).toBeNull()
    expect(buildBulkSelectionItem(card({ conversationId: 0 }), "conn-a")).toBeNull()
  })

  it("falls back to placeholder labels rather than empty strings", () => {
    // 批量发送弹层要列出已选会话名。空串会渲染成一行空白，看起来像少了一条。
    const item = buildBulkSelectionItem(card({ title: "", projectName: "" }), "conn-a")
    expect(item).toMatchObject({ title: "未命名会话", projectName: "未命名项目" })
  })
})

describe("formatOverviewRelativeTime", () => {
  const at = (offsetMs: number) => new Date(Date.now() - offsetMs).toISOString()

  it("renders the coarse buckets the card stamp uses", () => {
    expect(formatOverviewRelativeTime(at(30 * 1000))).toBe("刚刚")
    expect(formatOverviewRelativeTime(at(5 * 60 * 1000))).toBe("5分钟前")
    expect(formatOverviewRelativeTime(at(3 * 60 * 60 * 1000))).toBe("3小时前")
    expect(formatOverviewRelativeTime(at(26 * 60 * 60 * 1000))).toBe("昨天")
    expect(formatOverviewRelativeTime(at(3 * 24 * 60 * 60 * 1000))).toBe("3天前")
  })

  it("falls back to a date once past a week", () => {
    const old = formatOverviewRelativeTime(at(30 * 24 * 60 * 60 * 1000))
    expect(old).not.toContain("天前")
    expect(old.length).toBeGreaterThan(0)
  })

  it("returns an empty string for missing or unparsable input", () => {
    // 卡片的 updatedAt 是可选字段（标签还没关联会话时没有活跃时间）。这里返回空串让
    // 模板自然不渲染，而不是显示 "Invalid Date"。
    expect(formatOverviewRelativeTime(undefined)).toBe("")
    expect(formatOverviewRelativeTime("")).toBe("")
    expect(formatOverviewRelativeTime("不是时间")).toBe("")
  })
})

describe("formatOverviewAgentLabel", () => {
  it("reads the repository-wide label map", () => {
    // 站内唯一那份映射在 `services/remoteSettings.AGENT_LABELS`。会话列表页曾有本地副本，
    // 把 codex 写成「Codex CLI」而全局那份是「Codex」—— 同一个 agent 在新建弹层与其它
    // 页面显示成两个名字。这条把「只有一份」钉住。
    expect(formatOverviewAgentLabel("codex")).toBe("Codex")
    expect(formatOverviewAgentLabel("claude_code")).toBe("Claude Code")
    expect(formatOverviewAgentLabel("gemini")).toBe("Gemini CLI")
    expect(formatOverviewAgentLabel("open_code")).toBe("OpenCode")
  })

  it("passes an unknown agent id through instead of blanking it", () => {
    // 新 agent 上线时标签表还没跟上，显示原始 id 比显示空白好。
    expect(formatOverviewAgentLabel("brand_new_agent")).toBe("brand_new_agent")
  })

  it("falls back to a placeholder for a missing id", () => {
    expect(formatOverviewAgentLabel("")).toBe("未知")
    expect(formatOverviewAgentLabel(undefined)).toBe("未知")
  })
})
