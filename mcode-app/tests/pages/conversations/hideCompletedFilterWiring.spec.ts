import fs from "node:fs"
import path from "node:path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8")
}

/**
 * 「隐藏已完成会话」的接线契约。
 *
 * 这个过滤有一个结构性陷阱：可见卡片在页面里有**两处独立派生**，各自算一份
 * `displayStatus`：
 *
 * 1. `filteredConnectionGroups`（computed）—— 喂模板渲染
 * 2. `getDisplayCandidateCards()`（函数）—— 喂实时预览订阅签名、批量可选集、三个 watcher
 *
 * 只在第 1 处过滤的话，界面上看不见的卡**仍然会被订阅实时流、仍然能被「全选」勾中** ——
 * 用户于是对着一个看不见的会话发消息。这类 bug 不报错、也不容易在手测里发现。
 *
 * 所以这里用源码扫描把「两处都得有」钉死。沿用
 * `conversationLivePreviewLayout.spec.ts` 的同款手法（那条防的是排序退回拼接写法）。
 */
describe("hide-completed filter wiring contract", () => {
  it("filters completed cards in BOTH derivations, not just the rendered one", () => {
    const source = read("../../../src/pages/conversations/index.vue")

    // 两处派生各一次调用，加一次 import —— 少于 3 次说明有一处漏了。
    const occurrences = source.split("shouldHideCompletedOverviewCard").length - 1
    expect(occurrences).toBeGreaterThanOrEqual(3)

    // 分别确认两处派生的函数体里都出现了它：把源码按派生入口切段再查，
    // 避免「3 次调用全挤在同一处」也能通过。
    const candidateFnStart = source.indexOf("function getDisplayCandidateCards()")
    expect(candidateFnStart).toBeGreaterThan(-1)
    const candidateFnBody = source.slice(candidateFnStart, candidateFnStart + 1400)
    expect(candidateFnBody).toContain("shouldHideCompletedOverviewCard")

    const groupsStart = source.indexOf("const filteredConnectionGroups = computed")
    expect(groupsStart).toBeGreaterThan(-1)
    const groupsBody = source.slice(groupsStart, groupsStart + 1800)
    expect(groupsBody).toContain("shouldHideCompletedOverviewCard")
  })

  it("filters on displayStatus, never on the raw summary status", () => {
    // 用 `card.status` 判会把「状态是 completed 但此刻正在跑」的会话藏掉。
    const source = read("../../../src/pages/conversations/index.vue")

    expect(source).toContain("shouldHideCompletedOverviewCard(\n            card.displayStatus,")
    expect(source).not.toContain("shouldHideCompletedOverviewCard(card.status")
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
