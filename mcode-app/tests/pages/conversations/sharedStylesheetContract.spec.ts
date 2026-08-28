import fs from "node:fs"
import path from "node:path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8")
}

const PAGE = "../../../src/pages/conversations/index.vue"
const SHARED = "../../../src/pages/conversations/index.scss"

/**
 * 会话列表页与其子组件之间的**共享样式**契约。
 *
 * uni-app 的 `<style scoped>` 按组件加 data 属性，父页面的规则**不会命中子组件渲染出的
 * 元素**。所以拆子组件时，凡是两边都用到的 class 必须由一份共用源码提供 —— 各写一份必然
 * 漂移，而漂移的症状（同一个视觉元素两处长得不一样）没有任何报错，源码字符串扫描也抓不到。
 *
 * 这份 spec 钉住三件事：
 *   ① 共用规则**只在** `index.scss` 里定义，页面里不留副本；
 *   ② 页面确实 `@import` 了它（否则页面自己那部分元素会掉样式）；
 *   ③ 只服务单个组件的规则**不许**混进来。
 */
describe("conversations shared stylesheet contract", () => {
  // 判据是「跨组件边界共用」。四组分别对应：三个弹层共用的外壳/头部、新建与批量发送共用的
  // 表单行、两种 logo 容器共用的按类型修饰符、四处共用的安全区占位。
  const SHARED_SELECTORS = [
    ".create-sheet {",
    ".create-sheet__hd {",
    ".create-sheet__title {",
    ".create-sheet__close {",
    ".form-group {",
    ".form-label {",
    ".agent-logo--real {",
    ".safe-bottom {",
  ]

  it("defines every shared rule in the shared stylesheet", () => {
    const source = read(SHARED)
    for (const selector of SHARED_SELECTORS) {
      expect(source).toContain(selector)
    }
  })

  it("leaves no duplicate of a shared rule in the page", () => {
    // 页面里若残留同名规则，它会和 `@import` 进来的那份同时生效 —— 后写的赢，于是改
    // 共享文件时「有时生效有时不生效」。
    const source = read(PAGE)
    const styleBlock = source.slice(source.indexOf('<style scoped lang="scss">'))
    for (const selector of SHARED_SELECTORS) {
      expect(styleBlock).not.toContain(`\n${selector}`)
    }
  })

  it("imports the shared stylesheet from the page", () => {
    const source = read(PAGE)
    expect(source).toContain('@import "./index.scss";')
  })

  it("keeps the agent logo type modifiers with the shared sheet, not the page", () => {
    // 这条最容易在拆分时丢：`overviewAgentLogoClass()` 返回 `agent-logo--<type>`，而两个
    // 消费者的容器 class 完全不同（概览卡 `.agent-logo`、新建弹层 `.agent-card__logo`）——
    // 修饰符是**跨容器**的。搬走弹层而不搬这组规则，真机上 logo 的白底描边会静默消失。
    const shared = read(SHARED)
    const page = read(PAGE)

    expect(shared).toContain(".agent-logo--claude_code,")
    expect(shared).toContain(".agent-logo--cline {")
    expect(page).not.toContain("\n.agent-logo--claude_code,")

    // 容器自己的规则**留在各自组件**：概览卡的 `.agent-logo` 基样式仍归页面。
    expect(page).toContain("\n.agent-logo {")
    expect(shared).not.toContain("\n.agent-logo {")
  })

  it("keeps page-only rules out of the shared stylesheet", () => {
    // 反向保护：共享文件不是大杂烩。进了这里就意味着「有两个以上消费者」，这条可读性
    // 一旦破掉，以后没人知道哪些能改、哪些一改就影响别的组件。
    const source = read(SHARED)

    expect(source).not.toContain(".conversations-page")
    expect(source).not.toContain(".live-card")
    expect(source).not.toContain(".history-list")
    expect(source).not.toContain(".bulk-send-sheet")
  })
})
