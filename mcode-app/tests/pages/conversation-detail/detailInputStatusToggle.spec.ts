import fs from "node:fs"
import path from "node:path"
import {
  buildDetailInputStatusMenuAction,
  normalizeDetailInputStatusVisibility,
} from "../../../src/pages/conversation-detail/detailCyberMode"

function read(relativePath: string) {
  return fs.readFileSync(
    path.resolve(__dirname, "../../../src", relativePath),
    "utf8"
  )
}

describe("detail input status pill toggle", () => {
  const page = read("pages/conversation-detail/index.vue")
  const pane = read("pages/conversation-detail/ConversationDetailInteractivePane.vue")
  const body = read("pages/conversation-detail/ConversationDetailBody.vue")

  it("exposes the toggle from the navbar more-menu", () => {
    // 菜单项文案要跟着当前状态变：只在显示时才能点「隐藏」。
    expect(page).toContain("buildDetailInputStatusMenuAction(showInputStatusPill.value)")
    expect(page).toContain('action === "隐藏输入框状态"')
    expect(page).toContain('action === "显示输入框状态"')
  })

  it("persists the preference and restores it on load/show", () => {
    expect(page).toContain("DETAIL_INPUT_STATUS_STORAGE_KEY")
    // onLoad 与 onShow 都要恢复：从别的页面改完回来，onShow 是唯一的机会。
    const loadBlock = page.slice(page.indexOf("onLoad("), page.indexOf("onShow("))
    expect(loadBlock).toContain("restoreInputStatusPreference()")
    const showBlock = page.slice(page.indexOf("onShow("), page.indexOf("onShow(") + 400)
    expect(showBlock).toContain("restoreInputStatusPreference()")
  })

  it("passes the switch down to the status row", () => {
    expect(page).toContain(':show-input-status-pill="showInputStatusPill"')
    expect(pane).toContain("showInputStatusPill?: boolean")
    expect(pane).toContain('v-if="inputStatusVisible"')
    // 缺省必须是可见：老调用方 / 测试夹具不传这个 prop 时不能被误伤。
    expect(pane).toContain("props.showInputStatusPill !== false")
  })

  it("keeps transport banners even when the pill is hidden", () => {
    // 断线/重连这类横幅是错误通道，不能因为「不想看状态胶囊」就一起闭嘴。
    expect(pane).toContain(
      ':status-area-visible="inputStatusVisible || Boolean(transportBanner)"'
    )
    expect(body).toContain('v-if="statusAreaRendered"')
    expect(body).toContain("props.statusAreaVisible !== false")
  })

  it("normalizes stored visibility defensively", () => {
    expect(normalizeDetailInputStatusVisibility(undefined)).toBe(true)
    expect(normalizeDetailInputStatusVisibility("")).toBe(true)
    expect(normalizeDetailInputStatusVisibility("坏掉的 json")).toBe(true)
    expect(normalizeDetailInputStatusVisibility(JSON.stringify({ visible: false }))).toBe(false)
    expect(normalizeDetailInputStatusVisibility(JSON.stringify({ visible: true }))).toBe(true)
    expect(normalizeDetailInputStatusVisibility("false")).toBe(false)
    expect(normalizeDetailInputStatusVisibility(0)).toBe(false)
  })

  it("labels the menu action by current state", () => {
    expect(buildDetailInputStatusMenuAction(true).name).toBe("隐藏输入框状态")
    expect(buildDetailInputStatusMenuAction(false).name).toBe("显示输入框状态")
  })
})

describe("detail navbar bottom spacing", () => {
  const page = read("pages/conversation-detail/index.vue")
  const styles = read("pages/conversation-detail/index.scss")

  it("uses the design's 48px navbar and centres the two-row title block", () => {
    // 设计稿导航栏 48px（节点 9:11）；标题 + 胶囊两行内容靠垂直居中留出上下余量。
    expect(page).toContain('height="48px"')
    const rawRule = styles.slice(
      styles.indexOf(".detail-navbar {"),
      styles.indexOf(".detail-navbar__title-row")
    )
    // 去掉注释再断言：注释里会复述旧写法（`align-items: flex-start`），
    // 不去掉的话这个反向断言永远为假阳性。
    const navbarRule = rawRule.replace(/\/\*[\s\S]*?\*\//g, "")
    expect(navbarRule).toContain("align-items: center")
    expect(navbarRule).not.toContain("align-items: flex-start")
  })

  it("keeps the layout offset in sync with the navbar height", () => {
    // 偏移量若仍按 44 算，消息区会比导航栏占位矮 4px。
    expect(page).toMatch(/return statusBarHeight \+ 48/)
  })
})

describe("message bubble table can scroll horizontally", () => {
  const bubble = read("components/MessageBubble.vue")

  it("lets the table itself be the scroll container", () => {
    const rule = bubble.slice(bubble.indexOf(":deep(table),"), bubble.indexOf(":deep(thead),"))
    // `width: max-content` 会让表盒撑到内容宽，自身没有可滚动溢出 ——
    // 超出的部分被祖先的 overflow:hidden 直接裁掉，就是「右侧看不见也划不动」。
    expect(rule).not.toContain("width: max-content")
    expect(rule).toContain("width: 100%")
    expect(rule).toContain("overflow-x: auto")
    expect(rule).toContain("display: block")
  })

  it("keeps a readable column floor so columns do not collapse", () => {
    // 先剥注释再找规则：注释里也会复述 `min-width: 4em`，直接 indexOf 会命中注解。
    const stripped = bubble.replace(/\/\*[\s\S]*?\*\//g, "")
    const start = stripped.indexOf(":deep(th),")
    const cellRule = stripped.slice(start, stripped.indexOf("}", stripped.indexOf("min-width: 4em")))
    expect(start).toBeGreaterThan(-1)
    expect(cellRule).toContain("min-width: 4em")
  })
})
