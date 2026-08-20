export function buildMessageListPageStyle(input: {
  viewportHeight: number
  topChromeHeight: number
  bottomComposerHeight: number
}) {
  const topChromeHeight = Math.max(0, Number(input.topChromeHeight || 0))
  const bottomComposerHeight = Math.max(0, Number(input.bottomComposerHeight || 0))
  const viewportBodyHeight = Math.max(0, Number(input.viewportHeight || 0) - topChromeHeight)
  if (
    topChromeHeight <= 0
    && bottomComposerHeight <= 0
    && viewportBodyHeight <= 0
  ) {
    return undefined
  }
  return {
    marginTop: `${topChromeHeight}px`,
    height: `${viewportBodyHeight}px`,
  }
}

export function buildMessageListContentStyle(bottomComposerHeightPx: number) {
  const bottomComposerHeight = Math.max(0, Number(bottomComposerHeightPx || 0))
  if (bottomComposerHeight <= 0) return undefined
  return {
    paddingBottom: `${bottomComposerHeight}px`,
  }
}

export function resolveDetailShellViewportHeight(input: {
  windowHeight: number
  navbarHeight: number
  hasNavbarPlaceholder?: boolean
}) {
  const windowHeight = Math.max(0, Number(input.windowHeight || 0))
  const navbarHeight = Math.max(0, Number(input.navbarHeight || 0))
  if (input.hasNavbarPlaceholder === true) {
    return Math.max(0, windowHeight - navbarHeight)
  }
  return windowHeight
}

export function resolveBottomComposerHeight(input: {
  composerStackHeight?: number | null
  inputStatusHeight?: number | null
  inputMainHeight?: number | null
  inputToolHeight?: number | null
  bottomOffset?: number | null
  fallbackGap?: number | null
}) {
  const composerStackHeight = Math.max(0, Number(input.composerStackHeight || 0))
  const bottomOffset = Math.max(0, Number(input.bottomOffset ?? 6))
  if (composerStackHeight > 0) return composerStackHeight + bottomOffset

  return (
    Math.max(0, Number(input.inputStatusHeight || 0)) +
    Math.max(0, Number(input.inputMainHeight || 0)) +
    Math.max(0, Number(input.inputToolHeight || 0)) +
    Math.max(0, Number(input.fallbackGap ?? 36))
  )
}

export function buildTopOffsetStyle(topOffsetPx: number) {
  return {
    top: `${Math.max(0, Number(topOffsetPx || 0))}px`,
  }
}

// 这里曾有 `buildHistoryStatusStyle`：把导航栏 + tab 条 + 工具栏的高度加起来，算出
// 「历史加载指示行」这个 `position: fixed` 元素该贴在哪。指示行现在是 scroll-view
// 内容流里的第一个子元素（`min-height: 64rpx`，见 index.scss `.history-status`），
// 跟着列表一起滚，不需要任何绝对坐标 —— 函数一并删掉，避免有人照着旧签名把它重新
// 接回去，那会让指示行又浮到第一条消息上面。
