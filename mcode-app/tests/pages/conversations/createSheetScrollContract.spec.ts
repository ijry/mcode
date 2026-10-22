import fs from "node:fs"
import path from "node:path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8")
}

/** 取一条 CSS 规则的完整文本（选择器到右花括号）。找不到选择器时返回空串，测试必然失败。 */
function extractRule(source: string, selector: string) {
  const start = source.indexOf(selector)
  if (start < 0) return ""
  const end = source.indexOf("}", start)
  return source.slice(start, end < 0 ? undefined : end)
}

const SHARED = "../../../src/pages/conversations/index.scss"
const SHEET = "../../../src/pages/conversations/components/CreateConversationSheet.vue"
const PAGE = "../../../src/pages/conversations/index.vue"

/**
 * 底部弹层的**滚动能力**契约。
 *
 * 症状（用户报的）：「模型列表太长，创建会话时打开后无法滚动」—— 智能体配置弹层里
 * 模型选项一多，弹层就被撑到屏幕外，下面几排选项既点不到也滚不到。
 *
 * 根因有两层，缺任何一层都修不好：
 *   ① up-popup 只在 `touchable=true` 时才给内容套 maxHeight（默认 false），弹层高度
 *      本身没有上限；而 `.create-sheet` 此前也没有 max-height、没有任何滚动容器 ——
 *      内容一高就整块冲出视口。
 *   ② up-popup 的内容节点上绑了 `@touchmove.stop.prevent`：触摸事件一旦冒泡到那里就会
 *      被 preventDefault，滚动容器自身的原生滚动被一并取消。桌面滚轮不受影响，所以
 *      这个问题在电脑上永远发现不了，只在触屏上发作。
 *
 * 修法：壳 `max-height: 86vh` + 列向 flex，唯一可缩的 `.create-sheet__body` 内部
 * `overflow-y: auto`，且每个滚动容器自己 `@touchmove.stop` 把冒泡拦在 popup 之前。
 */
describe("create sheet scroll contract", () => {
  it("caps the popup shell at the viewport height", () => {
    // 弹层外壳必须自己兜住高度：up-popup 不给（touchable 默认 false），
    // 不兜的后果就是内容整块冲出屏幕。
    const rule = extractRule(read(SHARED), ".create-sheet {")

    expect(rule).toContain("max-height: 86vh")
    expect(rule).toContain("display: flex")
    expect(rule).toContain("flex-direction: column")
    // padding 要算进 86vh 里，否则弹层总高 = 86vh + 顶部内距，仍然溢出。
    expect(rule).toContain("box-sizing: border-box")
  })

  it("makes the body the only shrinking, scrollable region", () => {
    const rule = extractRule(read(SHARED), ".create-sheet__body {")

    expect(rule).toContain("overflow-y: auto")
    // min-height:0 是「能被 86vh 压瘦」的前提：flex 子项默认不会缩到内容高度以下。
    expect(rule).toContain("min-height: 0")
    // 可缩不涨 —— 内容矮时弹层贴着内容走，不多留一寸空白。
    expect(rule).toContain("flex: 0 1 auto")
    expect(rule).toContain("overscroll-behavior: contain")
  })

  it("keeps the header and safe-area out of the scroll region", () => {
    // 被 86vh 夹住时只有 body 出让高度；头部与安全区跟着缩只会被压扁。
    const shared = read(SHARED)

    expect(extractRule(shared, ".create-sheet__hd {")).toContain("flex-shrink: 0")
    expect(extractRule(shared, ".safe-bottom {")).toContain("flex-shrink: 0")
  })

  it("stops touchmove before it reaches the popup's preventDefault node", () => {
    // 每个滚动容器都必须自己 @touchmove.stop：up-popup 内容节点上的
    // preventDefault 会把容器自身的原生滚动一起取消（触屏整块滚不动）。
    const sheet = read(SHEET)

    // 智能体横带：智能体一多就伸出屏幕外，拖不动就等于后半部分永远选不到。
    expect(sheet).toContain(
      '<scroll-view class="agent-scroll" scroll-x show-scrollbar="false" enhanced @touchmove.stop>'
    )
    // 两个弹层各有一段可滚 body：新建会话表单、智能体配置。
    const bodies = sheet.match(/class="create-sheet__body" @touchmove\.stop/g) || []
    expect(bodies).toHaveLength(2)

    // 批量发送弹层同病：textarea autoHeight + 1200 字上限，长文本一样撑出屏幕。
    const page = read(PAGE)
    expect(page).toContain('class="create-sheet__body" @touchmove.stop')
    // 外壳也必须落在共享的 `.create-sheet` 上 —— 高度上限与滚动规则都在那一份里，
    // 退回自带壳类（哪怕内容仍在 body 里）就等于重新失去 max-height。
    expect(page).toContain('<view class="create-sheet" :style="upThemeCardStyle">')
    expect(page).not.toContain(".bulk-send-sheet {")
  })

  it("wraps the long content in the body, not directly under the shell", () => {
    // 智能体配置弹层是最长的那份内容（授权类型 + 每个配置项，模型能到十几个取值），
    // 它整段都必须在 body 里。
    const sheet = read(SHEET)
    const configSheet = sheet.slice(
      sheet.indexOf('v-model:show="showCreateConfigDialog"'),
      sheet.indexOf("<!-- 创建进度弹层")
    )

    expect(configSheet).toContain('<view class="create-sheet__body" @touchmove.stop>')
    // 配置项不许漏在 body 外：任何一节直接挂在壳上，长列表就会重新冲出屏幕。
    expect(configSheet).toContain('v-for="option in createAgentConfig.configOptions"')
    expect(configSheet.indexOf('class="create-sheet__body"')).toBeLessThan(
      configSheet.indexOf('v-for="option in createAgentConfig.configOptions"')
    )
  })
})
