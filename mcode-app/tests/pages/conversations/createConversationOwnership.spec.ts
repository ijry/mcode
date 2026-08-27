import fs from "node:fs"
import path from "node:path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8")
}

const PAGE = "../../../src/pages/conversations/index.vue"

/**
 * 新建会话的**所有权边界**契约。
 *
 * `confirmCreate` 曾是一个 162 行的单函数，收尾处混了两类职责：弹层自己的状态重置，与
 * 页面级的刷新/导航。而弹层在函数中段就已经 `showCreateDialog = false` 关掉了 —— 也就是
 * 它在「弹层已隐藏」之后继续改弹层状态。
 *
 * 抽 `CreateConversationSheet` 子组件时，如果父组件用 `v-if` 控制显示，这段收尾会跑在
 * **已卸载**的组件上（写一个不存在的实例的 ref）。所以先把接缝切出来，再拆组件。
 *
 * 这份 spec 钉住那道接缝：两段必须各自成函数、职责不许再混回去。
 */
describe("create conversation ownership boundary", () => {
  it("splits the tail into sheet-owned reset and page-owned refresh", () => {
    const source = read(PAGE)

    expect(source).toContain("function resetCreateSheetState() {")
    expect(source).toContain("async function handleConversationCreated(payload: {")
  })

  it("keeps list refresh and navigation out of the sheet-owned reset", () => {
    // 这三件事依赖列表数据源与路由，永远归页面。混进重置函数就等于把它们交给了弹层。
    const source = read(PAGE)
    const start = source.indexOf("function resetCreateSheetState() {")
    const end = source.indexOf("\n}", start)
    const block = source.slice(start, end)

    expect(block).not.toContain("loadOverviewData")
    expect(block).not.toContain("openConversation")
    expect(block).not.toContain("refreshConversationTabBadge")
  })

  it("keeps sheet state writes out of the page-owned refresh", () => {
    // 反向同理：刷新/导航那段不能再碰弹层的 ref，否则子组件卸载后这里就是野写。
    const source = read(PAGE)
    const start = source.indexOf("async function handleConversationCreated(payload: {")
    const end = source.indexOf("\n}", start)
    const block = source.slice(start, end)

    expect(block).not.toContain("createAgentOptions.value")
    expect(block).not.toContain("selectedAgentType.value")
    expect(block).not.toContain("newTaskContent.value")
    expect(block).not.toContain("resetCreateAgentConfig")
  })

  it("hands the created conversation over by value, not by shared ref", () => {
    // 子组件把「拿到了哪个会话」作为载荷交出来，而不是让页面回头去读弹层的 ref ——
    // 后者在子组件卸载后读不到。
    const source = read(PAGE)

    expect(source).toContain("await handleConversationCreated({")
    expect(source).toContain("conversationId: newConversationId")
  })
})
