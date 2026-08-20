import { resolveDetailHistoryIndicatorPresentation } from "@/pages/conversation-detail/detailHistoryIndicatorPresentation"

describe("detailHistoryIndicatorPresentation", () => {
  const base = {
    hasMessages: true,
    hasMore: true,
    loadingOlder: false,
    initialLoading: false,
    pullThreshold: 56,
  }

  it("hides itself on an empty conversation", () => {
    // 空会话既没有历史可翻，也不该显示「没有更多历史了」——那读起来像出错。
    const state = resolveDetailHistoryIndicatorPresentation({
      ...base,
      hasMessages: false,
      hasMore: false,
    })
    expect(state).toEqual({
      code: "hidden",
      visible: false,
      text: "",
      busy: false,
      retryable: false,
      canPull: false,
    })
  })

  it("offers both gestures when there is more history", () => {
    const state = resolveDetailHistoryIndicatorPresentation(base)
    expect(state.code).toBe("ready")
    expect(state.text).toBe("下拉或上滑加载更早消息")
    expect(state.busy).toBe(false)
    expect(state.retryable).toBe(false)
    expect(state.canPull).toBe(true)
  })

  it("stops offering the pull gesture once history is exhausted", () => {
    const state = resolveDetailHistoryIndicatorPresentation({ ...base, hasMore: false })
    expect(state.code).toBe("exhausted")
    expect(state.text).toBe("没有更多历史了")
    // canPull 关掉 refresher-enabled。留着的话下拉能拽出一片空白却什么都不发生。
    expect(state.canPull).toBe(false)
  })

  describe("window coordinates not established yet", () => {
    // 用户报的原话：「刚打开详情页显示没有更多历史，过一会又变得可以加载历史」。
    //
    // 成因：`hasMore` 来自 `hasOlderConversationHistory`，它是
    // `Boolean(window && window.turns_offset > 0)` —— 窗口为 null（还不知道）与
    // 「真的翻到底」返回同一个 false。于是窗口探测回来之前，界面给出一个**错误的
    // 结论**，而且 `exhausted` 会把 canPull 关掉，用户连下拉验证都做不到。
    it("says it is still probing instead of claiming there is nothing older", () => {
      const state = resolveDetailHistoryIndicatorPresentation({
        ...base,
        hasMore: false,
        windowKnown: false,
      })

      expect(state.code).toBe("probing")
      expect(state.text).toBe("正在确认历史范围...")
      expect(state.busy).toBe(true)
      expect(state.retryable).toBe(false)
      // 窗口未知时 loadOlderTurns 的第一道守卫就会早退，给了手感也是空拽。
      expect(state.canPull).toBe(false)
    })

    it("keeps quiet about exhaustion even when a stale gesture is in flight", () => {
      // probing 必须排在手势分支之前：否则边缘回弹送来的一次 dy 会让文案变成
      // 「松手加载更早消息」，而那个请求发不出去。
      const state = resolveDetailHistoryIndicatorPresentation({
        ...base,
        hasMore: false,
        windowKnown: false,
        pullDistance: 200,
      })

      expect(state.code).toBe("probing")
    })

    it("still reports an in-flight page and the initial sync first", () => {
      // probing 排在 loading / initial-loading **之后**：那两个状态更具体。
      expect(
        resolveDetailHistoryIndicatorPresentation({
          ...base,
          hasMore: false,
          windowKnown: false,
          loadingOlder: true,
        }).code
      ).toBe("loading")

      expect(
        resolveDetailHistoryIndicatorPresentation({
          ...base,
          hasMore: false,
          windowKnown: false,
          initialLoading: true,
        }).code
      ).toBe("initial-loading")
    })

    it("defaults to trusting hasMore when windowKnown is omitted", () => {
      // 省略时按 true 处理，否则默认值会把所有既有调用点悄悄变成 probing。
      expect(
        resolveDetailHistoryIndicatorPresentation({ ...base, hasMore: false }).code
      ).toBe("exhausted")
      expect(resolveDetailHistoryIndicatorPresentation(base).code).toBe("ready")
    })

    it("reports exhausted once the window is known to cover everything", () => {
      // 真正翻到底：窗口已建立且 turns_offset === 0 → hasMore false。
      const state = resolveDetailHistoryIndicatorPresentation({
        ...base,
        hasMore: false,
        windowKnown: true,
      })

      expect(state.code).toBe("exhausted")
      expect(state.canPull).toBe(false)
    })
  })

  it("spins while an older page is in flight", () => {
    const state = resolveDetailHistoryIndicatorPresentation({ ...base, loadingOlder: true })
    expect(state.code).toBe("loading")
    expect(state.text).toBe("正在加载更早消息...")
    expect(state.busy).toBe(true)
  })

  it("lets the in-flight request outrank the pull gesture", () => {
    // 手指还按着但请求已经发出的那一瞬间，说「松手加载」是错的。
    const state = resolveDetailHistoryIndicatorPresentation({
      ...base,
      loadingOlder: true,
      pullDistance: 90,
    })
    expect(state.code).toBe("loading")
  })

  it("reports the initial sync before trusting hasMore", () => {
    // 首屏同步时窗口坐标可能还没建立，hasMore 因此是 false 却不代表真的没历史。
    // 这一条排在 exhausted 前面，否则会先闪一下「没有更多历史了」再变成可翻页。
    const state = resolveDetailHistoryIndicatorPresentation({
      ...base,
      hasMore: false,
      initialLoading: true,
    })
    expect(state.code).toBe("initial-loading")
    expect(state.text).toBe("初始历史加载中...")
    expect(state.busy).toBe(true)
  })

  it("switches the copy at the refresh threshold", () => {
    const pulling = resolveDetailHistoryIndicatorPresentation({ ...base, pullDistance: 55 })
    expect(pulling.code).toBe("pulling")
    expect(pulling.text).toBe("继续下拉加载更早消息")

    // 阈值是「>=」：56px 正好够，与 scroll-view 内部 `refresherHeight >= refresherThreshold`
    // 的判定同边界，否则文案说「继续下拉」而松手却真的发了请求。
    const release = resolveDetailHistoryIndicatorPresentation({ ...base, pullDistance: 56 })
    expect(release.code).toBe("release")
    expect(release.text).toBe("松手加载更早消息")
    expect(release.busy).toBe(false)
  })

  it("ignores the gesture when there is nothing older to fetch", () => {
    // hasMore 为假时 refresher-enabled 已经关掉，但边缘回弹仍可能送来一次 dy。
    // 此时必须继续显示 exhausted，不能变成「松手加载更早消息」。
    const state = resolveDetailHistoryIndicatorPresentation({
      ...base,
      hasMore: false,
      pullDistance: 200,
    })
    expect(state.code).toBe("exhausted")
  })

  it("keeps offering the pull gesture while the conversation is streaming", () => {
    // 用户否掉了「流式中禁止翻页」这条限制：回复正在生成时想往上看历史是正常需求。
    // 曾经为它加过一个 `blocked` 状态 + `volatile` 输入，现已连同
    // `loadOlderTurns` 的那道守卫一起删除。
    //
    // 指示器因此**不接受任何流式相关输入** —— 这条测试用「传了也没用」把它钉住：
    // 多余的键不会改变结果。
    const streaming = resolveDetailHistoryIndicatorPresentation({
      ...base,
      ...({ volatile: true } as Record<string, unknown>),
    })

    expect(streaming.code).toBe("ready")
    expect(streaming.canPull).toBe(true)
    expect(streaming.text).toBe("下拉或上滑加载更早消息")
  })

  it("keeps canPull false on the states that still report a pullable code", () => {
    // canPull 绑 refresher-enabled，必须与 loadOlderTurns 的守卫对应。守卫现在只剩
    // 一条（hasOlderConversationHistory），窗口未知同样让它发不出请求。
    //
    // 盯的是**仍然沿用共享 canPull 的**分支：loading / initial-loading 会把它原样
    // 透出去，若表达式漏了 windowKnown，refresher 就会在「拉了发不出请求」时保持启用。
    expect(
      resolveDetailHistoryIndicatorPresentation({
        ...base,
        windowKnown: false,
        initialLoading: true,
      }).canPull
    ).toBe(false)

    // 对照：同样是 loading，没有守卫成立时 canPull 应为 true。
    expect(
      resolveDetailHistoryIndicatorPresentation({ ...base, loadingOlder: true }).canPull
    ).toBe(true)
  })

  it("keeps a persistent, tappable retry entry after a failure", () => {
    // 原实现只 uni.showToast 一次 —— 吐司消失后界面上再没有任何重试入口。
    const state = resolveDetailHistoryIndicatorPresentation({
      ...base,
      errorMessage: "加载更早消息失败",
    })
    expect(state.code).toBe("error")
    expect(state.text).toBe("加载更早消息失败，点击重试")
    expect(state.retryable).toBe(true)
    expect(state.busy).toBe(false)
    // 失败没有动窗口坐标，所以下拉重试仍然可行。
    expect(state.canPull).toBe(true)
  })

  it("acknowledges a retry gesture instead of restating the error", () => {
    const state = resolveDetailHistoryIndicatorPresentation({
      ...base,
      errorMessage: "加载更早消息失败",
      pullDistance: 80,
    })
    expect(state.code).toBe("release")
    expect(state.text).toBe("松手重试")
    expect(state.retryable).toBe(false)
  })

  it("treats a blank error message as no error", () => {
    // historyLoadErrorMessage 用 ref("") 表示「没有错误」，而 toErrorMessage 在
    // 拿到空 message 的异常时也可能回落成空串。两者都不该渲染成「，点击重试」。
    const state = resolveDetailHistoryIndicatorPresentation({ ...base, errorMessage: "   " })
    expect(state.code).toBe("ready")
    expect(state.retryable).toBe(false)
  })

  it("never reports release when the threshold is missing", () => {
    // pullThreshold 缺省时内部 clamp 到 1，若不 clamp 会变成除零/恒真，
    // 任何一丝 dy 都会说「松手加载」。
    expect(
      resolveDetailHistoryIndicatorPresentation({
        hasMessages: true,
        hasMore: true,
        loadingOlder: false,
        initialLoading: false,
        pullDistance: 0,
      }).code,
    ).toBe("ready")
  })
})
