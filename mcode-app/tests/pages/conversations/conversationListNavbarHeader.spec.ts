import fs from "node:fs"
import path from "node:path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8")
}

const PAGE = "../../../src/pages/conversations/index.vue"
const NAVBAR = "../../../src/pages/conversations/components/ConversationsNavbar.vue"
const SEARCHBAR = "../../../src/pages/conversations/components/ConversationsSearchBar.vue"

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
    // 返回动作作为事件上抛，页面接住后再决定是否关历史面板。
    expect(source).toContain('@leftClick="emit(\'back\')"')
  })

  it("wires the navbar to the page's history/selection state and handlers", () => {
    const source = read(PAGE)

    expect(source).toContain("<ConversationsNavbar")
    expect(source).toContain(':history-mode="showHistoryPanel"')
    expect(source).toContain(':title="historyGroupTitle"')
    expect(source).toContain(':hide-completed="hideCompletedConversations"')
    expect(source).toContain(':show-selection-entry="showSelectionEntry"')
    expect(source).toContain(':selection-mode="selectionMode"')
    expect(source).toContain('@back="handleNavbarLeftClick"')
    expect(source).toContain('@toggle-hide-completed="toggleHideCompletedConversations"')
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

  // 「已完成筛选」与「选择」收进左侧 up-select 下拉，顶栏因此没有 right 槽；新建的 ＋
  // 搬到搜索行。这一组钉住那个归属，防止有人把按钮又摆回顶栏右侧。
  it("puts the filter and selection actions inside a left up-select menu", () => {
    const source = read(NAVBAR)

    expect(source).toContain("<template #left>")
    expect(source).toContain("<up-select")
    expect(source).toContain('class="conversations-navbar__menu"')
    // 触发区是纯图标：#text 槽放图标顶掉默认 label，#icon 槽塞占位节点顶掉默认 arrow-down。
    expect(source).toContain("<template #text>")
    expect(source).toContain('class="conversations-navbar__menu-icon"')
    expect(source).toContain('name="more-dot-fill"')
    expect(source).toContain("<template #icon>")
    expect(source).toContain('class="conversations-navbar__menu-icon-slot"')
    // 文案版触发区不许回来（标题的位置在 center 槽）。
    expect(source).not.toContain("conversations-navbar__menu-label")
    expect(source).toContain('@select="handleMenuSelect"')

    // 两个动作只通过菜单项上抛，顶栏不再自己摆按钮。
    expect(source).toContain('emit("toggle-hide-completed")')
    expect(source).toContain('emit("toggle-selection")')
    expect(source).not.toContain("<template #right>")
    expect(source).not.toContain("@rightClick")
    expect(source).not.toContain("conversations-navbar__action")
  })

  // up-select 不绑 current，菜单没有勾选态可显示，所以文案必须说「点下去会发生什么」。
  // 写成当前状态（「已隐藏已完成」）的话，用户读不出这是开关还是标签。
  it("labels menu items by the action they perform", () => {
    const source = read(NAVBAR)

    expect(source).toContain('props.hideCompleted ? "显示已完成会话" : "隐藏已完成会话"')
    expect(source).toContain('props.selectionMode ? "退出选择" : "选择会话"')
    // 没有可选中卡片时不出「选择会话」；但已在选择模式里必须保留，否则筛选把卡片全藏掉后
    // 用户没有退出选择的入口。
    expect(source).toContain("if (props.showSelectionEntry || props.selectionMode) {")
  })

  // 左侧触发区改成图标后，「会话」这个页面标题必须落在 center 槽，否则概览模式没有标题。
  it("keeps the overview title in the navbar center slot", () => {
    const source = read(NAVBAR)

    expect(source).toContain("<template #center>")
    expect(source).toContain('{{ historyMode ? title : "会话" }}')
  })

  it("moves the create-conversation plus into the search row", () => {
    const navbar = read(NAVBAR)
    const searchbar = read(SEARCHBAR)
    const page = read(PAGE)

    expect(navbar).not.toContain("emit('create')")
    expect(searchbar).toContain('class="conversations-create-button"')
    expect(searchbar).toContain('@click="emit(\'create\')"')
    expect(searchbar).toContain('v-if="canCreate"')
    expect(page).toContain(':can-create="canCreateConversation"')
    expect(page).toContain('@create="createConversation()"')
  })

  // 搜索行高度：up-search 的 :height 用 px，容器/输入框/圆钮用 rpx，必须成对。
  // 32px === 64rpx（750rpx 设计稿下 1px = 2rpx），错开就会出现输入框与圆钮不同高。
  it("keeps the search row compact with matching heights", () => {
    const source = read(SEARCHBAR)

    expect(source).toContain(':height="32"')
    expect(source).not.toContain("80rpx")
    const contentBlock = source.slice(
      source.indexOf(".conversations-searchbar :deep(.u-search__content) {"),
      source.indexOf("}", source.indexOf(".conversations-searchbar :deep(.u-search__content) {")) + 1
    )
    expect(contentBlock).toContain("height: 64rpx;")
    const buttonBlock = source.slice(
      source.indexOf(".conversations-create-button {"),
      source.indexOf("}", source.indexOf(".conversations-create-button {")) + 1
    )
    expect(buttonBlock).toContain("width: 64rpx;")
    expect(buttonBlock).toContain("height: 64rpx;")
  })

  // 「已完成」筛选胶囊已从搜索行移走，别留下副本 —— 两个入口切同一个偏好会让用户
  // 以为是两个开关。
  it("drops the completed-filter chip from the search row", () => {
    const source = read(SEARCHBAR)

    expect(source).not.toContain("conversations-filter-chip")
    expect(source).not.toContain("toggle-hide-completed")
  })

  // 选择模式下底部是批量操作条，新建会打断选择流程（这条规则从原顶栏的
  // `v-if="!selectionMode"` 继承）；历史模式没有分组键时新建弹层没有默认连接可用。
  it("keeps the create button's visibility rules", () => {
    const source = read(PAGE)
    const block = source.slice(
      source.indexOf("const canCreateConversation = computed(() => {"),
      source.indexOf("})", source.indexOf("const canCreateConversation = computed(() => {")) + 2
    )

    expect(block).toContain("if (selectionMode.value) return false")
    expect(block).toContain("if (showHistoryPanel.value) return Boolean(historyGroupKey.value)")
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

    // 标题与菜单项都只读传入的 prop，子组件不引入新的 ref（menuOptions 是 computed）。
    expect(source).toContain('name="arrow-left"')
    expect(source).toContain('class="conversations-navbar__title u-line-1"')
    expect(source).toContain('v-if="historyMode"')
    expect(source).not.toContain("ref(")
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
