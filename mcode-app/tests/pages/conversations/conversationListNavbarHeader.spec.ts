import fs from "node:fs"
import path from "node:path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8")
}

const PAGE = "../../../src/pages/conversations/index.vue"
const NAVBAR = "../../../src/pages/conversations/components/ConversationsNavbar.vue"

describe("conversation list navbar header contract", () => {
  // 顶栏已抽成 ConversationsNavbar.vue。navbar 本身的形制断言读子组件，页面侧只断言
  // 「接线」（传对 prop、接对事件）。旧的三层顶部必须在两个文件里都不存在。
  it("renders the top bar through up-navbar instead of a sticky big title", () => {
    const source = read(NAVBAR)

    expect(source).toContain('customClass="conversations-navbar-shell"')
    expect(source).toContain(':fixed="true"')
    expect(source).toContain(':placeholder="true"')
    // tab 页没有返回目标；一旦误开 autoBack 会 navigateBack 到上一个 tab。
    expect(source).toContain(':autoBack="false"')
    expect(source).toContain('height="44px"')
    expect(source).toContain(`:leftIcon="historyMode ? 'arrow-left' : ''"`)
    // 返回动作作为事件上抛，页面接住后再决定是否关历史面板。
    expect(source).toContain('@leftClick="emit(\'back\')"')
  })

  it("wires the navbar to the page's history/selection state and handlers", () => {
    const source = read(PAGE)

    expect(source).toContain("<ConversationsNavbar")
    expect(source).toContain(':history-mode="showHistoryPanel"')
    expect(source).toContain(':title="historyGroupTitle"')
    expect(source).toContain(':can-create="canCreateInHistory"')
    expect(source).toContain(':show-selection-entry="showSelectionEntry"')
    expect(source).toContain(':selection-mode="selectionMode"')
    expect(source).toContain('@back="handleNavbarLeftClick"')
    expect(source).toContain('@create="createConversation()"')
    expect(source).toContain('@toggle-selection="toggleSelectionMode"')
  })

  // 旧的三层顶部必须真的消失，否则「省高度」等于没做。两个文件都不能有。
  it("drops the sticky big-title header and the history mode bar", () => {
    for (const file of [PAGE, NAVBAR]) {
      const source = read(file)
      expect(source).not.toContain("up-sticky")
      expect(source).not.toContain("conversations-sticky")
      expect(source).not.toContain("conversations-header")
      expect(source).not.toContain("history-mode-bar")
      expect(source).not.toContain("history-mode-back")
      expect(source).not.toContain("history-mode-title")
      expect(source).not.toContain("history-mode-create")
    }
  })

  // 概览模式 leftIcon 为空，但 .u-navbar__content__left 区域仍然存在且可点
  // （见 node_modules/uview-plus/components/u-navbar/u-navbar.vue 模板与 leftClick 方法）。
  // 少了这道守卫，点左上角空白会静默清掉一遍历史状态。**守卫留在页面**（它读 showHistoryPanel
  // 这个页面状态），子组件只负责在历史模式下渲染返回图标。
  it("guards the navbar left hit area outside history mode", () => {
    const source = read(PAGE)

    expect(source).toContain("function handleNavbarLeftClick() {")
    const block = source.slice(
      source.indexOf("function handleNavbarLeftClick() {"),
      source.indexOf("}", source.indexOf("function handleNavbarLeftClick() {")) + 1
    )
    expect(block).toContain("if (!showHistoryPanel.value) return")
    expect(block).toContain("closeHistoryPanel()")
  })

  it("keeps both right-slot buttons independently clickable", () => {
    const source = read(NAVBAR)

    // right 槽整块共用一个 @rightClick，两个按钮要分别响应，所以不能用它。
    expect(source).not.toContain("@rightClick")
    expect(source).toContain('class="conversations-navbar__select"')
    expect(source).toContain('@click="emit(\'toggle-selection\')"')
    expect(source).toContain('class="conversations-navbar__action"')
    expect(source).toContain('@click="emit(\'create\')"')
  })

  it("hides the title field from the create sheet", () => {
    // 弹层已抽成 CreateConversationSheet.vue，所以读子组件而不是页面。原来靠
    // 「创建会话底部弹层」/「批量发送弹层」两条注释切块 —— 前者随抽取消失了。现在整个
    // 文件就是那个弹层，不需要切块，断言范围反而更严（连配置弹层和进度弹层也覆盖）。
    const source = read(
      "../../../src/pages/conversations/components/CreateConversationSheet.vue"
    )

    expect(source).not.toContain("标题（可选）")
    expect(source).not.toContain("placeholder=\"输入会话标题\"")
    // 状态也不许留：留着一个永远是空串的 ref，下一个人会以为标题功能还在，
    // 把它接回 `create_conversation` 的入参。
    expect(source).not.toContain("newConversationTitle")
  })

  it("switches the navbar into history mode without new reactive state", () => {
    const source = read(NAVBAR)

    // 标题与右侧按钮都只读传入的 prop，子组件不引入新的 ref。
    expect(source).toContain('historyMode ? title : "会话"')
    expect(source).toContain('v-if="canCreate"')
  })

  // .u-navbar__content 自带 background-color: $u-bg-color，光靠 bgColor="transparent"
  // 只覆盖 inline style，容器层仍不透明，必须 :deep() 穿透。
  it("makes the navbar glassy through deep selectors", () => {
    const source = read(NAVBAR)

    expect(source).toContain(".conversations-navbar-shell :deep(.u-navbar__content)")
    expect(source).toContain(".conversations-navbar-shell :deep(.u-status-bar)")
    expect(source).toContain("backdrop-filter: blur(30rpx)")
    expect(source).toContain("-webkit-backdrop-filter: blur(30rpx)")
    expect(source).toContain('bgColor="transparent"')
    // 状态栏必须和 navbar 同色，否则真机上顶部有一条色差接缝。
    // H5 下 statusBarHeight=0、该条不可见，所以这个问题只有真机能暴露。
    expect(source).toContain(':statusBarBgColor="NAVBAR_GLASS_BG_COLOR"')
    // 必须是 CSS var() 字面量，不能在 script 里调 upThemeVar ——
    // 它是 uview 用 Options API mixin 注入的方法，只有模板作用域能调，
    // 在 <script setup> 里会抛 ReferenceError（prop 于是变成空串）。
    expect(source).toContain(
      'const NAVBAR_GLASS_BG_COLOR = "var(--up-navbar-glass-bg-color, rgba(255, 255, 255, 0.82))"'
    )
    expect(source).not.toContain('statusBarBgColor="transparent"')
    // 玻璃底色两处必须同源，否则状态栏与 navbar 会不一致
    expect(source).toContain("var(--up-navbar-glass-bg-color, rgba(255, 255, 255, 0.82)) !important")
    // __placeholder 是 u-navbar--fixed 之外的独立兄弟节点，一旦被染上玻璃色
    // 顶部会出现「占位块 + fixed 层」双层色带。
    expect(source).toContain(".conversations-navbar-shell :deep(.u-navbar__placeholder)")
  })

  it("keeps Android WebView content under the system status bar", () => {
    const manifest = JSON.parse(read("../../../src/manifest.json"))
    expect(manifest["app-plus"]?.statusbar).toMatchObject({
      background: "#00000000",
      immersed: true,
      style: "dark",
    })
  })

  it("keeps visual spacing between the navbar and search bar", () => {
    // 搜索行已抽成 ConversationsSearchBar.vue，间距样式跟着搬过去了。
    const source = read(
      "../../../src/pages/conversations/components/ConversationsSearchBar.vue"
    )
    const block = source.slice(
      source.indexOf(".conversations-searchbar {"),
      source.indexOf("}", source.indexOf(".conversations-searchbar {")) + 1
    )

    expect(block).toContain("margin-top: 16rpx;")
    expect(block).toContain("margin-bottom: 28rpx;")
  })

  it("keeps theme colors as var() fallbacks only", () => {
    const source = read(NAVBAR)
    const navbarStyles = source.slice(source.indexOf(".conversations-navbar-shell"))

    expect(navbarStyles).toContain("var(--up-card-bg-color, #ffffff)")
    expect(source).toContain(".conversations-navbar__title")
    expect(source).toContain("color: var(--up-main-color, #191c1e);")
  })

  // 390rpx 是按旧的三层顶部估的预算。navbar 改造后再写死它，历史列表底部会空出约 190rpx。
  // 高度改由 flex 链决定（.conversations-shell → .main-wrap--history → .history-list）。
  it("lets the history scroll area size itself through flex", () => {
    const source = read(PAGE)

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
