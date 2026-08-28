import fs from "node:fs"
import path from "node:path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8")
}

const PAGE = "../../../src/pages/conversations/index.vue"
const SHEET = "../../../src/pages/conversations/components/CreateConversationSheet.vue"

/**
 * 新建会话的**所有权边界**契约。
 *
 * `confirmCreate` 曾是一个 162 行的单函数，收尾处混了两类职责：弹层自己的状态重置，与
 * 页面级的刷新/导航。而弹层在函数中段就已经把自己关掉了 —— 也就是它在「弹层已隐藏」
 * 之后继续改弹层状态。
 *
 * 接缝先切出来、再拆的组件已经落地：`CreateConversationSheet.vue`。父页面用
 * `v-model:show` 控制显示，一旦改成 `v-if`（或页面在收到 `created` 后卸载它），收尾里
 * 属于弹层的那半段就会跑在**已卸载**的实例上。
 *
 * 这份 spec 钉住拆分后的两侧：弹层侧只做重置并把结果按值交出，页面侧只做刷新与导航。
 */
describe("create conversation ownership boundary", () => {
  it("keeps the sheet-owned reset inside the sheet component", () => {
    const source = read(SHEET)

    expect(source).toContain("function resetCreateSheetState() {")
  })

  it("keeps the page-owned refresh inside the page", () => {
    const source = read(PAGE)

    expect(source).toContain("async function handleConversationCreated(payload: {")
    // 页面**不该**再持有弹层的重置：那个函数写的全是子组件的 ref。
    expect(source).not.toContain("function resetCreateSheetState() {")
  })

  it("keeps list refresh and navigation out of the sheet-owned reset", () => {
    // 这三件事依赖列表数据源与路由，永远归页面。混进重置函数就等于把它们交给了弹层。
    const source = read(SHEET)
    const start = source.indexOf("function resetCreateSheetState() {")
    // 起点必须存在，否则 `slice(-1, …)` 会退化成空串，让下面三条 not.toContain 全部
    // 空过 —— 测试通过但什么都没验（这份 spec 上一版就栽在这里）。
    expect(start).toBeGreaterThan(-1)
    const end = source.indexOf("\n}", start)
    expect(end).toBeGreaterThan(start)
    const block = source.slice(start, end)

    expect(block).not.toContain("loadOverviewData")
    expect(block).not.toContain("openConversation")
    expect(block).not.toContain("refreshConversationTabBadge")
  })

  it("keeps sheet state writes out of the page-owned refresh", () => {
    // 反向同理：刷新/导航那段不能碰弹层的状态 —— 子组件卸载后那就是野写。
    const source = read(PAGE)
    const start = source.indexOf("async function handleConversationCreated(payload: {")
    expect(start).toBeGreaterThan(-1)
    const end = source.indexOf("\n}", start)
    expect(end).toBeGreaterThan(start)
    const block = source.slice(start, end)

    expect(block).not.toContain("createAgentOptions")
    expect(block).not.toContain("selectedAgentType")
    expect(block).not.toContain("newTaskContent")
    expect(block).not.toContain("resetCreateAgentConfig")
  })

  it("hands the created conversation over by value, not by shared ref", () => {
    // 子组件把「拿到了哪个会话」作为事件载荷交出来，而不是让页面回头去读弹层的
    // 状态 —— 后者在子组件卸载后读不到，而且父组件本来就没有访问权。
    const sheet = read(SHEET)

    expect(sheet).toContain('emit("created", {')
    expect(sheet).toContain("conversationId: newConversationId")
  })

  it("resets the sheet before handing off, so a v-if unmount cannot strand it", () => {
    // 顺序是**载荷安全的关键**：页面收到 `created` 后可能立即卸载本组件（v-if / 路由
    // 跳转），此后再写 ref 就是写一个不存在的实例。所以重置必须排在 emit 之前。
    const sheet = read(SHEET)
    const resetAt = sheet.lastIndexOf("resetCreateSheetState()")
    const emitAt = sheet.indexOf('emit("created", {')

    expect(resetAt).toBeGreaterThan(-1)
    expect(emitAt).toBeGreaterThan(-1)
    expect(resetAt).toBeLessThan(emitAt)
  })

  it("wires the sheet with a two-way show and a created handler", () => {
    // 页面侧的接线：`show` 双向（页面拥有开关）、连接分组按 prop 下传（列表数据源
    // 归页面）、`created` 是唯一回程通道。
    const source = read(PAGE)

    expect(source).toContain("<CreateConversationSheet")
    expect(source).toContain('v-model:show="showCreateDialog"')
    expect(source).toContain(':connection-groups="connectionGroups"')
    expect(source).toContain('@created="handleConversationCreated"')
  })
})
