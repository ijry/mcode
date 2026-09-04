import fs from "node:fs"
import path from "node:path"

const root = path.resolve(__dirname, "../../../src/pages/conversation-detail")

function read(relative: string) {
  return fs.readFileSync(path.join(root, relative), "utf8")
}

/**
 * 状态胶囊里「已运行时间」的**源码扫描契约**。
 *
 * 组件从不被挂载（jest 配的是 `testEnvironment: node`，仓库里没有 @vue/test-utils），
 * 所以接线上的不变量只能按字符串断言。这里每一条都对应一个具体的坑 —— 尤其是那条
 * 「计时器不许住在 pane 里」：它防的是把刚做完的流式性能优化一次性还回去。
 */
describe("status capsule run elapsed wiring", () => {
  const pane = read("ConversationDetailInteractivePane.vue")
  const elapsed = read("ConversationDetailRunElapsed.vue")

  it("renders the elapsed text inside the status capsule's main row", () => {
    expect(pane).toContain(
      'import ConversationDetailRunElapsed from "./ConversationDetailRunElapsed.vue";'
    )
    const main = pane.slice(
      pane.indexOf('<view class="input-status-row__main">'),
      pane.indexOf('v-if="planTasks.length > 0"')
    )
    expect(main).toContain("<ConversationDetailRunElapsed")
    expect(main).toContain('v-if="showRunElapsed"')
    expect(main).toContain(':started-at="runElapsedStartedAt"')
  })

  /**
   * 起点必须取 `liveMessage.timestamp`，那是本回合唯一的时间戳来源：本端发起时
   * `beginPlaceholderThinking` 打 `Date.now()`，中途接入时 `mapSnapshotLiveMessage`
   * 从 attach 快照的 `live_message.started_at` 解析。再存一个字段就会有两份可能打架的起点。
   */
  it("derives the turn start from the live message rather than a second field", () => {
    expect(pane).toContain("const runElapsedStartedAt = computed(")
    expect(pane).toContain("session.value.liveMessage?.timestamp")
    expect(pane).toContain("shouldShowRunElapsed(runtimeStatus.value, runElapsedStartedAt.value)")
  })

  /**
   * **计时器只能住在叶子组件里。**
   *
   * pane 的模板同时 `v-for` 出整条消息时间线（尾窗允许 230 轮）。在 pane 里读一个每秒
   * 推进的 ref，会让整棵 vnode 树每秒重建一次 —— 正是
   * `2026-09-04-05-05-detail-streaming-performance-fixes` 那一轮消除掉的开销。
   */
  it("keeps the once-per-second timer out of the pane", () => {
    expect(elapsed).toContain("setInterval(sync, 1000)")
    expect(elapsed).toContain("onBeforeUnmount(stop)")
    // 反向断言：pane 里不得出现自己的秒级计时器。
    expect(pane).not.toContain("setInterval(sync")
    expect(pane).not.toMatch(/setInterval\([^)]*,\s*1000\s*\)/)
  })

  /**
   * 存格式化后的字符串而不是时间戳：同值赋 ref 不触发更新，所以跨过一小时（不再显示秒）
   * 之后重渲染降到每分钟一次，而定时器不必换频率。
   */
  it("holds the formatted label so an unchanged string does not re-render", () => {
    expect(elapsed).toContain('const label = ref("")')
    expect(elapsed).toContain("label.value = formatRunElapsed(")
  })

  /** 详情页是 swiper 多 tab，非当前页的 pane 仍挂载着 —— 看不见的地方不该每秒醒一次。 */
  it("pauses while the pane is not the active tab", () => {
    expect(pane).toContain(':paused="!active"')
    expect(elapsed).toContain("props.paused")
  })

  /**
   * 主题重着色跟着 `.input-status-row__text` 走。三个主题都要覆盖到，否则 cyber 那种
   * 深底主题上这行字会留在浅色 `--up-light-color` 上，几乎读不出来。
   */
  it("recolors with the status text in every theme", () => {
    const sheet = read("index.scss")
    ;["sweet", "summer", "cyber"].forEach((theme) => {
      expect(sheet).toContain(`.page--${theme} .input-status-row__elapsed`)
    })
  })
})
