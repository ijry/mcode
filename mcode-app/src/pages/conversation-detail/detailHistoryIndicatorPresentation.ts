export type DetailHistoryIndicatorCode =
  | "hidden"
  | "loading"
  | "initial-loading"
  | "probing"
  | "pulling"
  | "release"
  | "error"
  | "ready"
  | "exhausted"

export interface DetailHistoryIndicatorPresentation {
  code: DetailHistoryIndicatorCode
  /** 是否渲染这一行。`hidden` 之外恒为 true —— 行高固定，避免前插时高度抖动。 */
  visible: boolean
  text: string
  /** 是否转圈。只有真正在等网络的两个状态为 true。 */
  busy: boolean
  /** 点一下能重试。只有 `error` 为 true —— 其余状态点击必须无副作用。 */
  retryable: boolean
  /** scroll-view 的 `refresher-enabled` 取值：没有更早历史时不要给下拉手感。 */
  canPull: boolean
}

/**
 * 「加载更早历史」指示行的状态机。
 *
 * 为什么抽成纯模块：这一行同时被四个来源驱动（下拉手势、上滑到顶、初始同步、
 * 上一次失败），组合起来有 8 个状态。写在 `.vue` 的 computed 里既测不到也读不懂，
 * 而这一行的**文案与可点击性必须严格对应**：`ready` 状态下可点会让用户以为点击能翻页
 * （实际什么都不会发生），`error` 状态下不可点则等于把失败做成死胡同 ——
 * 原实现只 `uni.showToast` 一次，吐司消失后界面上再没有任何重试入口。
 *
 * 优先级从上到下，**顺序本身是需求**：
 *
 * 1. 空会话 → `hidden`。没有任何消息时既没有历史可翻，也不该显示「没有更多历史了」
 *    这种像是出错的话。
 * 2. `loadingOlder` → `loading`。正在等网络时压掉一切，包括下拉状态：手指还按着但请求
 *    已发出的那一瞬，说「松手加载」是错的。
 * 3. `initialLoading` → `initial-loading`。首屏历史还在同步，此时窗口坐标可能都还没建立
 *    （见 `ensureConversationHistoryWindow`），`hasMore` 不可信，所以必须排在
 *    `ready` / `exhausted` 前面 —— 否则会先闪一下「没有更多历史了」再变成可翻页。
 * 4. `windowKnown === false` → `probing`。**窗口坐标未知与「真的翻到底」是两种状态，
 *    不能共用 `hasMore: false`。** 详见下面 `windowKnown` 的说明。
 * 5. 手势状态（`pullDistance` / `pullThreshold`）→ `pulling` / `release`。
 * 6. `errorMessage` → `error`。排在手势后面：失败后用户再次下拉时应该看到「松手重试」的
 *    即时反馈，而不是仍然停在上一次的错误文案上。
 * 7. `hasMore` → `ready`，否则 `exhausted`。
 *
 * **`canPull` 必须与 `loadOlderTurns` 的早退守卫逐条对应。** 它绑到 scroll-view 的
 * `refresher-enabled`：给了手感却发不出请求，用户看到的就是「松手加载更早消息」之后
 * 毫无反应、连网络请求都没有。所以 `loadOlderTurns` 每新增一条早退条件，这里就要同步
 * 一个输入 —— 反过来也成立：**守卫被放宽时这里要一起放宽**。曾经为「流式中不能翻页」
 * 加过一个 `blocked` 状态，后来认定那条限制本身就不该存在（流式期间往上看历史是正常
 * 需求），状态与输入一并删除。
 */
export function resolveDetailHistoryIndicatorPresentation(input: {
  hasMessages: boolean
  hasMore: boolean
  loadingOlder: boolean
  initialLoading: boolean
  /**
   * 窗口坐标是否已经建立（`session.historyWindow != null`）。
   *
   * **这个字段的存在本身就是修一个 bug。** `hasMore` 来自
   * `hasOlderConversationHistory`，而它是 `Boolean(window && window.turns_offset > 0)`
   * —— 窗口为 `null`（还不知道有没有历史）和「真的翻到底了」返回同一个 `false`。
   * 于是刚进详情页那一小段时间里，界面显示「没有更多历史了」，等
   * `ensureConversationHistoryWindow` 探测回来才变成可翻页。用户报的原话：
   * 「刚打开详情页显示没有更多历史，过一会又变得可以加载历史」。
   *
   * 这不是文案不准的小问题：`exhausted` 还会把 `canPull` 关掉，用户既看到错误的
   * 结论，也没法自己下拉验证。
   *
   * `initialLoading` 挡不住它 —— 那个标志绑的是整页首屏 loading，而窗口探测是首屏
   * **之后**发出的独立请求，那时 `initialLoading` 早已是 false。
   *
   * 省略时按 `true` 处理（兼容既有调用点）：未知状态要显式声明才生效，避免默认值
   * 悄悄把所有调用点都变成 `probing`。
   */
  windowKnown?: boolean
  errorMessage?: string | null
  /** 当前下拉距离（px）。0 表示没有正在进行的手势。 */
  pullDistance?: number
  /** 触发刷新的下拉阈值（px），与 scroll-view 的 `refresher-threshold` 同一个值。 */
  pullThreshold?: number
}): DetailHistoryIndicatorPresentation {
  const errorMessage = String(input.errorMessage || "").trim()
  const windowKnown = input.windowKnown !== false
  // canPull 必须与 `loadOlderTurns` 的早退守卫**逐条对应** —— 它绑到
  // scroll-view 的 refresher-enabled，给了手感却发不出请求就是「松手后没反应」。
  const canPull = input.hasMessages && input.hasMore && windowKnown

  if (!input.hasMessages) {
    return {
      code: "hidden",
      visible: false,
      text: "",
      busy: false,
      retryable: false,
      canPull: false,
    }
  }

  if (input.loadingOlder) {
    return {
      code: "loading",
      visible: true,
      text: "正在加载更早消息...",
      busy: true,
      retryable: false,
      canPull,
    }
  }

  if (input.initialLoading) {
    return {
      code: "initial-loading",
      visible: true,
      text: "初始历史加载中...",
      busy: true,
      retryable: false,
      canPull,
    }
  }

  // 窗口坐标还没建立：既不能说「可以翻页」，更不能说「没有更多历史了」。
  // 这一条必须排在 exhausted 之前 —— 那正是用户看到的错误提示的来源。
  if (!windowKnown) {
    return {
      code: "probing",
      visible: true,
      text: "正在确认历史范围...",
      busy: true,
      retryable: false,
      // 窗口未知时下拉发不出请求（loadOlderTurns 的第一道守卫就是
      // hasOlderConversationHistory），给了手感也只是空拽一下。
      canPull: false,
    }
  }

  const threshold = Math.max(1, Number(input.pullThreshold || 0))
  const distance = Math.max(0, Number(input.pullDistance || 0))
  if (distance > 0 && canPull) {
    return distance >= threshold
      ? {
          code: "release",
          visible: true,
          text: errorMessage ? "松手重试" : "松手加载更早消息",
          busy: false,
          retryable: false,
          canPull,
        }
      : {
          code: "pulling",
          visible: true,
          text: "继续下拉加载更早消息",
          busy: false,
          retryable: false,
          canPull,
        }
  }

  if (errorMessage) {
    return {
      code: "error",
      visible: true,
      text: `${errorMessage}，点击重试`,
      busy: false,
      retryable: true,
      canPull,
    }
  }

  if (input.hasMore) {
    return {
      code: "ready",
      visible: true,
      text: "下拉或上滑加载更早消息",
      busy: false,
      retryable: false,
      canPull,
    }
  }

  return {
    code: "exhausted",
    visible: true,
    text: "没有更多历史了",
    busy: false,
    retryable: false,
    canPull: false,
  }
}
