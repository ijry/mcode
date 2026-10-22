import fs from "node:fs"
import path from "node:path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8")
}

const PAGE = "../../../src/pages/conversations/index.vue"
const NAVBAR = "../../../src/pages/conversations/components/ConversationsNavbar.vue"
const SEARCHBAR = "../../../src/pages/conversations/components/ConversationsSearchBar.vue"

/**
 * 顶栏契约（M08 重构后）。
 *
 * 顶栏抽成 `ConversationsNavbar.vue`，形制断言读子组件，页面侧只断言「接线」
 * （传对 prop、接对事件）。M08 把顶栏定成三件套：左视图 / 中连接 / 右搜索，
 * 三个都是一次点击一个面板，所以顶栏本身零状态、零业务。
 */
describe("conversation list navbar header contract", () => {
  it("renders the top bar through up-navbar instead of a sticky big title", () => {
    const source = read(NAVBAR)

    expect(source).toContain('customClass="conversations-navbar-shell"')
    expect(source).toContain(':fixed="true"')
    expect(source).toContain(':placeholder="true"')
    // tab 页没有返回目标；一旦误开 autoBack 会 navigateBack 到上一个 tab。
    expect(source).toContain(':autoBack="false"')
    // M08 导航栏高度 46（设计稿节点 9:1661）。
    expect(source).toContain('height="46px"')
    // 顶栏不再自带返回：历史面板取消后，tab 页没有任何「返回上一屏」的目标，
    // 留着 @leftClick 只会让左上角那块空白变成一个沉默的死点。
    expect(source).not.toContain("@leftClick")
    expect(source).not.toContain("arrow-left")
  })

  it("wires the navbar to the page's connection / view / search state", () => {
    const source = read(PAGE)

    expect(source).toContain("<ConversationsNavbar")
    expect(source).toContain(':connection-name="activeConnectionName"')
    expect(source).toContain(':search-active="searchVisible"')
    // 顶栏零历史状态：没有第二块列表，也就没有「历史模式」这回事。
    expect(source).not.toContain("history-mode")
    expect(source).not.toContain("@back=")
    // 视图面板（列表形态 / 隐藏已完成 / 选择）由页面开，顶栏只抛事件。
    expect(source).toContain('@filter="openViewFilterSheet"')
    expect(source).toContain('@connection="openConnectionPicker"')
    expect(source).toContain('@search="toggleSearchBar"')
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

  // 左上角那块 `.u-navbar__content__left` 即使 leftIcon 为空也依然存在且可点
  // （见 uview-plus `u-navbar.vue` 模板与 leftClick 方法）。历史面板取消后它没有
  // 任何可返回的去向，所以顶栏不再接 `@leftClick`、页面也不再留守卫函数 ——
  // 留着只会是一个「点了没反应」的死区。
  it("leaves no dead left hit area now that history mode is gone", () => {
    const page = read(PAGE)
    const navbar = read(NAVBAR)

    expect(page).not.toContain("handleNavbarLeftClick")
    expect(navbar).not.toContain("@leftClick")
    expect(navbar).not.toContain("emit('back')")
  })

  /**
   * M08 顶栏三件套：左视图 / 中连接 / 右搜索，都是 32px 高的圆角玻璃块
   * （设计稿节点 9:1666 / 9:1667 / 9:1668）。
   *
   * 「隐藏已完成」「选择会话」这两个开关移进了页面侧的视图面板 —— 顶栏只留一个入口，
   * 这也是设计稿「左上角筛选视图」这句话的字面实现。
   */
  it("lays out the three glass controls of the M08 top bar", () => {
    const source = read(NAVBAR)

    expect(source).toContain("<template #left>")
    expect(source).toContain("<template #center>")
    expect(source).toContain("<template #right>")

    // 左：视图切换；右：搜索。32px 方块、圆角 16、72% 卡片色 + 6% 前景描边。
    expect(source).toContain('class="conv-nav__btn"')
    expect(source).toContain('name="list-dot"')
    expect(source).toContain('name="search"')
    expect(source).toContain("width: 32px;")
    expect(source).toContain("border-radius: 16px;")

    // 中：连接胶囊（名字 14 SemiBold + 11 的箭头）。
    expect(source).toContain('class="conv-nav__conn"')
    expect(source).toContain('class="conv-nav__conn-name"')
    expect(source).toContain('name="arrow-down"')
    expect(source).toContain("font-size: 14px;")

    // 三个动作全部上抛，顶栏自己不打开任何面板。
    expect(source).toContain("emit('filter')")
    expect(source).toContain("emit('connection')")
    expect(source).toContain("emit('search')")
    expect(source).not.toContain("<up-select")
  })

  // 视图面板里每一项都写「点下去会发生什么」，不写当前状态（当前态由「· 当前」后缀标在
  // 选项文案上）。状态筛选模式（全部 / 进行中 / 已置顶 / 已归档）放在最前，列表形态其次，
  // 选择入口最后。
  it("labels the view-sheet items by the action they perform", () => {
    const source = read(PAGE)

    // 状态筛选四模式由共享选项构造器产出（含「· 当前」标记），列表形态由另一个构造器产出。
    expect(source).toContain("buildConversationStatusModeActions(statusMode.value)")
    expect(source).toContain("buildConversationListStyleActions(listStyle.value)")
    // 选择入口文案仍是动作式，且只在有可选中卡片或已在选择模式时出现（后者保证筛选把
    // 卡全藏掉后用户仍有退出出口）。
    expect(source).toContain('selectionMode.value ? "退出选择" : "选择会话"')
    expect(source).toContain("if (showSelectionEntry.value || selectionMode.value) {")
  })

  // 中间槽只有一种形态：连接胶囊。历史模式取消后不再有「标题态」。
  it("shows the connection pill in the centre slot", () => {
    const source = read(NAVBAR)

    expect(source).toContain("<template #center>")
    expect(source).toContain('class="conv-nav__conn"')
    expect(source).toContain('{{ connectionName || "未连接" }}')
    expect(source).not.toContain("historyMode")
    expect(source).not.toContain("conv-nav__title")
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

  // 搜索条默认收起：M08 把它收成顶栏右侧一枚图标，常驻输入框会让列表变成次要内容。
  it("keeps the search bar collapsed until the navbar icon is tapped", () => {
    const page = read(PAGE)

    expect(page).toContain('v-if="searchVisible"')
    expect(page).toContain("const searchVisible = ref(false)")
    // 收起时顺手清关键词，否则「关了搜索但列表还被过滤着」——没有任何线索说明为什么少了会话。
    const block = page.slice(
      page.indexOf("function toggleSearchBar() {"),
      page.indexOf("}", page.indexOf("function toggleSearchBar() {")) + 1
    )
    expect(block).toContain('searchKeyword.value = ""')
  })

  // 「已完成」筛选胶囊已从搜索行移走，别留下副本 —— 两个入口切同一个偏好会让用户
  // 以为是两个开关。
  it("drops the completed-filter chip from the search row", () => {
    const source = read(SEARCHBAR)

    expect(source).not.toContain("conversations-filter-chip")
    expect(source).not.toContain("toggle-hide-completed")
  })

  // 选择模式下底部是批量操作条，新建会打断选择流程（这条规则从原顶栏的
  // `v-if="!selectionMode"` 继承）。历史模式那半条判据随面板一起取消 ——
  // 现在新建永远发生在当前连接上，不需要「有没有分组键」这个前提。
  it("keeps the create button's visibility rules", () => {
    const source = read(PAGE)
    // 按行取：这条 computed 是一行箭头函数，用 `})` 当收尾会一路吃到下一个块。
    const start = source.indexOf("const canCreateConversation = computed(")
    const block = source.slice(start, source.indexOf("\n", start))

    expect(block).toContain("selectionMode.value")
    expect(block).not.toContain("showHistoryPanel")
  })

  it("hides the title field from the create sheet", () => {
    const source = read(
      "../../../src/pages/conversations/components/CreateConversationSheet.vue"
    )

    expect(source).not.toContain("标题（可选）")
    expect(source).not.toContain('placeholder="输入会话标题"')
    // 状态也不许留：留着一个永远是空串的 ref，下一个人会以为标题功能还在，
    // 把它接回 `create_conversation` 的入参。
    expect(source).not.toContain("newConversationTitle")
  })

  it("keeps the navbar a stateless controlled component", () => {
    const source = read(NAVBAR)

    expect(source).not.toContain("historyMode")
    expect(source).not.toContain('name="arrow-left"')
    // 顶栏零状态：没有 ref / watch，只有 props + emit。
    expect(source).not.toContain("ref(")
    expect(source).not.toContain("watch(")
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
    expect(source).toContain(".conv-nav__conn-name")
    expect(source).toContain("color: var(--up-main-color, #3c3c43);")
  })

  // 高度由 flex 链决定（.conversations-shell → .main-wrap → .conv-panel）。
  // 历史面板取消后不再有「第二块 fixed 屏」，`46px` 那个偏移也随之消失 ——
  // 它当初是为「历史面板顶到 navbar 下沿」服务的，留着只会把列表整体推下去。
  it("lets the single list panel size itself through flex", () => {
    const source = read(PAGE)

    expect(source).not.toContain("height: calc(100vh - 390rpx")
    expect(source).not.toContain("conversations-shell--history")
    expect(source).not.toContain("top: calc(var(--window-top, 0px) + 46px);")
    const block = source.slice(
      source.indexOf(".main-wrap {"),
      source.indexOf("}", source.indexOf(".main-wrap {")) + 1
    )
    expect(block).toContain("flex: 1")
    expect(block).toContain("min-height: 0")
  })
})
