import fs from "node:fs"
import path from "node:path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8")
}

/**
 * 「隐藏已完成会话」的接线契约。
 *
 * **历史**：可见卡片曾经在页面里有两处独立派生（渲染用的 `filteredConnectionGroups` 与喂
 * 订阅/批量选择的 `getDisplayCandidateCards()`），各自算一份 `displayStatus`、各自做一遍
 * 过滤。只在第一处过滤的话，界面上看不见的卡仍会被订阅实时流、仍能被「全选」勾中 ——
 * 用户于是对着一个看不见的会话发消息。这份 spec 原本用源码扫描（数函数出现次数）来防
 * 那种漏改。
 *
 * **现在**两条派生已收口成 `buildOverviewDisplayModel()` 的两个字段，分叉在结构上不可能
 * 发生，那些计数断言的前提也就消失了。行为断言搬去了
 * `conversationOverviewPresentation.spec.ts`；这里只保留**防退化**的结构断言 ——
 * 页面不得再自己算一遍派生，以及响应式必须挡在纯模块外面。
 */
describe("hide-completed filter wiring contract", () => {
  // 原先这里有两条断言，用「`shouldHideCompletedOverviewCard` 至少出现 3 次」和「两个派生
  // 函数体里各出现一次」来防漏改。收口成 `buildOverviewDisplayModel` 之后那个前提消失了
  // —— 两个消费者读的是同一次计算的两个字段，结构上不可能分叉。
  //
  // 过滤本身的行为断言已经搬到 `conversationOverviewPresentation.spec.ts` 的
  // `buildOverviewDisplayModel` 一组（包括「同时作用于两份输出」那条）。这里只留下**防
  // 退化**的结构断言：页面不能再自己算一遍派生。
  it("derives both outputs from one model, never re-deriving in the page", () => {
    const source = read("../../../src/pages/conversations/index.vue")

    // 唯一的派生入口。
    expect(source).toContain("buildOverviewDisplayModel({")
    expect(source).toContain("overviewDisplayModel.value.groups")
    expect(source).toContain("overviewDisplayModel.value.candidates")

    // 页面里不能再出现过滤/状态解析的本地实现 —— 那正是收口前的形态。
    expect(source).not.toContain("shouldHideCompletedOverviewCard(")
    expect(source).not.toContain("resolveOverviewCardDisplayStatus(")
    // 也不能再有第二处关键词匹配（历史面板那份是独立问题，不在本文件）。
    expect(source).not.toContain("function liveCardMatchesSearch")
  })

  it("hands the runtime lookup in as a callback so the module stays pure", () => {
    // 直接把 `runtime.sessions` 这个响应式 Map 传进纯模块，会让模块在 jest 里没法裸测
    // （要么 mock pinia，要么把 Vue 拖进来）。回调把响应式挡在页面这一侧。
    const source = read("../../../src/pages/conversations/index.vue")

    expect(source).toContain("resolveRuntimeSession: (conversationId) => runtime.sessions.get(conversationId)")
  })

  it("reads the preference on both mount and show", () => {
    // 只在 onMounted 读的话，用户在别的页面改了偏好（或多 tab 场景）回来不生效；
    // 列表页是 tabBar 页面，onMounted 只跑一次。
    const source = read("../../../src/pages/conversations/index.vue")

    const occurrences = source.split("loadHideCompletedPreference()").length - 1
    expect(occurrences).toBeGreaterThanOrEqual(3) // 定义 + onMounted + onShow
  })

  it("re-reconciles live preview subscriptions when the toggle flips", () => {
    // 可见卡集合变了就要重新对账订阅，否则刚被取消隐藏的会话预览文案一直空着。
    const source = read("../../../src/pages/conversations/index.vue")

    const fnStart = source.indexOf("function toggleHideCompletedConversations()")
    expect(fnStart).toBeGreaterThan(-1)
    expect(source.slice(fnStart, fnStart + 600)).toContain("scheduleLivePreviewReconcile()")
  })

  it("explains an all-filtered empty list instead of blaming the 24h window", () => {
    // 「暂无打开中或 24 小时内活跃的会话」在「有会话、只是全被过滤掉」时是错的，
    // 会让用户以为会话丢了。
    const source = read("../../../src/pages/conversations/index.vue")

    expect(source).toContain("groupEmptyText")
    expect(source).toContain("overviewEmptyText")
    // 硬编码的旧文案不能再直接出现在模板里（它现在只是 computed 的一个分支）。
    expect(source).not.toContain('{{ group.loadError || "暂无打开中或 24 小时内活跃的会话" }}')
  })
})
