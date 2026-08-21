import fs from "node:fs"
import path from "node:path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8")
}

describe("conversation list navbar header contract", () => {
  it("renders the top bar through up-navbar instead of a sticky big title", () => {
    const source = read("../../../src/pages/conversations/index.vue")

    expect(source).toContain('customClass="conversations-navbar-shell"')
    expect(source).toContain(':fixed="true"')
    expect(source).toContain(':placeholder="true"')
    // tab 页没有返回目标；一旦误开 autoBack 会 navigateBack 到上一个 tab。
    expect(source).toContain(':autoBack="false"')
    expect(source).toContain('height="44px"')
    expect(source).toContain(`:leftIcon="showHistoryPanel ? 'arrow-left' : ''"`)
    expect(source).toContain('@leftClick="handleNavbarLeftClick"')
  })

  // 旧的三层顶部必须真的消失，否则「省高度」等于没做。
  it("drops the sticky big-title header and the history mode bar", () => {
    const source = read("../../../src/pages/conversations/index.vue")

    expect(source).not.toContain("up-sticky")
    expect(source).not.toContain("conversations-sticky")
    expect(source).not.toContain("conversations-header")
    expect(source).not.toContain("history-mode-bar")
    expect(source).not.toContain("history-mode-back")
    expect(source).not.toContain("history-mode-title")
    expect(source).not.toContain("history-mode-create")
  })

  // 概览模式 leftIcon 为空，但 .u-navbar__content__left 区域仍然存在且可点
  // （见 node_modules/uview-plus/components/u-navbar/u-navbar.vue 模板与 leftClick 方法）。
  // 少了这道守卫，点左上角空白会静默清掉一遍历史状态。
  it("guards the navbar left hit area outside history mode", () => {
    const source = read("../../../src/pages/conversations/index.vue")

    expect(source).toContain("function handleNavbarLeftClick() {")
    const block = source.slice(
      source.indexOf("function handleNavbarLeftClick() {"),
      source.indexOf("}", source.indexOf("function handleNavbarLeftClick() {")) + 1
    )
    expect(block).toContain("if (!showHistoryPanel.value) return")
    expect(block).toContain("closeHistoryPanel()")
  })

  it("keeps both right-slot buttons independently clickable", () => {
    const source = read("../../../src/pages/conversations/index.vue")

    // right 槽整块共用一个 @rightClick，两个按钮要分别响应，所以不能用它。
    expect(source).not.toContain("@rightClick")
    expect(source).toContain('class="conversations-navbar__select"')
    expect(source).toContain('@click="toggleSelectionMode"')
    expect(source).toContain('class="conversations-navbar__action"')
    expect(source).toContain('@click="createConversation()"')
  })

  it("switches the navbar into history mode without new reactive state", () => {
    const source = read("../../../src/pages/conversations/index.vue")

    expect(source).toContain('v-if="showHistoryPanel"')
    // 标题与右侧按钮都只读既有状态，不引入新的 ref。
    expect(source).toContain('showHistoryPanel ? historyGroupTitle : "会话"')
    expect(source).toContain('v-if="canCreateInHistory"')
  })

  // .u-navbar__content 自带 background-color: $u-bg-color，光靠 bgColor="transparent"
  // 只覆盖 inline style，容器层仍不透明，必须 :deep() 穿透。
  it("makes the navbar glassy through deep selectors", () => {
    const source = read("../../../src/pages/conversations/index.vue")

    expect(source).toContain(".conversations-navbar-shell :deep(.u-navbar__content)")
    expect(source).toContain(".conversations-navbar-shell :deep(.u-status-bar)")
    expect(source).toContain("backdrop-filter: blur(30rpx)")
    expect(source).toContain("-webkit-backdrop-filter: blur(30rpx)")
    expect(source).toContain('bgColor="transparent"')
    expect(source).toContain('statusBarBgColor="transparent"')
    // __placeholder 是 u-navbar--fixed 之外的独立兄弟节点，一旦被染上玻璃色
    // 顶部会出现「占位块 + fixed 层」双层色带。
    expect(source).toContain(".conversations-navbar-shell :deep(.u-navbar__placeholder)")
  })

  it("keeps theme colors as var() fallbacks only", () => {
    const source = read("../../../src/pages/conversations/index.vue")
    const navbarStyles = source.slice(source.indexOf(".conversations-navbar-shell"))

    expect(navbarStyles).toContain("var(--up-card-bg-color, #ffffff)")
    expect(source).toContain(".conversations-navbar__title")
    expect(source).toContain("color: var(--up-main-color, #191c1e);")
  })

  // 390rpx 是按旧的三层顶部估的预算。navbar 改造后再写死它，历史列表底部会空出约 190rpx。
  // 高度改由 flex 链决定（.conversations-shell → .main-wrap--history → .history-list）。
  it("lets the history scroll area size itself through flex", () => {
    const source = read("../../../src/pages/conversations/index.vue")

    // 写死的 calc() 规则必须消失（允许出现在注释里，但不能是活跃 CSS 值）。
    expect(source).not.toContain("height: calc(100vh - 390rpx")
    const block = source.slice(
      source.indexOf(".history-scroll {"),
      source.indexOf("}", source.indexOf(".history-scroll {")) + 1
    )
    expect(block).toContain("flex: 1")
    expect(block).toContain("min-height: 0")
  })
})
