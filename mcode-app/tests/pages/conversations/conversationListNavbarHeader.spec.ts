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
  // 顶栏是 **fixed + 全透明**的：三件套必须置顶（常驻控件，滚走就没了入口），
  // 但整层不画背景。iOS 26/27 在 standalone 下于页面顶部画自己的 Liquid Glass
  // 滚动边缘带（约 75pt，锚在 webview 顶部）采样滚动内容 —— 连接列表「状态栏与
  // 内容一整片」靠的是这条系统带。WebKit 的 _shouldHideTopScrollPocket 只在命中
  // 测试撞上的 fixed 盒子**带底色**时拿它的颜色填掉玻璃带（fixed colour
  // extension，WKWebViewIOS.mm）；透明 = 取不到色 = 带子照画，导航行整个落进
  // 带里被系统糊掉。用户三次反馈的「两块割裂」成因是上色，不是 fixed。
  it("pins the top bar as a fixed, fully transparent strip", () => {
    const source = read(NAVBAR)

    // 置顶：fixed 层全宽、z-index 压过列表内容。三件套是常驻控件。
    expect(source).toContain("position: fixed")
    expect(source).toContain("z-index: 10")
    // 但不套 up-navbar：那套自带 placeholder 与背景机制，是三轮割裂的载体。
    expect(source).not.toContain("up-navbar")
    expect(source).not.toContain(":fixed=")
    expect(source).not.toContain(":placeholder=")
    // 状态栏占位 + 46px 导航行（设计稿 9:1661）；占位高度按平台取（statusBarInset）。
    expect(source).toContain("conversations-navbar__statusbar")
    expect(source).toContain("statusBarInset")
    expect(source).toContain("height: 46px;")
    expect(source).toContain(".conversations-navbar__row {")
    // fixed 之后不再吃 shell 的 32rpx 内距，导航行自己补，与搜索条/卡片对齐。
    expect(source).toContain("padding: 0 32rpx")
    // tab 页没有返回目标；一旦误开 autoBack 会 navigateBack 到上一个 tab。
    expect(source).not.toContain("autoBack")
    // 顶栏不再自带返回：历史面板取消后，tab 页没有任何「返回上一屏」的目标。
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
   *
   * 三件套直接排在导航行里（不再借 up-navbar 的 left/center/right 槽位），
   * space-between 让左按钮贴头、右按钮贴尾、胶囊居中。
   */
  it("lays out the three glass controls of the M08 top bar", () => {
    const source = read(NAVBAR)

    // 不再有插槽：三件套是导航行的直接子节点。
    expect(source).not.toContain("<template #")
    expect(source).toContain('<view class="conv-nav__btn" @click="emit(\'filter\')">')
    expect(source).toContain('<view class="conv-nav__conn" @click="emit(\'connection\')">')

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

  // 中间只有一个连接胶囊。历史模式取消后不再有「标题态」。
  it("shows the connection pill in the centre of the row", () => {
    const source = read(NAVBAR)

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

  // 顶栏**整体不画背景**：状态栏占位与导航行都透明，露的是 `.conversations-page`
  // 的页面底色；顶上那条玻璃带是 iOS 系统画的（meta=black，service 的 "system" 档）。
  // 曾经在这里手绘玻璃（backdrop-filter + 状态栏段深色渐变），系统带照画、两层材质
  // 对不上 —— 割裂的成因。删干净，别留「把玻璃画得更好」的回头路。
  it("paints nothing over the status bar area so the system glass shows through", () => {
    const source = read(NAVBAR)
    // 只查样式块：注释里会留下这些词的历史记录（讲清楚为什么删），那不是代码。
    const styles = source.slice(source.indexOf("<style"))

    // 没有任何自绘材质：没有磨砂、没有玻璃底、没有渐变、没有暗罩。
    expect(styles).not.toContain("backdrop-filter")
    expect(styles).not.toContain("linear-gradient")
    expect(styles).not.toContain("rgba(242, 242, 247")
    expect(styles).not.toContain("rgba(0, 0, 0, 0.3)")
    expect(styles).not.toContain("is-dark")
    // 脚本里不再保留任何底色常量 / computed：留着下一个人会以为顶栏还有底色。
    expect(source).not.toContain("NAVBAR_BG_LIGHT")
    expect(source).not.toContain("NAVBAR_BG_DARK")
    expect(source).not.toContain("isDarkThemeMode")
    // 占位条透明是唯一被要求的「颜色」。
    const spacerBlock = styles.slice(
      styles.indexOf(".conversations-navbar__statusbar {")
    )
    expect(spacerBlock.slice(0, spacerBlock.indexOf("}"))).toContain("background: transparent")
    // u-navbar 的残留机制全部不许回来。
    expect(source).not.toContain("u-navbar")
    expect(source).not.toContain("u-status-bar")
    expect(source).not.toContain("__placeholder")
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
    // 从第一块控件样式开始取：顶栏不再有外壳 class，样式全部挂在三件套上。
    const navbarStyles = source.slice(source.indexOf(".conv-nav__btn {"))

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
